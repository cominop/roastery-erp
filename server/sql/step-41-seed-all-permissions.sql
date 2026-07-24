-- Step 41: Seed default permissions for all 7 built-in roles
-- Target: shared schema in polyaccess database
--
-- Adds the missing roles (production, inventory) and seeds comprehensive
-- table_permissions, field_permissions, and row_filters for every role.
-- Idempotent — safe to re-run.
--
-- Role hierarchy:
--   1. admin       — Full bypass (no rows needed in permission tables)
--   2. manager     — Read/write on operational tables, read on everything
--   3. data-entry  — Insert/update on transaction tables, no delete
--   4. read-only   — View-only on all non-sensitive tables
--   5. reports     — Read-only on analytical/report tables
--   6. production  — CRUD on production floor tables (roasting, work orders)
--   7. inventory   — CRUD on inventory/catalog tables (products, packaging)

BEGIN;

-- ============================================================
-- 1. Add missing roles (idempotent)
-- ============================================================

INSERT INTO shared.roles (name, description, company_id, is_system) VALUES
    ('production', 'Production floor — manage roasting sessions, work orders, batch tracking', 1, true),
    ('inventory',  'Inventory management — manage products, packaging, parts, stock adjustments', 1, true)
ON CONFLICT (company_id, name) DO NOTHING;

-- ============================================================
-- 2. Helper: upsert table permission (insert or update on conflict)
-- ============================================================

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

-- ============================================================
-- 3. Helper: upsert field permission
-- ============================================================

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

-- ============================================================
-- 4. Helper: upsert row filter
-- ============================================================

CREATE OR REPLACE FUNCTION shared.upsert_row_filter(
  p_role_name        TEXT,
  p_table_name       TEXT,
  p_company_id       INT,
  p_filter_condition JSONB,
  p_filter_sql       TEXT,
  p_description      TEXT
) RETURNS VOID AS $$
DECLARE
  v_role_id INT;
BEGIN
  SELECT id INTO v_role_id FROM shared.roles WHERE name = p_role_name AND company_id = p_company_id;
  IF v_role_id IS NULL THEN
    RAISE WARNING 'Role not found: %', p_role_name;
    RETURN;
  END IF;

  INSERT INTO shared.row_filters (role_id, table_name, company_id, filter_condition, filter_sql, description, enabled)
  VALUES (v_role_id, p_table_name, p_company_id, p_filter_condition, p_filter_sql, p_description, true)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. TABLE PERMISSIONS
-- ============================================================
--
-- Pattern: each role gets SELECT on all tables they need to see,
-- plus CRUD on their operational tables. The admin role has no
-- entries — middleware bypasses checks entirely for admin.
--
-- Table categories used below:
--   CORE:      category, discount, format, grind, payment_methods,
--              shipping_methods, shipping_service_class, standard_emails
--   TRANSACT:  orders, order_details, customers, payments
--   PRODUCTS:  products, packaging, parts, assets
--   PRODUCTION: roastbatches, roastsessions, cleaningsessions,
--               workorders, workorder_labor, workorder_parts,
--               coffeeproductioncosts
--   RECIPES:   coffeeingredients, coffeerecipes, coffeerecipeingredients
--   HR:        employees, emp_hrs, emp_hrs_detail, employeetasks,
--              employeesubtasks, employeestatus
--   SALES:     salescloses, salesopens, salesimplication,
--              salesneedpayoff, salesproblem, salessituation
--   PIPELINE:  valuesassessment, valuespipeline, valuesprobability,
--              valuesstatus, brokers, bids
--   MISC:      assets, marketingsites, onlineassets,
--              fundraisingproducts, deficiencylog,
--              my_company_information
--   ERROR:     conversion_errors, paste_errors, customers_exporterrors,
--              orders_exporterrors, orders_exporterrors1, orderstemp,
--              orderdetailstemp, no_dupes_crfa_list_2009, old__products,
--              ottawanamesdeletemenowgo, erp_dev, switchboard_items1,
--              crfa_list_2009, proposal_text_h1, dbpriceupdate,
--              coffeeproductioncosts
--   (Error/legacy tables are excluded from seeds — they should not be
--    accessed by any non-admin role. Only add explicit entries if a
--    form references them.)

