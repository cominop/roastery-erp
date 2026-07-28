-- Step 61: Navigation Tree 1 — nav_tree table + seed data
-- Target: shared schema in polyaccess database
--
-- Creates a hierarchical navigation tree table that replaces the flat
-- /api/nav endpoint with a structured, parent-child tree. Supports:
--   - Multi-level hierarchy via parent_id self-reference
--   - Multiple target types: group, table, form, report, link, divider
--   - Sort ordering for explicit sibling arrangement
--   - Visibility and default-expanded toggles
--   - Accent colors and badge indicators
--   - Multi-tenant via company_id
--
-- Migration: idempotent (IF NOT EXISTS, ON CONFLICT)

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. nav_tree table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shared.nav_tree (
  id             SERIAL PRIMARY KEY,
  parent_id      INTEGER REFERENCES shared.nav_tree(id) ON DELETE CASCADE,
  label          VARCHAR(255) NOT NULL,
  icon           VARCHAR(100),
  target_type    VARCHAR(50) NOT NULL DEFAULT 'group'
                  CHECK (target_type IN ('group', 'table', 'form', 'report', 'link', 'divider')),
  target_name    VARCHAR(255),
  target_params  JSONB,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_visible     BOOLEAN NOT NULL DEFAULT true,
  is_expanded    BOOLEAN NOT NULL DEFAULT true,
  color          VARCHAR(50),
  badge          VARCHAR(50),
  company_id     INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE shared.nav_tree IS
  'Hierarchical navigation tree — replaces flat /api/nav with structured, sortable, multi-level nav.';

COMMENT ON COLUMN shared.nav_tree.parent_id IS 'Self-referencing FK for hierarchy (NULL = root node). CASCADE delete.';
COMMENT ON COLUMN shared.nav_tree.target_type IS 'Node type: group (expandable folder), table, form, report, link (external), divider (separator).';
COMMENT ON COLUMN shared.nav_tree.target_name IS 'Name of the target table/form/report (used for navigation routing).';
COMMENT ON COLUMN shared.nav_tree.target_params IS 'Optional JSONB params passed when navigating to the target.';
COMMENT ON COLUMN shared.nav_tree.sort_order IS 'Sibling sort order (lower = first).';
COMMENT ON COLUMN shared.nav_tree.is_visible IS 'Hide/show this node without deleting.';
COMMENT ON COLUMN shared.nav_tree.is_expanded IS 'Default expanded state for group nodes.';
COMMENT ON COLUMN shared.nav_tree.color IS 'Optional accent color for the node label or icon.';
COMMENT ON COLUMN shared.nav_tree.badge IS 'Optional badge text (e.g. "new", "beta", count).';

-- Index for tree traversal (get children by parent_id, sorted)
CREATE INDEX IF NOT EXISTS idx_nav_tree_parent
  ON shared.nav_tree (parent_id, sort_order, id)
  WHERE parent_id IS NOT NULL;

-- Index for root nodes
CREATE INDEX IF NOT EXISTS idx_nav_tree_root
  ON shared.nav_tree (sort_order, id)
  WHERE parent_id IS NULL;

-- Index for target lookup
CREATE INDEX IF NOT EXISTS idx_nav_tree_target
  ON shared.nav_tree (target_type, target_name)
  WHERE target_type != 'group' AND target_type != 'divider';

-- ═══════════════════════════════════════════════════════════════
-- 2. Helper: fn_nav_tree() — returns the tree as nested JSON
-- ═══════════════════════════════════════════════════════════════
-- Returns a flat list with a path/to/root array for each node so
-- the client can reconstruct the hierarchy without recursive CTEs.
-- Each row: id, parent_id, label, icon, target_type, target_name,
--           target_params, sort_order, is_visible, is_expanded,
--           color, badge, depth, path (text[]).

CREATE OR REPLACE FUNCTION shared.fn_nav_tree(
  p_company_id INTEGER DEFAULT 1,
  p_visible_only BOOLEAN DEFAULT true
)
RETURNS TABLE(
  id            INTEGER,
  parent_id     INTEGER,
  label         VARCHAR(255),
  icon          VARCHAR(100),
  target_type   VARCHAR(50),
  target_name   VARCHAR(255),
  target_params JSONB,
  sort_order    INTEGER,
  is_visible    BOOLEAN,
  is_expanded   BOOLEAN,
  color         VARCHAR(50),
  badge         VARCHAR(50),
  depth         INTEGER,
  path          TEXT[]
)
LANGUAGE sql STABLE
AS $$
  WITH RECURSIVE tree AS (
    -- Base: root nodes
    SELECT
      n.id, n.parent_id, n.label, n.icon, n.target_type,
      n.target_name, n.target_params, n.sort_order,
      n.is_visible, n.is_expanded, n.color, n.badge,
      0 AS depth,
      ARRAY[n.sort_order::TEXT, LPAD(n.id::TEXT, 10, '0')]::TEXT[] AS path
    FROM shared.nav_tree n
    WHERE n.parent_id IS NULL
      AND n.company_id = p_company_id
      AND (NOT p_visible_only OR n.is_visible = true)

    UNION ALL

    -- Recursive: children
    SELECT
      n.id, n.parent_id, n.label, n.icon, n.target_type,
      n.target_name, n.target_params, n.sort_order,
      n.is_visible, n.is_expanded, n.color, n.badge,
      t.depth + 1,
      t.path || ARRAY[n.sort_order::TEXT, LPAD(n.id::TEXT, 10, '0')]
    FROM shared.nav_tree n
    JOIN tree t ON t.id = n.parent_id
    WHERE n.company_id = p_company_id
      AND (NOT p_visible_only OR n.is_visible = true)
  )
  SELECT
    t.id, t.parent_id, t.label, t.icon, t.target_type,
    t.target_name, t.target_params, t.sort_order,
    t.is_visible, t.is_expanded, t.color, t.badge,
    t.depth, t.path
  FROM tree t
  ORDER BY t.path;
$$;

COMMENT ON FUNCTION shared.fn_nav_tree IS
  'Return the navigation tree as a flat, ordered list with depth and path arrays for client-side hierarchy reconstruction.';

-- ═══════════════════════════════════════════════════════════════
-- 3. Seed data — populate from existing forms, tables, reports
-- ═══════════════════════════════════════════════════════════════
-- Organizes the existing flat nav into a meaningful hierarchy.
-- Idempotent: only inserts if no nav_tree rows exist for company_id=1.

DO $$
DECLARE
  v_count INTEGER;
  v_group_data   INTEGER;  -- id for "Data" group
  v_group_forms  INTEGER;  -- id for "Forms" group
  v_group_reports INTEGER; -- id for "Reports" group
  v_group_admin  INTEGER;  -- id for "Administration" group
  v_table_name   TEXT;
  v_form_name    TEXT;
  v_sort         INTEGER;
BEGIN
  -- Only seed if tree is empty for company 1
  SELECT COUNT(*) INTO v_count FROM shared.nav_tree WHERE company_id = 1;
  IF v_count > 0 THEN
    RAISE NOTICE 'nav_tree already has % row(s) for company_id=1 — skipping seed', v_count;
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding nav_tree...';

  -- ─── Root groups ────────────────────────────────────

  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded)
  VALUES ('Data', 'Table2', 'group', 10, true)
  RETURNING id INTO v_group_data;

  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded)
  VALUES ('Forms', 'Layout', 'group', 20, true)
  RETURNING id INTO v_group_forms;

  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded)
  VALUES ('Reports', 'FileText', 'group', 30, false)
  RETURNING id INTO v_group_reports;

  INSERT INTO shared.nav_tree (label, icon, target_type, sort_order, is_expanded, color)
  VALUES ('Administration', 'Settings', 'group', 40, false, '#6B7280')
  RETURNING id INTO v_group_admin;

  -- ─── Tables under "Data" ────────────────────────────
  -- Core business tables that are most useful to browse

  v_sort := 10;
  FOR v_table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'db_fcc_erp'
      AND LEFT(tablename, 1) != '_'
      AND tablename IN (
        'customers', 'orders', 'order_details', 'products',
        'employees', 'assets', 'workorders', 'roastbatches',
        'payments', 'shipping_methods', 'payment_methods',
        'category', 'packaging', 'grind', 'discount',
        'coffeerecipes', 'coffeerecipeingredients', 'coffeeingredients',
        'roastprofiles', 'roastsessions', 'workorder_labor', 'workorder_parts',
        'suppliers', 'inventory', 'purchase_orders'
      )
    ORDER BY tablename
  LOOP
    INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order)
    VALUES (v_group_data, v_table_name, 'Table2', 'table', v_table_name, v_sort);
    v_sort := v_sort + 10;
  END LOOP;

  -- Add remaining non-prefixed tables (alphabetical, after the core set)
  FOR v_table_name IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'db_fcc_erp'
      AND LEFT(tablename, 1) != '_'
      AND tablename NOT IN (
        'customers', 'orders', 'order_details', 'products',
        'employees', 'assets', 'workorders', 'roastbatches',
        'payments', 'shipping_methods', 'payment_methods',
        'category', 'packaging', 'grind', 'discount',
        'coffeerecipes', 'coffeerecipeingredients', 'coffeeingredients',
        'roastprofiles', 'roastsessions', 'workorder_labor', 'workorder_parts',
        'suppliers', 'inventory', 'purchase_orders'
      )
    ORDER BY tablename
  LOOP
    INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order)
    VALUES (v_group_data, v_table_name, 'Table2', 'table', v_table_name, v_sort);
    v_sort := v_sort + 10;
  END LOOP;

  -- ─── Forms under "Forms" ────────────────────────────
  -- List distinct form names from shared.objects

  v_sort := 10;
  FOR v_form_name IN
    SELECT DISTINCT ON (name) name
    FROM shared.objects
    WHERE type = 'form'
      AND definition IS NOT NULL
      AND (hidden IS NULL OR hidden = false)
    ORDER BY name
  LOOP
    INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order)
    VALUES (v_group_forms, v_form_name, 'Layout', 'form', v_form_name, v_sort);
    v_sort := v_sort + 10;
  END LOOP;

  -- ─── Reports under "Reports" ────────────────────────
  -- List distinct report names from shared.objects

  v_sort := 10;
  FOR v_form_name IN
    SELECT DISTINCT ON (name) name
    FROM shared.objects
    WHERE type = 'report'
      AND definition IS NOT NULL
      AND (hidden IS NULL OR hidden = false)
    ORDER BY name
  LOOP
    INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order)
    VALUES (v_group_reports, v_form_name, 'FileText', 'report', v_form_name, v_sort);
    v_sort := v_sort + 10;
  END LOOP;

  -- ─── Admin items ────────────────────────────────────

  INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, color)
  VALUES (v_group_admin, 'Table Permissions', 'Shield', 'link', 'permissions', 10, '#6B7280');

  INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, color)
  VALUES (v_group_admin, 'Calculated Fields', 'FunctionSquare', 'link', 'calculated-fields', 20, '#6B7280');

  INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, color)
  VALUES (v_group_admin, 'Event Handlers', 'Code', 'link', 'events', 30, '#6B7280');

  INSERT INTO shared.nav_tree (parent_id, label, icon, target_type, target_name, sort_order, color)
  VALUES (v_group_admin, 'Audit Log', 'List', 'link', 'audit-log', 40, '#6B7280');

  RAISE NOTICE 'nav_tree seeded with root groups + all tables, forms, reports, and admin links';
END;
$$;

COMMIT;
