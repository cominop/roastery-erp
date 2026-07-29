-- Step 66: Navigation Tree 6 — Status badges (pending orders, low stock indicators)
--
-- Adds a function fn_nav_tree_status_badges() that returns conditional
-- status counts for specific tables (unfilled orders, open work orders, etc.)
-- These are displayed as colored severity badges in the sidebar tree.
--
-- This is complementary to fn_nav_tree_counts() — status badges show
-- actionable conditional counts while the regular counts show total row counts.
--
-- Migration: idempotent (CREATE OR REPLACE)

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. fn_nav_tree_status_badges() — return status-specific counts
-- ═══════════════════════════════════════════════════════════════
-- Returns a set of (target_name, status_key, status_label, row_count, severity)
-- for every nav_tree table target that has meaningful status conditions.
--
-- Severity levels:
--   'danger'  — critical (red), e.g. out of stock
--   'warning' — needs attention (amber), e.g. pending orders
--   'info'    — informational (blue), e.g. in progress
--   'muted'   — passive state (gray), e.g. inactive customers
--
-- Params:
--   p_company_id  INTEGER DEFAULT 1 — scope to a company

CREATE OR REPLACE FUNCTION shared.fn_nav_tree_status_badges(
  p_company_id INTEGER DEFAULT 1
)
RETURNS TABLE(
  target_name TEXT,
  status_key TEXT,
  status_label TEXT,
  row_count BIGINT,
  severity TEXT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH status_queries AS (
    -- ── Orders: unfilled (orderfilled is NULL) ──────────────
    SELECT
      'orders'::TEXT AS target_name,
      'unfilled'::TEXT AS status_key,
      'Unfilled'::TEXT AS status_label,
      COUNT(*)::BIGINT AS row_count,
      'warning'::TEXT AS severity
    FROM db_fcc_erp.orders
    WHERE orderfilled IS NULL
      AND company_id = p_company_id

    UNION ALL

    -- ── Workorders: open ─────────────────────────────────────
    SELECT
      'workorders'::TEXT,
      'open'::TEXT,
      'Open'::TEXT,
      COUNT(*)::BIGINT,
      'info'::TEXT
    FROM db_fcc_erp.workorders
    WHERE status = 'Open'
      AND company_id = p_company_id

    UNION ALL

    -- ── Workorders: in progress ──────────────────────────────
    SELECT
      'workorders'::TEXT,
      'in_progress'::TEXT,
      'In Progress'::TEXT,
      COUNT(*)::BIGINT,
      'warning'::TEXT
    FROM db_fcc_erp.workorders
    WHERE status = 'In Progress'
      AND company_id = p_company_id

    UNION ALL

    -- ── Customers: inactive ──────────────────────────────────
    SELECT
      'customers'::TEXT,
      'inactive'::TEXT,
      'Inactive'::TEXT,
      COUNT(*)::BIGINT,
      'muted'::TEXT
    FROM db_fcc_erp.customers
    WHERE (active IS NULL OR active = false)
      AND company_id = p_company_id
  )
  SELECT * FROM status_queries sq
  WHERE sq.row_count > 0
  ORDER BY sq.target_name, sq.severity, sq.status_key;
END;
$$;

COMMENT ON FUNCTION shared.fn_nav_tree_status_badges IS
  'Return conditional status counts (unfilled orders, open work orders, etc.) for nav tree targets. Returns status_key, label, count, and severity level for colored badges.';

COMMIT;