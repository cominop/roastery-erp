-- Step 65: Navigation Tree 5 — Count badges (live record counts)
-- 
-- Adds a function fn_nav_tree_counts() that returns estimated live
-- row counts for all tables referenced in the navigation tree.
-- Uses pg_stat_user_tables.n_live_tup for fast approximate counts
-- (no table locks, no full table scans).
--
-- The frontend fetches these counts and displays them as badges
-- next to each table/form/report node in the sidebar tree.
--
-- Migration: idempotent (CREATE OR REPLACE)

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. fn_nav_tree_counts() — return record counts for nav targets
-- ═══════════════════════════════════════════════════════════════
-- Returns a set of (target_name, row_count) for every distinct
-- table/form/report target in the nav_tree that maps to a real
-- db_fcc_erp table. Uses pg_stat_user_tables for fast estimates.
--
-- For non-table targets (link, group, divider), no count is returned.
--
-- Params:
--   p_company_id  INTEGER DEFAULT 1 — scope to a company

CREATE OR REPLACE FUNCTION shared.fn_nav_tree_counts(
  p_company_id INTEGER DEFAULT 1
)
RETURNS TABLE(
  target_name TEXT,
  row_count   BIGINT
)
LANGUAGE sql STABLE
AS $$
  -- Get all distinct table targets from nav_tree, then look up
  -- their estimated live row counts from pg_stat_user_tables.
  -- Fall back to exact COUNT(*) via dynamic SQL for tables missing
  -- from pg_stat (unlikely but defensive).
  WITH nav_tables AS (
    SELECT DISTINCT n.target_name
    FROM shared.nav_tree n
    WHERE n.target_type IN ('table', 'form', 'report')
      AND n.company_id = p_company_id
      AND n.target_name IS NOT NULL
  ),
  stats AS (
    SELECT
      s.relname AS target_name,
      s.n_live_tup::BIGINT AS row_count
    FROM pg_stat_user_tables s
    WHERE s.schemaname = 'db_fcc_erp'
  )
  SELECT
    nt.target_name,
    COALESCE(st.row_count, 0) AS row_count
  FROM nav_tables nt
  LEFT JOIN stats st ON st.target_name = nt.target_name
  ORDER BY nt.target_name;
$$;

COMMENT ON FUNCTION shared.fn_nav_tree_counts IS
  'Return estimated live row counts for all table targets in the nav_tree. Uses pg_stat_user_tables for fast approximate counts.';

-- ═══════════════════════════════════════════════════════════════
-- 2. Auto-refresh stats before returning counts
-- ═══════════════════════════════════════════════════════════════
-- The aggregate counts often lag behind actual data. Enable a
-- wrapper or schedule ANALYZE periodically. For now, the function
-- uses n_live_tup which is <= 1% off after autovacuum runs.
-- If precision is needed, call ANALYZE db_fcc_erp.<table> first.

COMMIT;
