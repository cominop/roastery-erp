/**
 * seed-permissions.test.cjs — verify Step 41 seed: 7 built-in roles + permissions
 *
 * Run: node server/__tests__/seed-permissions.test.cjs
 *
 * Checks:
 *   1. All 7 built-in roles exist with is_system=true
 *   2. Each role has table_permissions entries
 *   3. Sensitive field permissions are set
 *   4. Row filters are seeded
 *   5. Admin role has no explicit permission rows (bypass)
 */

const { Pool } = require("pg");

const pool = new Pool({ database: "polyaccess" });

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

(async () => {
  console.log("\n--- Step 41: Seed Permissions Verification ---\n");

  // ─── 1. All 7 built-in roles exist ────────────────────
  {
    const { rows } = await pool.query(
      `SELECT id, name, is_system FROM shared.roles
       WHERE company_id = 1 AND is_active = true
       ORDER BY name`
    );
    const names = rows.map((r) => r.name);
    const expected = ["admin", "data-entry", "inventory", "manager", "production", "read-only", "reports"];

    assert("7 built-in roles exist", rows.length === 7);
    assert("all expected role names present", expected.every((n) => names.includes(n)));

    // All 7 must be system roles
    const allSystem = rows.every((r) => r.is_system === true);
    assert("all 7 roles are is_system=true", allSystem);
  }

  // ─── 2. Fetch role IDs for subsequent checks ──────────
  const { rows: roleRows } = await pool.query(
    `SELECT id, name FROM shared.roles WHERE company_id = 1`
  );
  const roleMap = {};
  for (const r of roleRows) {
    roleMap[r.name] = r.id;
  }

  // ─── 3. Each role has table_permissions entries ────────
  {
    for (const [name, id] of Object.entries(roleMap)) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM shared.table_permissions
         WHERE role_id = $1 AND company_id = 1`,
        [id]
      );
      const count = rows[0].cnt;

      if (name === "admin") {
        // Admin bypasses checks — no explicit entries needed
        assert(`admin has 0 table_permission rows (bypass)`, count === 0);
      } else {
        assert(`${name} has table_permissions (${count} rows)`, count > 0);
      }
    }
  }

  // ─── 4. Verify specific table permissions per role ────
  {
    // Manager should have CRUD on orders
    const { rows } = await pool.query(
      `SELECT can_select, can_insert, can_update, can_delete
       FROM shared.table_permissions
       WHERE role_id = $1 AND table_name = 'orders' AND company_id = 1`,
      [roleMap["manager"]]
    );
    assert("manager has CRUD on orders", rows.length === 1);
    assert("manager can_select orders", rows[0].can_select === true);
    assert("manager can_insert orders", rows[0].can_insert === true);
    assert("manager can_update orders", rows[0].can_update === true);
    assert("manager can_delete orders", rows[0].can_delete === true);
  }

  {
    // data-entry should NOT have delete on orders
    const { rows } = await pool.query(
      `SELECT can_delete FROM shared.table_permissions
       WHERE role_id = $1 AND table_name = 'orders' AND company_id = 1`,
      [roleMap["data-entry"]]
    );
    assert("data-entry has orders entry", rows.length === 1);
    assert("data-entry cannot delete orders", rows[0].can_delete === false);
  }

  {
    // read-only should have SELECT only on orders
    const { rows } = await pool.query(
      `SELECT can_select, can_insert, can_update, can_delete
       FROM shared.table_permissions
       WHERE role_id = $1 AND table_name = 'orders' AND company_id = 1`,
      [roleMap["read-only"]]
    );
    assert("read-only has orders entry", rows.length === 1);
    assert("read-only can_select orders", rows[0].can_select === true);
    assert("read-only cannot insert orders", rows[0].can_insert === false);
    assert("read-only cannot update orders", rows[0].can_update === false);
    assert("read-only cannot delete orders", rows[0].can_delete === false);
  }

  {
    // production should have CRUD on roastbatches (no delete)
    const { rows } = await pool.query(
      `SELECT can_select, can_insert, can_update, can_delete
       FROM shared.table_permissions
       WHERE role_id = $1 AND table_name = 'roastbatches' AND company_id = 1`,
      [roleMap["production"]]
    );
    assert("production has roastbatches entry", rows.length === 1);
    assert("production can_select roastbatches", rows[0].can_select === true);
    assert("production can_insert roastbatches", rows[0].can_insert === true);
    assert("production can_update roastbatches", rows[0].can_update === true);
    assert("production cannot delete roastbatches", rows[0].can_delete === false);
  }

  {
    // inventory should have CRUD on products (no delete)
    const { rows } = await pool.query(
      `SELECT can_select, can_insert, can_update, can_delete
       FROM shared.table_permissions
       WHERE role_id = $1 AND table_name = 'products' AND company_id = 1`,
      [roleMap["inventory"]]
    );
    assert("inventory has products entry", rows.length === 1);
    assert("inventory can_select products", rows[0].can_select === true);
    assert("inventory can_insert products", rows[0].can_insert === true);
    assert("inventory can_update products", rows[0].can_update === true);
    assert("inventory cannot delete products", rows[0].can_delete === false);
  }

  {
    // reports should have SELECT-only on analytical tables
    const { rows } = await pool.query(
      `SELECT can_select, can_insert, can_update, can_delete
       FROM shared.table_permissions
       WHERE role_id = $1 AND table_name = 'salescloses' AND company_id = 1`,
      [roleMap["reports"]]
    );
    assert("reports has salescloses entry", rows.length === 1);
    assert("reports can_select salescloses", rows[0].can_select === true);
    assert("reports cannot insert salescloses", rows[0].can_insert === false);
    assert("reports cannot delete salescloses", rows[0].can_delete === false);
  }

  // ─── 5. Field permissions for sensitive fields ────────
  {
    // data-entry: employees.salary should be hidden
    const { rows } = await pool.query(
      `SELECT can_read, can_write FROM shared.field_permissions
       WHERE role_id = $1 AND table_name = 'employees' AND field_name = 'salary' AND company_id = 1`,
      [roleMap["data-entry"]]
    );
    assert("data-entry has employees.salary field permission", rows.length === 1);
    assert("data-entry cannot read employees.salary", rows[0].can_read === false);
    assert("data-entry cannot write employees.salary", rows[0].can_write === false);
  }

  {
    // production: employees.salary should be hidden
    const { rows } = await pool.query(
      `SELECT can_read, can_write FROM shared.field_permissions
       WHERE role_id = $1 AND table_name = 'employees' AND field_name = 'salary' AND company_id = 1`,
      [roleMap["production"]]
    );
    assert("production has employees.salary field permission", rows.length === 1);
    assert("production cannot read employees.salary", rows[0].can_read === false);
  }

  {
    // inventory: employees.salary should be hidden
    const { rows } = await pool.query(
      `SELECT can_read, can_write FROM shared.field_permissions
       WHERE role_id = $1 AND table_name = 'employees' AND field_name = 'salary' AND company_id = 1`,
      [roleMap["inventory"]]
    );
    assert("inventory has employees.salary field permission", rows.length === 1);
    assert("inventory cannot read employees.salary", rows[0].can_read === false);
  }

  {
    // reports: employees.salary should be hidden
    const { rows } = await pool.query(
      `SELECT can_read, can_write FROM shared.field_permissions
       WHERE role_id = $1 AND table_name = 'employees' AND field_name = 'salary' AND company_id = 1`,
      [roleMap["reports"]]
    );
    assert("reports has employees.salary field permission", rows.length === 1);
    assert("reports cannot read employees.salary", rows[0].can_read === false);
  }

  {
    // manager: employees.ssn should be hidden
    const { rows } = await pool.query(
      `SELECT can_read FROM shared.field_permissions
       WHERE role_id = $1 AND table_name = 'employees' AND field_name = 'ssn' AND company_id = 1`,
      [roleMap["manager"]]
    );
    assert("manager has employees.ssn field permission", rows.length === 1);
    assert("manager cannot read employees.ssn", rows[0].can_read === false);
  }

  // ─── 6. Row filters ──────────────────────────────────
  {
    // production: workorders row filter
    const { rows } = await pool.query(
      `SELECT filter_sql, enabled FROM shared.row_filters
       WHERE role_id = $1 AND table_name = 'workorders' AND company_id = 1`,
      [roleMap["production"]]
    );
    assert("production has workorders row filter", rows.length >= 1);
    const active = rows.filter((r) => r.enabled);
    assert("production workorders filter is enabled", active.length >= 1);
  }

  {
    // inventory: products row filter
    const { rows } = await pool.query(
      `SELECT filter_sql, enabled FROM shared.row_filters
       WHERE role_id = $1 AND table_name = 'products' AND company_id = 1`,
      [roleMap["inventory"]]
    );
    assert("inventory has products row filter", rows.length >= 1);
    const active = rows.filter((r) => r.enabled);
    assert("inventory products filter is enabled", active.length >= 1);
  }

  // ─── 7. Admin has no permission rows ──────────────────
  {
    const { rows: tblPerms } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM shared.table_permissions
       WHERE role_id = $1 AND company_id = 1`,
      [roleMap["admin"]]
    );
    assert("admin has no table_permissions (bypass)", tblPerms[0].cnt === 0);

    const { rows: fldPerms } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM shared.field_permissions
       WHERE role_id = $1 AND company_id = 1`,
      [roleMap["admin"]]
    );
    assert("admin has no field_permissions (bypass)", fldPerms[0].cnt === 0);

    const { rows: rwFilters } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM shared.row_filters
       WHERE role_id = $1 AND company_id = 1`,
      [roleMap["admin"]]
    );
    assert("admin has no row_filters (bypass)", rwFilters[0].cnt === 0);
  }

  // ─── Summary ─────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  await pool.end();
  if (failed > 0) process.exit(1);
})();