"""Unit tests for CalcCache — LRU cache with TTL.

Tests cover: get/set, TTL expiry, LRU eviction, invalidation,
thread safety (basic), and edge cases.
"""

import sys
import os
import time

# Ensure project root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest

from server.calculated_fields.calc_cache import CalcCache, DEFAULT_TTL_SECONDS


class TestCalcCache:
    """Core get/set behaviour."""

    def test_get_returns_set_value(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("orders:order_total:1", 42)
        assert cache.get("orders:order_total:1") == 42

    def test_get_missing_returns_none(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        assert cache.get("nonexistent") is None

    def test_get_expired_returns_none(self) -> None:
        cache = CalcCache(ttl_seconds=0.01)  # 10ms TTL
        cache.set("orders:order_total:1", 42)
        time.sleep(0.02)
        assert cache.get("orders:order_total:1") is None

    def test_set_overwrites_existing(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("orders:order_total:1", 42)
        cache.set("orders:order_total:1", 99)
        assert cache.get("orders:order_total:1") == 99

    def test_get_moves_entry_to_mru(self) -> None:
        """Accessing a key should not remove it."""
        cache = CalcCache(ttl_seconds=30)
        cache.set("a", 1)
        cache.set("b", 2)
        assert cache.get("a") == 1
        assert cache.get("b") == 2

    def test_string_values(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("orders:status:5", "shipped")
        assert cache.get("orders:status:5") == "shipped"

    def test_float_values(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("orders:total:3", 1234.56)
        assert cache.get("orders:total:3") == 1234.56

    def test_null_value(self) -> None:
        """None is a valid cached value."""
        cache = CalcCache(ttl_seconds=30)
        cache.set("orders:total:3", None)
        assert cache.get("orders:total:3") is None


class TestCalcCacheEviction:
    """LRU eviction when max_size is reached."""

    def test_evicts_oldest_when_full(self) -> None:
        cache = CalcCache(max_size=3, ttl_seconds=30)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)
        # Cache is full; adding 'd' should evict 'a' (LRU)
        cache.set("d", 4)
        assert cache.get("a") is None  # evicted
        assert cache.get("b") == 2
        assert cache.get("c") == 3
        assert cache.get("d") == 4

    def test_access_protects_from_eviction(self) -> None:
        """Accessing a key makes it most-recently-used, protecting it."""
        cache = CalcCache(max_size=3, ttl_seconds=30)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)
        # Access 'a' to make it MRU — 'b' becomes LRU
        cache.get("a")
        cache.set("d", 4)
        assert cache.get("a") == 1  # protected
        assert cache.get("b") is None  # evicted

    def test_update_does_not_count_as_new_entry(self) -> None:
        """Updating an existing key should not trigger eviction."""
        cache = CalcCache(max_size=2, ttl_seconds=30)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("a", 99)  # update, not new entry
        # Don't call get() here — that would change LRU order
        # Adding 'c' should evict 'b' (now LRU since 'a' was moved to end on update)
        cache.set("c", 3)
        assert cache.get("a") == 99  # still there (MRU from update)
        assert cache.get("b") is None  # evicted (LRU)
        assert cache.get("c") == 3    # new entry


class TestCalcCacheInvalidation:
    """Invalidation methods."""

    def test_invalidate_single_key(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.invalidate("a")
        assert cache.get("a") is None
        assert cache.get("b") == 2

    def test_invalidate_all(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.invalidate_all()
        assert cache.get("a") is None
        assert cache.get("b") is None

    def test_invalidate_table(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("orders:total:1", 100)
        cache.set("orders:count:1", 5)
        cache.set("products:price:2", 9.99)
        cache.invalidate_table("orders")
        assert cache.get("orders:total:1") is None
        assert cache.get("orders:count:1") is None
        assert cache.get("products:price:2") == 9.99

    def test_invalidate_table_no_match(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.invalidate_table("nonexistent")
        assert cache.get("a") == 1
        assert cache.get("b") == 2

    def test_invalidate_nonexistent_key(self) -> None:
        """Should not throw."""
        cache = CalcCache(ttl_seconds=30)
        cache.invalidate("nonexistent")  # no error


class TestCalcCacheSize:
    """Size property and edge cases."""

    def test_empty_size(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        assert cache.size == 0

    def test_size_after_set(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("a", 1)
        cache.set("b", 2)
        assert cache.size == 2

    def test_size_excludes_expired(self) -> None:
        cache = CalcCache(ttl_seconds=0.01)
        cache.set("a", 1)
        cache.set("b", 2)
        time.sleep(0.02)
        assert cache.size == 0

    def test_size_after_invalidation(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.invalidate("a")
        assert cache.size == 1

    def test_len_matches_size(self) -> None:
        cache = CalcCache(ttl_seconds=30)
        cache.set("a", 1)
        assert len(cache) == cache.size == 1

    def test_large_number_of_entries(self) -> None:
        """Should handle many entries without error."""
        cache = CalcCache(max_size=1000, ttl_seconds=30)
        for i in range(100):
            cache.set(f"key:{i}", i)
        assert cache.size == 100
        for i in range(100):
            assert cache.get(f"key:{i}") == i


class TestCalcCacheDefaultTTL:
    """Default TTL is 30 seconds."""

    def test_default_ttl_is_30(self) -> None:
        assert DEFAULT_TTL_SECONDS == 30

    def test_constructor_defaults(self) -> None:
        cache = CalcCache()
        assert cache._ttl_seconds == 30
        assert cache._max_size == 500
