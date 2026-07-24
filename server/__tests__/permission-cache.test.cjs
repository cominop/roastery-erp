/**
 * permission-cache.test.cjs — tests for PermissionCache
 *
 * Run: node server/permission-cache.test.cjs
 */

const { PermissionCache } = require("../permission-cache.cjs");

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

// ─── Fixtures ─────────────────────────────────────────

const roleIds = [3, 1, 2]; // deliberately unsorted to test sorting

// ─── Test: basic set/get ──────────────────────────────
(async () => {
  console.log("\n--- PermissionCache tests ---\n");

  // 1. Basic set/get
  {
    const c = new PermissionCache(60_000);
    c.set("key1", true);
    assert("get returns cached value", c.get("key1") === true);
  }

  // 2. Missing key returns undefined
  {
    const c = new PermissionCache(60_000);
    assert("missing key returns undefined", c.get("nope") === undefined);
  }

  // 3. TTL expiry
  {
    const c = new PermissionCache(1); // 1 ms TTL
    c.set("key1", "value");
    // Wait for expiry
    await new Promise((r) => setTimeout(r, 5));
    assert("expired entry returns undefined", c.get("key1") === undefined);
  }

  // 4. size accounts for non-expired entries only
  {
    const c = new PermissionCache(10_000);
    c.set("a", 1);
    c.set("b", 2);
    assert("size returns 2", c.size === 2);
  }

  // 5. size excludes expired entries
  {
    const c = new PermissionCache(1);
    c.set("a", 1);
    await new Promise((r) => setTimeout(r, 5));
    c.set("b", 2); // fresh
    assert("size excludes expired entries", c.size === 1);
  }

  // 6. permKey sorts roleIds
  {
    const c = new PermissionCache();
    const key1 = c.permKey("orders", "select", [3, 1, 2], 1);
    const key2 = c.permKey("orders", "select", [1, 2, 3], 1);
    assert("permKey is order-independent", key1 === key2);
    assert("permKey format", key1.startsWith("perm:orders:select:1:"));
    assert("permKey contains sorted ids", key1.endsWith("1,2,3"));
  }

  // 7. filterKey sorts roleIds
  {
    const c = new PermissionCache();
    const key1 = c.filterKey("orders", [3, 1, 2], 1);
    const key2 = c.filterKey("orders", [1, 2, 3], 1);
    assert("filterKey is order-independent", key1 === key2);
    assert("filterKey format", key1.startsWith("filter:orders:1:"));
  }

  // 8. permKey is different from filterKey
  {
    const c = new PermissionCache();
    const pk = c.permKey("orders", "select", [1], 1);
    const fk = c.filterKey("orders", [1], 1);
    assert("permKey and filterKey differ", pk !== fk);
  }

  // 9. invalidateTable removes entries for that table
  {
    const c = new PermissionCache();
    c.set(c.permKey("orders", "select", [1], 1), true);
    c.set(c.permKey("orders", "insert", [1], 1), false);
    c.set(c.permKey("inventory", "select", [1], 1), true);
    assert("size 3 before invalidation", c.size === 3);

    c.invalidateTable("orders");
    assert("size 1 after invalidating orders", c.size === 1);
    // The remaining entry should be for "inventory"
    const remainingKeys = [...c._store.keys()];
    assert("remaining key contains inventory", remainingKeys[0].includes("inventory"));
  }

  // 10. invalidateAll clears everything
  {
    const c = new PermissionCache();
    c.set("a", 1);
    c.set("b", 2);
    c.invalidateAll();
    assert("size 0 after invalidateAll", c.size === 0);
  }

  // 11. overwriting an entry refreshes its TTL
  {
    const c = new PermissionCache(10_000);
    c.set("key1", "old");
    c.set("key1", "new");
    assert("overwritten entry returns new value", c.get("key1") === "new");
  }

  // 12. Different companyIds produce different keys
  {
    const c = new PermissionCache();
    const key1 = c.permKey("orders", "select", [1], 1);
    const key2 = c.permKey("orders", "select", [1], 2);
    assert("different companyId → different key", key1 !== key2);
  }

  // ─── Summary ─────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
