-- Step 34: Seed permissions — user_roles + table_permissions
-- Target: shared schema in polyaccess database
--
-- Assigns default roles to employees and seeds table-level permissions
-- for the data-entry and read-only roles. The admin role bypasses
-- checks entirely via middleware logic so it doesn't need explicit rows.

BEGIN;

-- ============================================================
-- 1. User → Role assignments
-- ============================================================

-- Admin: Meghan Miles (employeeid=1)
INSERT INTO shared.user_roles (user_id, role_id, company_id, assigned_by)
SELECT 1, r.id, 1, 1
FROM shared.roles r
WHERE r.name = 'admin' AND r.company_id = 1
  AND NOT EXISTS (SELECT 1 FROM shared.user_roles WHERE user_id = 1 AND role_id = r.id AND company_id = 1);

-- Data-entry: Brooke McClelland (employeeid=2)
INSERT INTO shared.user_roles (user_id, role_id, company_id, assigned_by)
SELECT 2, r.id, 1, 1
FROM shared.roles r
WHERE r.name = 'data-entry' AND r.company_id = 1
  AND NOT EXISTS (SELECT 1 FROM shared.user_roles WHERE user_id = 2 AND role_id = r.id AND company_id = 1);

-- Read-only: Tim Dudley (employeeid=3)
INSERT INTO shared.user_roles (user_id, role_id, company_id, assigned_by)
SELECT 3, r.id, 1, 1
FROM shared.roles r
WHERE r.name = 'read-only' AND r.company_id = 1
  AND NOT EXISTS (SELECT 1 FROM shared.user_roles WHERE user_id = 3 AND role_id = r.id AND company_id = 1);

-- ============================================================
-- 2. Table permissions — data-entry role
--    Select/Insert/Update on orders, order_details, customers, products
-- ============================================================

-- Helper: upsert table permission (insert or update on conflict)
CREATE OR REPLACE FUNCTION shared.upsert_table_permission(
  p_role_name    TEXT,
  p_table_name   TEXT,
  p_company_id   INT,
  p_can_select   BOOLEAN,
  p_can_insert   BOOLEAN,
  p_can_update   BOOLEAN,
  p_can_delete   BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_role_id INT;
BEGIN
  SELECT id INTO v_role_id FROM shared.roles WHERE name = p_role_name AND company_id = p_company_id;
  IF v_role_id IS NULL THEN
    RAISE WARNING 'Role not found: %', p_role_name;
    RETURN;
  END IF;

  INSERT INTO shared.table_permissions (role_id, table_name, company_id, can_select, can_insert, can_update, can_delete)
  VALUES (v_role_id, p_table_name, p_company_id, p_can_select, p_can_insert, p_can_update, p_can_delete)
  ON CONFLICT (role_id, table_name, company_id)
  DO UPDATE SET
    can_select = EXCLUDED.can_select,
    can_insert = EXCLUDED.can_insert,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- data-entry: CRUD on core transaction tables
SELECT shared.upsert_table_permission('data-entry', 'orders',           1, true, true, true, false);
SELECT shared.upsert_table_permission('data-entry', 'order_details',    1, true, true, true, false);
SELECT shared.upsert_table_permission('data-entry', 'customers',        1, true, true, true, false);
SELECT shared.upsert_table_permission('data-entry', 'products',         1, true, true, true, false);

-- data-entry: read-only on supporting tables
SELECT shared.upsert_table_permission('data-entry', 'employees',        1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'payments',         1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'shipping_methods', 1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'category',         1, true, false, false, false);

-- ============================================================
-- 3. Table permissions — read-only role
--    Select on all tables
-- ============================================================

-- Bulk insert for read-only: select=true on every db_fcc_erp table
INSERT INTO shared.table_permissions (role_id, table_name, company_id, can_select, can_insert, can_update, can_delete)
SELECT r.id, t.tablename, 1, true, false, false, false
FROM shared.roles r
CROSS JOIN (
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'db_fcc_erp' AND LEFT(tablename, 1) != '_'
) t
WHERE r.name = 'read-only' AND r.company_id = 1
  AND NOT EXISTS (
    SELECT 1 FROM shared.table_permissions tp
    WHERE tp.role_id = r.id AND tp.table_name = t.tablename AND tp.company_id = 1
  );

-- ============================================================
-- 4. Table permissions — manager role (select on everything, CRUD on operational)
-- ============================================================

-- Manager: select on all tables
INSERT INTO shared.table_permissions (role_id, table_name, company_id, can_select, can_insert, can_update, can_delete)
SELECT r.id, t.tablename, 1, true, false, false, false
FROM shared.roles r
CROSS JOIN (
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'db_fcc_erp' AND LEFT(tablename, 1) != '_'
) t
WHERE r.name = 'manager' AND r.company_id = 1
  AND NOT EXISTS (
    SELECT 1 FROM shared.table_permissions tp
    WHERE tp.role_id = r.id AND tp.table_name = t.tablename AND tp.company_id = 1
  );

-- Manager: CRUD on operational tables
SELECT shared.upsert_table_permission('manager', 'orders',           1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'order_details',    1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'customers',        1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'products',         1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'employees',        1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'payments',         1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'workorders',       1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'roastbatches',     1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'roastsessions',    1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'inventory',        1, true, true, true, false);

-- ============================================================
-- 5. shared.objects access — needed for forms, nav, settings
-- ============================================================

-- All non-admin roles need select on shared.objects to see forms
INSERT INTO shared.table_permissions (role_id, table_name, company_id, can_select, can_insert, can_update, can_delete)
SELECT r.id, 'shared.objects', 1, true, false, false, false
FROM shared.roles r
WHERE r.company_id = 1
  AND r.name != 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM shared.table_permissions tp
    WHERE tp.role_id = r.id AND tp.table_name = 'shared.objects' AND tp.company_id = 1
  );

-- ============================================================
-- 6. Cleanup helper function
-- ============================================================

DROP FUNCTION IF EXISTS shared.upsert_table_permission;

COMMIT;