-- ──────── 5a. MANAGER role ──────────────────────────────────
-- Select on all tables (done in step-34, skipping repeat).
-- CRUD on operational tables (already seeded in step-34).
-- Add remaining operational CRUD:

-- Manager: CRUD on production tables
SELECT shared.upsert_table_permission('manager', 'cleaningsessions',    1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'coffeeproductioncosts', 1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'coffeerecipes',       1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'coffeeingredients',   1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'coffeerecipeingredients', 1, true, true, true, false);

-- Manager: CRUD on sales/pipeline tables
SELECT shared.upsert_table_permission('manager', 'salescloses',         1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'salesopens',          1, true, true, true, true);
SELECT shared.upsert_table_permission('manager', 'salesimplication',    1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'salesneedpayoff',     1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'salesproblem',        1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'salessituation',      1, true, true, true, false);

-- Manager: CRUD on HR tables
SELECT shared.upsert_table_permission('manager', 'employees',           1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'emp_hrs',             1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'emp_hrs_detail',      1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'employeetasks',       1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'employeesubtasks',    1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'employeestatus',      1, true, true, true, false);

-- Manager: CRUD on pipeline
SELECT shared.upsert_table_permission('manager', 'valuesassessment',    1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'valuespipeline',      1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'valuesprobability',   1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'valuesstatus',        1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'brokers',             1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'bids',                1, true, true, true, false);

-- Manager: CRUD on marketing/assets
SELECT shared.upsert_table_permission('manager', 'marketingsites',      1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'onlineassets',        1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'fundraisingproducts', 1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'deficiencylog',       1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'assets',              1, true, true, true, false);

-- Manager: CRUD on packaging/parts
SELECT shared.upsert_table_permission('manager', 'packaging',           1, true, true, true, false);
SELECT shared.upsert_table_permission('manager', 'parts',               1, true, true, true, false);

-- ──────── 5b. DATA-ENTRY role ──────────────────────────────
-- CRUD on transaction tables (already seeded in step-34).
-- Add remaining CRUD needed for data-entry workflow:

SELECT shared.upsert_table_permission('data-entry', 'discount',         1, true, true, true, false);
SELECT shared.upsert_table_permission('data-entry', 'packaging',        1, true, true, true, false);
SELECT shared.upsert_table_permission('data-entry', 'assets',           1, true, true, true, false);
SELECT shared.upsert_table_permission('data-entry', 'parts',            1, true, true, true, false);

-- data-entry: read-only on additional reference tables
SELECT shared.upsert_table_permission('data-entry', 'coffeerecipes',    1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'coffeeingredients',1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'coffeerecipeingredients', 1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'grind',            1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'format',           1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'discount',         1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'brokers',          1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'bids',             1, true, false, false, false);
SELECT shared.upsert_table_permission('data-entry', 'employeestatus',   1, true, false, false, false);

-- ──────── 5c. READ-ONLY role ───────────────────────────────
-- Select on all non-sensitive tables (already done in step-34).
-- Add select on remaining tables not covered by the bulk CROSS JOIN:
SELECT shared.upsert_table_permission('read-only', 'cleaningsessions',        1, true, false, false, false);
SELECT shared.upsert_table_permission('read-only', 'coffeeproductioncosts',   1, true, false, false, false);
SELECT shared.upsert_table_permission('read-only', 'coffeerecipes',           1, true, false, false, false);
SELECT shared.upsert_table_permission('read-only', 'coffeeingredients',       1, true, false, false, false);
SELECT shared.upsert_table_permission('read-only', 'coffeerecipeingredients', 1, true, false, false, false);
SELECT shared.upsert_table_permission('read-only', 'fundraisingproducts',     1, true, false, false, false);
SELECT shared.upsert_table_permission('read-only', 'marketingsites',          1, true, false, false, false);
SELECT shared.upsert_table_permission('read-only', 'onlineassets',            1, true, false, false, false);
SELECT shared.upsert_table_permission('read-only', 'deficiencylog',           1, true, false, false, false);
SELECT shared.upsert_table_permission('read-only', 'my_company_information',  1, true, false, false, false);

