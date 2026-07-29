-- Step 64: Navigation Tree 4 — Role-based visibility filtering
--
-- Adds role_visibility to nav_tree table and updates fn_nav_tree()
-- to accept a role filter parameter. Nodes with role_visibility set
-- are only shown to users whose roles overlap with the list.
-- Nodes with NULL/empty role_visibility are visible to all.
--
-- Migration is idempotent via IF NOT EXISTS / OR REPLACE.

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. Add role_visibility column
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE shared.nav_tree
  ADD COLUMN IF NOT EXISTS role_visibility TEXT[];

COMMENT ON COLUMN shared.nav_tree.role_visibility IS
  'Role-based visibility filter. Array of role names that can see this node. NULL or empty = visible to all.';

-- Create a GIN index for the overlap operator (&&)
CREATE INDEX IF NOT EXISTS idx_nav_tree_role_visibility
  ON shared.nav_tree USING GIN (role_visibility)
  WHERE role_visibility IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. Update fn_nav_tree() to accept and apply role filter
-- ═══════════════════════════════════════════════════════════════

-- Drop old signature first (OR REPLACE can't handle overload ambiguity with defaults)
DROP FUNCTION IF EXISTS shared.fn_nav_tree(integer, boolean);

CREATE OR REPLACE FUNCTION shared.fn_nav_tree(
  p_company_id   INTEGER DEFAULT 1,
  p_visible_only BOOLEAN DEFAULT true,
  p_role_names   TEXT[] DEFAULT NULL  -- array of role names for visibility filtering
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
  path          TEXT[],
  role_visibility TEXT[]
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
      ARRAY[n.sort_order::TEXT, LPAD(n.id::TEXT, 10, '0')]::TEXT[] AS path,
      n.role_visibility
    FROM shared.nav_tree n
    WHERE n.parent_id IS NULL
      AND n.company_id = p_company_id
      AND (NOT p_visible_only OR n.is_visible = true)
      -- Role filter: node is visible if role_visibility is NULL/empty,
      -- OR if user has at least one of the required roles
      AND (
        p_role_names IS NULL
        OR n.role_visibility IS NULL
        OR array_length(n.role_visibility, 1) IS NULL
        OR n.role_visibility && p_role_names
      )

    UNION ALL

    -- Recursive: children
    SELECT
      n.id, n.parent_id, n.label, n.icon, n.target_type,
      n.target_name, n.target_params, n.sort_order,
      n.is_visible, n.is_expanded, n.color, n.badge,
      t.depth + 1,
      t.path || ARRAY[n.sort_order::TEXT, LPAD(n.id::TEXT, 10, '0')],
      n.role_visibility
    FROM shared.nav_tree n
    JOIN tree t ON t.id = n.parent_id
    WHERE n.company_id = p_company_id
      AND (NOT p_visible_only OR n.is_visible = true)
      -- Same role filter applied to children (children of a hidden parent
      -- are never reached because the recursive JOIN only finds children
      -- of parents that passed the base filter)
      AND (
        p_role_names IS NULL
        OR n.role_visibility IS NULL
        OR array_length(n.role_visibility, 1) IS NULL
        OR n.role_visibility && p_role_names
      )
  )
  SELECT
    t.id, t.parent_id, t.label, t.icon, t.target_type,
    t.target_name, t.target_params, t.sort_order,
    t.is_visible, t.is_expanded, t.color, t.badge,
    t.depth, t.path, t.role_visibility
  FROM tree t
  ORDER BY t.path;
$$;

COMMENT ON FUNCTION shared.fn_nav_tree IS
  'Return the navigation tree as a flat, ordered list with depth and path arrays. '
  'Pass p_role_names as an array of role names to filter by role visibility. '
  'Pass NULL for no role filtering (shows all nodes).';

-- ═══════════════════════════════════════════════════════════════
-- 3. Update seed data — assign role_visibility
-- ═══════════════════════════════════════════════════════════════
-- Administration group items should only be visible to admin role.
-- Sensitive tables (employees, salary data) also restricted.
-- This runs idempotently: only updates rows where role_visibility is still NULL.

DO $$
DECLARE
  v_admin_group_id INTEGER;
  v_count INTEGER;
BEGIN
  -- Get the Administration group id
  SELECT id INTO v_admin_group_id
  FROM shared.nav_tree
  WHERE label = 'Administration'
    AND target_type = 'group'
    AND company_id = 1
  LIMIT 1;

  -- Set role_visibility on Administration group itself (only admin can see it)
  IF v_admin_group_id IS NOT NULL THEN
    UPDATE shared.nav_tree
    SET role_visibility = ARRAY['admin'],
        updated_at = NOW()
    WHERE id = v_admin_group_id
      AND role_visibility IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Set Administration group admin-only: % rows updated', v_count;

    -- Set role_visibility on all children of Administration group
    UPDATE shared.nav_tree
    SET role_visibility = ARRAY['admin'],
        updated_at = NOW()
    WHERE parent_id = v_admin_group_id
      AND role_visibility IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Set admin-only on Administration children: % rows updated', v_count;
  END IF;

  -- Restrict sensitive tables
  UPDATE shared.nav_tree
  SET role_visibility = ARRAY['admin', 'manager'],
      updated_at = NOW()
  WHERE target_type = 'table'
    AND target_name IN ('employees', 'payments')
    AND role_visibility IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Set admin/manager on employees, payments: % rows updated', v_count;

  RAISE NOTICE 'nav_tree role_visibility seed complete';
END;
$$;

COMMIT;
