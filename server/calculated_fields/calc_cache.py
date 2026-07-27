"""LRU cache with TTL for aggregate calculation results.

Provides a simple key-value cache where every entry carries an expiry
timestamp and entries are moved to front on access (LRU semantics).

Cache key format:
  {table_name}:{calc_field_name}:{record_id}

Invalidation:
  invalidate(key)         — remove a specific key
  invalidate_all()        — drop everything
  invalidate_table(name)  — drop all entries whose key starts with `name:`

Thread-safe using threading.Lock.
TTL is configurable via constructor arg; default 30 seconds.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any


DEFAULT_TTL_SECONDS = 30


class CalcCache:
    """LRU cache with per-key TTL for calculated field results.

    Args:
        max_size: Maximum number of entries (default 500).
        ttl_seconds: Entry lifetime in seconds (default 30).
    """

    def __init__(self, max_size: int = 500, ttl_seconds: float = DEFAULT_TTL_SECONDS) -> None:
        self._store: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._max_size = max_size
        self._ttl_seconds = ttl_seconds
        self._lock = threading.Lock()

    # ── Public API ──────────────────────────────────────────

    def get(self, key: str) -> Any | None:
        """Return cached value if exists and not expired.

        Moves the entry to the end (most-recently-used position)
        on access.

        Args:
            key: Cache key.

        Returns:
            The cached value, or None if missing or expired.
        """
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None

            value, expires_at = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return None

            # Move to end (most recently used)
            self._store.move_to_end(key)
            return value

    def set(self, key: str, value: Any) -> None:
        """Cache a value with current timestamp + TTL.

        If the cache is at max capacity, evicts the least recently
        used entry (first in OrderedDict) before inserting.

        Args:
            key: Cache key.
            value: Value to cache.
        """
        with self._lock:
            # Evict LRU if at capacity and key doesn't already exist
            if key not in self._store and len(self._store) >= self._max_size:
                self._store.popitem(last=False)  # FIFO = LRU

            expires_at = time.monotonic() + self._ttl_seconds
            self._store[key] = (value, expires_at)
            self._store.move_to_end(key)

    def invalidate(self, key: str) -> None:
        """Remove a specific key from cache.

        Args:
            key: Cache key to remove.
        """
        with self._lock:
            self._store.pop(key, None)

    def invalidate_all(self) -> None:
        """Clear all cached values."""
        with self._lock:
            self._store.clear()

    def invalidate_table(self, table_name: str) -> None:
        """Invalidate all cache entries for a given table (key prefix match).

        Entries with keys starting with ``{table_name}:`` are removed.

        Args:
            table_name: Table name to invalidate.
        """
        prefix = f"{table_name}:"
        with self._lock:
            keys_to_delete = [k for k in self._store if k.startswith(prefix)]
            for k in keys_to_delete:
                del self._store[k]

    # ── Diagnostic ─────────────────────────────────────────

    @property
    def size(self) -> int:
        """Return the number of non-expired entries."""
        self._evict_expired()
        with self._lock:
            return len(self._store)

    def __len__(self) -> int:
        return self.size

    # ── Internal ───────────────────────────────────────────

    def _evict_expired(self) -> None:
        """Remove all expired entries from the store."""
        now = time.monotonic()
        with self._lock:
            expired = [k for k, (_, expires_at) in self._store.items() if now > expires_at]
            for k in expired:
                del self._store[k]