-- read-only: select on standard_emails (needed for email templates in forms)
SELECT shared.upsert_table_permission('read-only', 'standard_emails',         1, true, false, false, false);

-- ──────── 5d. REPORTS role ─────────────────────────────────
-- Reports: read-only access to analytical/report tables

-- Core analytical tables
SELECT shared.upsert_table_permission('reports', 'orders',              1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'order_details',       1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'customers',           1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'products',            1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'payments',            1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'category',            1, true, false, false, false);

-- Sales pipeline
SELECT shared.upsert_table_permission('reports', 'salescloses',         1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'salesopens',          1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'salesimplication',    1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'salesneedpayoff',     1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'salesproblem',        1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'salessituation',      1, true, false, false, false);

-- Production analytics
SELECT shared.upsert_table_permission('reports', 'roastbatches',        1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'roastsessions',       1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'workorders',          1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'workorder_labor',     1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'workorder_parts',     1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'cleaningsessions',    1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'coffeeproductioncosts', 1, true, false, false, false);

-- Inventory/recipe analytics
SELECT shared.upsert_table_permission('reports', 'coffeerecipes',       1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'coffeeingredients',   1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'coffeerecipeingredients', 1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'packaging',           1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'parts',               1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'assets',              1, true, false, false, false);

-- Financial/analytical
SELECT shared.upsert_table_permission('reports', 'deficiencylog',       1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'fundraisingproducts', 1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'marketingsites',      1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'onlineassets',        1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'my_company_information', 1, true, false, false, false);

-- Broker/valuation analytics
SELECT shared.upsert_table_permission('reports', 'brokers',             1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'bids',                1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'valuesassessment',    1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'valuespipeline',      1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'valuesprobability',   1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'valuesstatus',        1, true, false, false, false);

-- Reference tables
SELECT shared.upsert_table_permission('reports', 'discount',            1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'grind',               1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'format',              1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'payment_methods',     1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'shipping_methods',    1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'shipping_service_class', 1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'employeestatus',      1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'standard_emails',     1, true, false, false, false);

-- Reports: HR summary (read-only, no individual salary data)
SELECT shared.upsert_table_permission('reports', 'employees',           1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'emp_hrs',             1, true, false, false, false);
SELECT shared.upsert_table_permission('reports', 'employeetasks',       1, true, false, false, false);

-- ──────── 5e. PRODUCTION role ──────────────────────────────
-- Production: CRUD on production floor tables

-- Core production tables: full CRUD
SELECT shared.upsert_table_permission('production', 'roastbatches',        1, true, true, true, false);
SELECT shared.upsert_table_permission('production', 'roastsessions',       1, true, true, true, false);
SELECT shared.upsert_table_permission('production', 'workorders',          1, true, true, true, false);
SELECT shared.upsert_table_permission('production', 'workorder_labor',     1, true, true, true, false);
SELECT shared.upsert_table_permission('production', 'workorder_parts',     1, true, true, true, false);
SELECT shared.upsert_table_permission('production', 'cleaningsessions',    1, true, true, true, false);
SELECT shared.upsert_table_permission('production', 'coffeeproductioncosts', 1, true, true, true, false);

-- Production: read on reference tables
SELECT shared.upsert_table_permission('production', 'products',            1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'coffeerecipes',       1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'coffeeingredients',   1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'coffeerecipeingredients', 1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'category',            1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'grind',               1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'packaging',           1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'parts',               1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'assets',              1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'discount',            1, true, false, false, false);

