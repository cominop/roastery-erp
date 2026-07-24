/**
 * permission-cache.cjs — in-memory permission cache with 5-minute TTL
 *
 * Provides a simple key-value cache where every entry carries an expiry
 * timestamp. Used by permission-middleware.cjs to short-circuit DB queries
 * for checkPermission and applyRowFilter.
 *
 * Cache key format:
 *   perm:{table}:{action}:{companyId}:{roleIds_sorted_and_joined}
 *   filter:{table}:{companyId}:{roleIds_sorted_and_joined}
 *
 * Invalidation:
 *   invalidateAll()       — drop everything (role/user/permission changes)
 *   invalidateTable(t)    — drop all entries whose key mentions table t
 *
 * TTL is configurable via constructor arg; default 5 minutes.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

class PermissionCache {
  /**
   * @param {number} [ttlMs=DEFAULT_TTL_MS] — entry lifetime in milliseconds
   */
  constructor(ttlMs = DEFAULT_TTL_MS) {
    /** @type {Map<string, { value: unknown, expiresAt: number }>} */
    this._store = new Map();
    this._ttlMs = ttlMs;
  }

  // ── Public API ────────────────────────────────────────

  /**
   * Retrieve a cached value.
   * @param {string} key
   * @returns {unknown | undefined} — undefined if missing or expired
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Store a value with TTL.
   * @param {string} key
   * @param {unknown} value
   */
  set(key, value) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + this._ttlMs,
    });
  }

  /**
   * Build a standardised cache key for permission checks.
   * @param {string} tableName
   * @param {string} action — 'select' | 'insert' | 'update' | 'delete'
   * @param {number[]} roleIds
   * @param {number} companyId
   * @returns {string}
   */
  permKey(tableName, action, roleIds, companyId) {
    const sorted = [...roleIds].sort((a, b) => a - b).join(",");
    return `perm:${tableName}:${action}:${companyId}:${sorted}`;
  }

  /**
   * Build a standardised cache key for row-filter lookups.
   * @param {string} tableName
   * @param {number[]} roleIds
   * @param {number} companyId
   * @returns {string}
   */
  filterKey(tableName, roleIds, companyId) {
    const sorted = [...roleIds].sort((a, b) => a - b).join(",");
    return `filter:${tableName}:${companyId}:${sorted}`;
  }

  /**
   * Invalidate all entries whose key contains the given table name.
   * Used after field-permission or row-filter writes for a specific table.
   * @param {string} tableName
   */
  invalidateTable(tableName) {
    for (const key of this._store.keys()) {
      if (key.includes(`:${tableName}:`)) {
        this._store.delete(key);
      }
    }
  }

  /**
   * Invalidate every cached entry (role CRUD, user assignment changes).
   */
  invalidateAll() {
    this._store.clear();
  }

  /**
   * Return the number of non-expired entries (for testing / diagnostics).
   * @returns {number}
   */
  get size() {
    this._evictExpired();
    return this._store.size;
  }

  // ── Internal helpers ──────────────────────────────────

  /** Remove expired entries from the store (called lazily on size()). */
  _evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
      }
    }
  }
}

module.exports = { PermissionCache, DEFAULT_TTL_MS };
