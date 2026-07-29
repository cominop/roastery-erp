-- Step 68: Auto-generate default tree from DB schema
-- Target: shared schema in polyaccess database
--
-- Creates a PL/pgSQL function that dynamically regenerates the navigation
-- tree by scanning the actual DB schema (tables, forms, reports) and
-- grouping them into logical categories based on naming patterns.
--
-- This replaces the hardcoded seed in step-61-nav-tree.sql with a
-- fully dynamic approach that adapts as the schema evolves.
--
-- Migration: idempotent (CREATE OR REPLACE FUNCTION, TRUNCATE-safe)

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. fn_regenerate_nav_tree() — auto-generate tree from schema
-- ═══════════════════════════════════════════════════════════════
-- Scans pg_tables + shared.objects and builds a categorized nav tree.
-- Call whenever the schema changes and you want the nav tree to reflect it.
--
-- Parameters:
--   p_company_id INTEGER — company scope (default 1)
--   p_keep_existing BOOLEAN — if true, only adds new nodes without
--                             removing existing ones (default false)
--
-- Returns: JSON summary of what was created
--   { ok: true, groups: N, tables: N, forms: N, reports: N, admin: N }

CREATE OR REPLACE FUNCTION shared.fn_regenerate_nav_tree(
  p_company_id INTEGER DEFAULT 1,
  p_keep_existing BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_group_orders     INTEGER;
  v_group_products   INTEGER;
  v_group_customers  INTEGER;
  v_group_employees  INTEGER;
  v_group_operations INTEGER;
  v_group_pipeline   INTEGER;
  v_group_reference  INTEGER;
  v_group_forms      INTEGER;
  v_group_reports    INTEGER;
  v_group_admin      INTEGER;
  v_sort             INTEGER;
  v_table_name       TEXT;
  v_form_name        TEXT;
  v_report_name      TEXT;
  v_count            INTEGER;
  v_tables_created   INTEGER := 0;
  v_forms_created    INTEGER := 0;
  v_reports_created  INTEGER := 0;
  v_admin_created    INTEGER := 0;
  v_groups_created   INTEGER := 0;
BEGIN
  -- ── Optionally clear existing tree ─────────────────────
  IF NOT p_keep_existing THEN
    DELETE FROM shared.nav_tree WHERE company_id = p_company_id;
  END IF;

  -- ─── Create root groups (idempotent via ON CONFLICT) ──

  -- Orders & Sales
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Orders & Sales', 'ShoppingCart', 'group', 10, true, p_company_id, '#059669')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_orders;
  IF v_group_orders IS NULL THEN
    SELECT id INTO v_group_orders FROM shared.nav_tree
     WHERE label = 'Orders & Sales' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- Products & Inventory
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Products & Inventory', 'Package', 'group', 20, true, p_company_id, '#2563EB')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_products;
  IF v_group_products IS NULL THEN
    SELECT id INTO v_group_products FROM shared.nav_tree
     WHERE label = 'Products & Inventory' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- Customers
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Customers', 'Users', 'group', 30, true, p_company_id, '#7C3AED')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_customers;
  IF v_group_customers IS NULL THEN
    SELECT id INTO v_group_customers FROM shared.nav_tree
     WHERE label = 'Customers' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- Employees & HR
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Employees & HR', 'Briefcase', 'group', 40, true, p_company_id, '#D97706')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_employees;
  IF v_group_employees IS NULL THEN
    SELECT id INTO v_group_employees FROM shared.nav_tree
     WHERE label = 'Employees & HR' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- Operations
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Operations', 'Factory', 'group', 50, true, p_company_id, '#DC2626')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_operations;
  IF v_group_operations IS NULL THEN
    SELECT id INTO v_group_operations FROM shared.nav_tree
     WHERE label = 'Operations' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- Sales Pipeline
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Sales Pipeline', 'TrendingUp', 'group', 60, false, p_company_id, '#0891B2')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_pipeline;
  IF v_group_pipeline IS NULL THEN
    SELECT id INTO v_group_pipeline FROM shared.nav_tree
     WHERE label = 'Sales Pipeline' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- Reference Data
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Reference Data', 'Database', 'group', 70, false, p_company_id, '#6B7280')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_reference;
  IF v_group_reference IS NULL THEN
    SELECT id INTO v_group_reference FROM shared.nav_tree
     WHERE label = 'Reference Data' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- Forms
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Forms', 'Layout', 'group', 80, true, p_company_id, '#7C3AED')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_forms;
  IF v_group_forms IS NULL THEN
    SELECT id INTO v_group_forms FROM shared.nav_tree
     WHERE label = 'Forms' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- Reports
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Reports', 'FileText', 'group', 90, false, p_company_id, '#D97706')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_reports;
  IF v_group_reports IS NULL THEN
    SELECT id INTO v_group_reports FROM shared.nav_tree
     WHERE label = 'Reports' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- Administration
  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, company_id, color)
  VALUES ('Administration', 'Settings', 'group', 100, false, p_company_id, '#6B7280')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_group_admin;
  IF v_group_admin IS NULL THEN
    SELECT id INTO v_group_admin FROM shared.nav_tree
     WHERE label = 'Administration' AND company_id = p_company_id AND parent_id IS NULL;
  END IF;
  v_groups_created := v_groups_created + 1;

  -- ══════════════════════════════════════════════════════════
  -- 2. Tables — categorize by name pattern
  -- ══════════════════════════════════════════════════════════

  -- Helper: classify a table into its group parent_id
  -- Uses a temporary table to avoid repeated CASE logic in the loop

  -- ── Orders & Sales ──────────────────────────────────
  v_sort := 10;
  FOR v_table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'db_fcc_erp'
      AND LEFT(tablename, 1) != '_'
      AND (
        tablename IN ('orders', 'order_details', 'orderdetailstemp', 'orderstemp',
                      'payments', 'discount', 'shipping_methods', 'payment_methods',
                      'shipping_service_class', 'shippingserviceclass',
                      'bids', 'brokers',
                      'orders_exporterrors', 'orders_exporterrors1')
      )
    ORDER BY tablename
  LOOP
    IF NOT p_keep_existing OR NOT EXISTS (
      SELECT 1 FROM shared.nav_tree
      WHERE parent_id = v_group_orders AND target_name = v_table_name AND company_id = p_company_id
    ) THEN
      INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, company_id)
      VALUES (v_group_orders, v_table_name, 'Table2', 'table', v_table_name, v_sort, p_company_id);
      v_tables_created := v_tables_created + 1;
    END IF;
    v_sort := v_sort + 10;
  END LOOP;

  -- ── Products & Inventory ────────────────────────────
  v_sort := 10;
  FOR v_table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'db_fcc_erp'
      AND LEFT(tablename, 1) != '_'
      AND (
        tablename IN ('products', 'old__products', 'packaging', 'grind', 'category',
                      'coffeeingredients', 'coffeerecipes', 'coffeerecipeingredients',
                      'coffeeproductioncosts', 'ingredientimporting', 'format')
      )
    ORDER BY tablename
  LOOP
    IF NOT p_keep_existing OR NOT EXISTS (
      SELECT 1 FROM shared.nav_tree
      WHERE parent_id = v_group_products AND target_name = v_table_name AND company_id = p_company_id
    ) THEN
      INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, company_id)
      VALUES (v_group_products, v_table_name, 'Table2', 'table', v_table_name, v_sort, p_company_id);
      v_tables_created := v_tables_created + 1;
    END IF;
    v_sort := v_sort + 10;
  END LOOP;

  -- ── Customers ───────────────────────────────────────
  v_sort := 10;
  FOR v_table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'db_fcc_erp'
      AND LEFT(tablename, 1) != '_'
      AND (
        tablename IN ('customers', 'customers_exporterrors',
                      'no_dupes_crfa_list_2009', 'crfa_list_2009')
      )
    ORDER BY tablename
  LOOP
    IF NOT p_keep_existing OR NOT EXISTS (
      SELECT 1 FROM shared.nav_tree
      WHERE parent_id = v_group_customers AND target_name = v_table_name AND company_id = p_company_id
    ) THEN
      INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, company_id)
      VALUES (v_group_customers, v_table_name, 'Table2', 'table', v_table_name, v_sort, p_company_id);
      v_tables_created := v_tables_created + 1;
    END IF;
    v_sort := v_sort + 10;
  END LOOP;

  -- ── Employees & HR ──────────────────────────────────
  v_sort := 10;
  FOR v_table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'db_fcc_erp'
      AND LEFT(tablename, 1) != '_'
      AND (
        tablename IN ('employees', 'employeestatus', 'employeetasks', 'employeesubtasks',
                      'emp_hrs', 'emp_hrs_detail')
      )
    ORDER BY tablename
  LOOP
    IF NOT p_keep_existing OR NOT EXISTS (
      SELECT 1 FROM shared.nav_tree
      WHERE parent_id = v_group_employees AND target_name = v_table_name AND company_id = p_company_id
    ) THEN
      INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, company_id)
      VALUES (v_group_employees, v_table_name, 'Table2', 'table', v_table_name, v_sort, p_company_id);
      v_tables_created := v_tables_created + 1;
    END IF;
    v_sort := v_sort + 10;
  END LOOP;

  -- ── Operations ──────────────────────────────────────
  v_sort := 10;
  FOR v_table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'db_fcc_erp'
      AND LEFT(tablename, 1) != '_'
      AND (
        tablename IN ('roastbatches', 'roastprofiles', 'roastsessions',
                      'workorders', 'workorder_labor', 'workorder_parts',
                      'cleaningsessions', 'assets', 'onlineassets', 'parts',
                      'deficiencylog')
      )
    ORDER BY tablename
  LOOP
    IF NOT p_keep_existing OR NOT EXISTS (
      SELECT 1 FROM shared.nav_tree
      WHERE parent_id = v_group_operations AND target_name = v_table_name AND company_id = p_company_id
    ) THEN
      INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, company_id)
      VALUES (v_group_operations, v_table_name, 'Table2', 'table', v_table_name, v_sort, p_company_id);
      v_tables_created := v_tables_created + 1;
    END IF;
    v_sort := v_sort + 10;
  END LOOP;

  -- ── Sales Pipeline ──────────────────────────────────
  v_sort := 10;
  FOR v_table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'db_fcc_erp'
      AND LEFT(tablename, 1) != '_'
      AND (
        tablename IN ('salesopens', 'salescloses', 'salesimplication',
                      'salesneedpayoff', 'salesproblem', 'salessituation',
                      'fundraisingproducts',
                      'valuesassessment', 'valuespipeline',
                      'valuesprobability', 'valuesstatus')
      )
    ORDER BY tablename
  LOOP
    IF NOT p_keep_existing OR NOT EXISTS (
      SELECT 1 FROM shared.nav_tree
      WHERE parent_id = v_group_pipeline AND target_name = v_table_name AND company_id = p_company_id
    ) THEN
      INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, company_id)
      VALUES (v_group_pipeline, v_table_name, 'Table2', 'table', v_table_name, v_sort, p_company_id);
      v_tables_created := v_tables_created + 1;
    END IF;
    v_sort := v_sort + 10;
  END LOOP;

  -- ── Reference Data (everything else) ────────────────
  v_sort := 10;
  FOR v_table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'db_fcc_erp'
      AND LEFT(tablename, 1) != '_'
      AND tablename NOT IN (
        'orders', 'order_details', 'orderdetailstemp', 'orderstemp',
        'payments', 'discount', 'shipping_methods', 'payment_methods',
        'shipping_service_class', 'shippingserviceclass',
        'bids', 'brokers', 'orders_exporterrors', 'orders_exporterrors1',
        'products', 'old__products', 'packaging', 'grind', 'category',
        'coffeeingredients', 'coffeerecipes', 'coffeerecipeingredients',
        'coffeeproductioncosts', 'ingredientimporting', 'format',
        'customers', 'customers_exporterrors', 'no_dupes_crfa_list_2009', 'crfa_list_2009',
        'employees', 'employeestatus', 'employeetasks', 'employeesubtasks',
        'emp_hrs', 'emp_hrs_detail',
        'roastbatches', 'roastprofiles', 'roastsessions',
        'workorders', 'workorder_labor', 'workorder_parts',
        'cleaningsessions', 'assets', 'onlineassets', 'parts', 'deficiencylog',
        'salesopens', 'salescloses', 'salesimplication',
        'salesneedpayoff', 'salesproblem', 'salessituation',
        'fundraisingproducts',
        'valuesassessment', 'valuespipeline', 'valuesprobability', 'valuesstatus'
      )
    ORDER BY tablename
  LOOP
    IF NOT p_keep_existing OR NOT EXISTS (
      SELECT 1 FROM shared.nav_tree
      WHERE parent_id = v_group_reference AND target_name = v_table_name AND company_id = p_company_id
    ) THEN
      INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, company_id)
      VALUES (v_group_reference, v_table_name, 'Table2', 'table', v_table_name, v_sort, p_company_id);
      v_tables_created := v_tables_created + 1;
    END IF;
    v_sort := v_sort + 10;
  END LOOP;

  -- ══════════════════════════════════════════════════════════
  -- 3. Forms — all from shared.objects
  -- ══════════════════════════════════════════════════════════

  v_sort := 10;
  FOR v_form_name IN
    SELECT DISTINCT ON (name) name
    FROM shared.objects
    WHERE type = 'form'
      AND definition IS NOT NULL
      AND (hidden IS NULL OR hidden = false)
    ORDER BY name
  LOOP
    IF NOT p_keep_existing OR NOT EXISTS (
      SELECT 1 FROM shared.nav_tree
      WHERE parent_id = v_group_forms AND target_name = v_form_name AND company_id = p_company_id
    ) THEN
      INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, company_id)
      VALUES (v_group_forms, v_form_name, 'Layout', 'form', v_form_name, v_sort, p_company_id);
      v_forms_created := v_forms_created + 1;
    END IF;
    v_sort := v_sort + 10;
  END LOOP;

  -- ══════════════════════════════════════════════════════════
  -- 4. Reports — all from shared.objects
  -- ══════════════════════════════════════════════════════════

  v_sort := 10;
  FOR v_report_name IN
    SELECT DISTINCT ON (name) name
    FROM shared.objects
    WHERE type = 'report'
      AND definition IS NOT NULL
      AND (hidden IS NULL OR hidden = false)
    ORDER BY name
  LOOP
    IF NOT p_keep_existing OR NOT EXISTS (
      SELECT 1 FROM shared.nav_tree
      WHERE parent_id = v_group_reports AND target_name = v_report_name AND company_id = p_company_id
    ) THEN
      INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, company_id)
      VALUES (v_group_reports, v_report_name, 'FileText', 'report', v_report_name, v_sort, p_company_id);
      v_reports_created := v_reports_created + 1;
    END IF;
    v_sort := v_sort + 10;
  END LOOP;

  -- ══════════════════════════════════════════════════════════
  -- 5. Admin links
  -- ══════════════════════════════════════════════════════════

  -- Only add admin links if they don't exist (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM shared.nav_tree
    WHERE parent_id = v_group_admin AND target_name = 'permissions' AND company_id = p_company_id
  ) THEN
    INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, color, company_id)
    VALUES (v_group_admin, 'Table Permissions', 'Shield', 'link', 'permissions', 10, '#6B7280', p_company_id);
    v_admin_created := v_admin_created + 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM shared.nav_tree
    WHERE parent_id = v_group_admin AND target_name = 'calculated-fields' AND company_id = p_company_id
  ) THEN
    INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, color, company_id)
    VALUES (v_group_admin, 'Calculated Fields', 'FunctionSquare', 'link', 'calculated-fields', 20, '#6B7280', p_company_id);
    v_admin_created := v_admin_created + 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM shared.nav_tree
    WHERE parent_id = v_group_admin AND target_name = 'events' AND company_id = p_company_id
  ) THEN
    INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, color, company_id)
    VALUES (v_group_admin, 'Event Handlers', 'Code', 'link', 'events', 30, '#6B7280', p_company_id);
    v_admin_created := v_admin_created + 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM shared.nav_tree
    WHERE parent_id = v_group_admin AND target_name = 'audit-log' AND company_id = p_company_id
  ) THEN
    INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, color, company_id)
    VALUES (v_group_admin, 'Audit Log', 'List', 'link', 'audit-log', 40, '#6B7280', p_company_id);
    v_admin_created := v_admin_created + 1;
  END IF;

  -- ══════════════════════════════════════════════════════════
  -- 6. Return summary
  -- ══════════════════════════════════════════════════════════

  RETURN jsonb_build_object(
    'ok', true,
    'groups', v_groups_created,
    'tables', v_tables_created,
    'forms', v_forms_created,
    'reports', v_reports_created,
    'admin', v_admin_created
  );
END;
$$;

COMMENT ON FUNCTION shared.fn_regenerate_nav_tree IS
  'Auto-generate nav tree from DB schema. Scans pg_tables + shared.objects and groups items into logical categories. '
  'Returns JSON with counts of what was created.';

COMMIT;