-- Production: read on orders (to see what needs roasting)
SELECT shared.upsert_table_permission('production', 'orders',              1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'order_details',       1, true, false, false, false);

-- Production: read on employees (crew lookup)
SELECT shared.upsert_table_permission('production', 'employees',           1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'employeestatus',      1, true, false, false, false);
SELECT shared.upsert_table_permission('production', 'employeetasks',       1, true, false, false, false);

-- Production: read on standard_emails (notification templates)
SELECT shared.upsert_table_permission('production', 'standard_emails',     1, true, false, false, false);

-- ──────── 5f. INVENTORY role ───────────────────────────────
-- Inventory: CRUD on catalog/stock tables

-- Core inventory tables: full CRUD (no delete)
SELECT shared.upsert_table_permission('inventory', 'products',            1, true, true, true, false);
SELECT shared.upsert_table_permission('inventory', 'packaging',           1, true, true, true, false);
SELECT shared.upsert_table_permission('inventory', 'parts',               1, true, true, true, false);
SELECT shared.upsert_table_permission('inventory', 'assets',              1, true, true, true, false);
SELECT shared.upsert_table_permission('inventory', 'coffeeingredients',   1, true, true, true, false);
SELECT shared.upsert_table_permission('inventory', 'coffeerecipeingredients', 1, true, true, true, false);

-- Inventory: update on recipes (ingredient quantities)
SELECT shared.upsert_table_permission('inventory', 'coffeerecipes',       1, true, true, true, false);

-- Inventory: read on transactional tables
SELECT shared.upsert_table_permission('inventory', 'orders',              1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'order_details',       1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'category',            1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'grind',               1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'discount',            1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'format',              1, true, false, false, false);

-- Inventory: read on shipping/payment references
SELECT shared.upsert_table_permission('inventory', 'shipping_methods',    1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'payment_methods',     1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'shipping_service_class', 1, true, false, false, false);

-- Inventory: read on brokers/suppliers
SELECT shared.upsert_table_permission('inventory', 'brokers',             1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'bids',                1, true, false, false, false);

