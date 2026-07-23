-- Step 36: Seed field-level permissions (hidden / readonly)
-- Target: shared schema in polyaccess database
--
-- Adds field-level restrictions for the data-entry role:
--   orders.discount       → readonly (can_read=true, can_write=false)
--   employees.salary      → hidden   (can_read=false, can_write=false)
--   customers.balance     → readonly (can_read=true, can_write=false)
--
-- Admins and manager role bypass field restrictions entirely
-- (no rows needed — the API does admin detection).
--
-- Fields without explicit entries are implicitly visible and writable.

BEGIN;

-- Helper: upsert field permission
CREATE OR REPLACE FUNCTION shared.upsert_field_permission(
  p_role_name    TEXT,
  p_table_name   TEXT,
  p_field_name   TEXT,
  p_company_id   INT,
  p_can_read     BOOLEAN,
  p_can_write    BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_role_id INT;
BEGIN
  SELECT id INTO v_role_id FROM shared.roles WHERE name = p_role_name AND company_id = p_company_id;
  IF v_role_id IS NULL THEN
    RAISE WARNING 'Role not found: %', p_role_name;
    RETURN;
  END IF;

  INSERT INTO shared.field_permissions (role_id, table_name, field_name, company_id, can_read, can_write)
  VALUES (v_role_id, p_table_name, p_field_name, p_company_id, p_can_read, p_can_write)
  ON CONFLICT (role_id, table_name, field_name, company_id)
  DO UPDATE SET
    can_read  = EXCLUDED.can_read,
    can_write = EXCLUDED.can_write,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- data-entry: orders.discount → readonly
SELECT shared.upsert_field_permission('data-entry', 'orders', 'discount', 1, true, false);

-- data-entry: employees.salary → hidden
SELECT shared.upsert_field_permission('data-entry', 'employees', 'salary', 1, false, false);

-- data-entry: customers.balance → readonly
SELECT shared.upsert_field_permission('data-entry', 'customers', 'balance', 1, true, false);

-- Cleanup helper
DROP FUNCTION IF EXISTS shared.upsert_field_permission;

COMMIT;