-- Inventory: read on production status (to know what's in production)
SELECT shared.upsert_table_permission('inventory', 'roastbatches',        1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'roastsessions',       1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'workorders',          1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'coffeeproductioncosts', 1, true, false, false, false);

-- Inventory: read on employees (receive/issue tracking)
SELECT shared.upsert_table_permission('inventory', 'employees',           1, true, false, false, false);
SELECT shared.upsert_table_permission('inventory', 'employeestatus',      1, true, false, false, false);

-- Inventory: read on standard_emails
SELECT shared.upsert_table_permission('inventory', 'standard_emails',     1, true, false, false, false);

-- ──────── 5g. shared.objects access (all non-admin roles) ──
-- Already seeded in step-34. Skip repeat.

-- ============================================================
-- 6. FIELD PERMISSIONS
-- ============================================================
--
-- Restrict access to sensitive fields per role.
-- Fields without explicit entries are implicitly visible/writable.

-- ──────── 6a. DATA-ENTRY: sensitive fields ─────────────────
-- (Already seeded in step-36, but re-assert for completeness)

-- data-entry: orders.discount → readonly
SELECT shared.upsert_field_permission('data-entry', 'orders', 'discount', 1, true, false);
-- data-entry: employees.salary → hidden
SELECT shared.upsert_field_permission('data-entry', 'employees', 'salary', 1, false, false);
-- data-entry: customers.balance → readonly
SELECT shared.upsert_field_permission('data-entry', 'customers', 'balance', 1, true, false);

-- data-entry: employees.rate → readonly
SELECT shared.upsert_field_permission('data-entry', 'employees', 'rate', 1, true, false);
-- data-entry: employees.ssn → hidden
SELECT shared.upsert_field_permission('data-entry', 'employees', 'ssn', 1, false, false);
-- data-entry: employees.bankaccount → hidden
SELECT shared.upsert_field_permission('data-entry', 'employees', 'bankaccount', 1, false, false);

-- ──────── 6b. READ-ONLY: all fields are implicitly read-only ──
-- The table_permissions already restrict to SELECT only, so
-- field-level read/write is not needed. All fields are visible
-- but not writable via the table permission layer.

-- ──────── 6c. REPORTS: hide sensitive HR fields ────────────
SELECT shared.upsert_field_permission('reports', 'employees', 'salary', 1, false, false);
SELECT shared.upsert_field_permission('reports', 'employees', 'rate', 1, false, false);
SELECT shared.upsert_field_permission('reports', 'employees', 'ssn', 1, false, false);
SELECT shared.upsert_field_permission('reports', 'employees', 'bankaccount', 1, false, false);

-- reports: customers.balance → readonly
SELECT shared.upsert_field_permission('reports', 'customers', 'balance', 1, true, false);
-- reports: orders.discount → readonly
SELECT shared.upsert_field_permission('reports', 'orders', 'discount', 1, true, false);

-- ──────── 6d. PRODUCTION: hide sensitive fields ────────────
SELECT shared.upsert_field_permission('production', 'employees', 'salary', 1, false, false);
SELECT shared.upsert_field_permission('production', 'employees', 'rate', 1, false, false);
SELECT shared.upsert_field_permission('production', 'employees', 'ssn', 1, false, false);
SELECT shared.upsert_field_permission('production', 'employees', 'bankaccount', 1, false, false);

-- production: customers.balance → readonly
SELECT shared.upsert_field_permission('production', 'customers', 'balance', 1, true, false);

-- ──────── 6e. INVENTORY: hide sensitive fields ─────────────
SELECT shared.upsert_field_permission('inventory', 'employees', 'salary', 1, false, false);
SELECT shared.upsert_field_permission('inventory', 'employees', 'rate', 1, false, false);
SELECT shared.upsert_field_permission('inventory', 'employees', 'ssn', 1, false, false);
SELECT shared.upsert_field_permission('inventory', 'employees', 'bankaccount', 1, false, false);

-- inventory: customers.balance → readonly
SELECT shared.upsert_field_permission('inventory', 'customers', 'balance', 1, true, false);

-- ──────── 6f. MANAGER: sensitive field protections ────────
-- Manager can see salary but not SSN/bankaccount
SELECT shared.upsert_field_permission('manager', 'employees', 'ssn', 1, false, false);
SELECT shared.upsert_field_permission('manager', 'employees', 'bankaccount', 1, false, false);

-- ============================================================
-- 7. ROW FILTERS
-- ============================================================
--
-- Row-level filters restrict which rows a role can see.
-- Only roles that need data scoping get explicit filters.

-- ──────── 7a. REPORTS: only see company_id=1 rows ──────────
-- (Already the default in the API — all queries filter by company_id.)

-- ──────── 7b. PRODUCTION: only see active work orders ──────
SELECT shared.upsert_row_filter(
    'production', 'workorders', 1,
    '{"field":"status","operator":"neq","value":"cancelled"}'::jsonb,
    'status != ''cancelled''',
    'Hide cancelled work orders from production floor'
);

SELECT shared.upsert_row_filter(
    'production', 'roastbatches', 1,
    '{"field":"status","operator":"neq","value":"archived"}'::jsonb,
    'status != ''archived''',
    'Hide archived roast batches from production floor'
);

-- ──────── 7c. INVENTORY: only see active products ──────────
SELECT shared.upsert_row_filter(
    'inventory', 'products', 1,
    '{"field":"discontinued","operator":"eq","value":false}'::jsonb,
    'discontinued = false',
    'Hide discontinued products from inventory'
);

-- ============================================================
-- 8. Cleanup helper functions
-- ============================================================

DROP FUNCTION IF EXISTS shared.upsert_table_permission;
DROP FUNCTION IF EXISTS shared.upsert_field_permission;
DROP FUNCTION IF EXISTS shared.upsert_row_filter;

COMMIT;