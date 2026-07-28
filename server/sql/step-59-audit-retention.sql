-- Step 59: Audit Trail 8 — Retention policy + pruning (configurable, auto-cron)
-- Target: shared.audit_retention_config and shared.prune_audit_log() in polyaccess database
--
-- Provides:
--   1. audit_retention_config table — stores default retention days + per-table overrides
--   2. prune_audit_log() function — deletes entries older than their configured retention
--   3. Convenience queries for stats/preview
--
-- Usage:
--   SELECT * FROM shared.prune_audit_log();            -- prune all tables based on config
--   SELECT * FROM shared.prune_audit_log('products');  -- prune a specific table
--   SELECT * FROM shared.prune_audit_log(NULL, 90);    -- dry-run: show what would be pruned
--
-- Config:
--   INSERT INTO shared.audit_retention_config (table_name, retention_days)
--   VALUES (NULL, 365);           -- default: 365 days for all tables
--   INSERT INTO shared.audit_retention_config (table_name, retention_days)
--   VALUES ('audit_log', 730);    -- keep audit meta itself longer
--   INSERT INTO shared.audit_retention_config (table_name, retention_days)
--   VALUES ('order_details', 1825); -- keep order details 5 years
--
-- Auto-cron (run daily via system cron or API server):
--   node server/cron/prune-audit.cjs
--

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. Retention config table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shared.audit_retention_config (
  id              SERIAL PRIMARY KEY,

  -- NULL = default retention for all tables without an explicit override
  table_name      VARCHAR(255),

  -- Number of days to keep audit entries (entries older than this are pruned)
  retention_days  INTEGER NOT NULL CHECK (retention_days >= 1),

  -- Last time a prune run processed this config row
  last_pruned_at  TIMESTAMPTZ,

  -- Whether this row is active (inactive rows are skipped during pruning)
  active          BOOLEAN NOT NULL DEFAULT true,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Only one config per table (NULL table_name is the default, stored once)
  UNIQUE (table_name)
);

COMMENT ON TABLE shared.audit_retention_config IS
  'Audit log retention policy — configurable retention_days per table, with a global default row where table_name IS NULL';

COMMENT ON COLUMN shared.audit_retention_config.table_name IS
  'NULL = default retention for all tables; non-NULL = override for a specific table';

-- ═══════════════════════════════════════════════════════════════
-- 2. Seed default config (365 days = ~1 year)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO shared.audit_retention_config (table_name, retention_days)
SELECT NULL, 365
WHERE NOT EXISTS (SELECT 1 FROM shared.audit_retention_config WHERE table_name IS NULL);

-- ═══════════════════════════════════════════════════════════════
-- 3. Prune function
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shared.prune_audit_log(
  p_table_name   VARCHAR(255) DEFAULT NULL,  -- NULL = prune all tables per config
  p_dry_run      BOOLEAN DEFAULT false       -- true = return stats without deleting
)
RETURNS TABLE(
  table_name        VARCHAR(255),
  retention_days    INTEGER,
  entries_before    BIGINT,
  entries_pruned    BIGINT,
  oldest_kept       TIMESTAMPTZ,
  cutoff_date       TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_default_days   INTEGER;
  v_retention_days INTEGER;
  v_cutoff         TIMESTAMPTZ;
  v_entries        BIGINT;
  v_tablename      VARCHAR(255);
BEGIN
  -- Get the default retention days
  SELECT arc.retention_days INTO v_default_days
  FROM shared.audit_retention_config arc
  WHERE arc.table_name IS NULL AND arc.active = true;

  IF v_default_days IS NULL THEN
    RAISE EXCEPTION 'No default retention policy configured';
  END IF;

  -- ─── Prune a specific table ────────────────────────────
  IF p_table_name IS NOT NULL THEN
    v_tablename := p_table_name;

    -- Determine retention for this table (use override if exists, else default)
    SELECT COALESCE(
      (SELECT arc.retention_days
       FROM shared.audit_retention_config arc
       WHERE arc.table_name = v_tablename AND arc.active = true),
      v_default_days
    ) INTO v_retention_days;

    v_cutoff := NOW() - (v_retention_days || ' days')::INTERVAL;

    -- Count entries before prune
    SELECT COUNT(*)::BIGINT INTO v_entries
    FROM shared.audit_log al
    WHERE al.table_name = v_tablename AND al.changed_at < v_cutoff;

    -- Build return row
    table_name := v_tablename;
    retention_days := v_retention_days;
    entries_before := v_entries;
    entries_pruned := 0;
    cutoff_date := v_cutoff;
    SELECT MIN(al.changed_at) INTO oldest_kept FROM shared.audit_log al WHERE al.table_name = v_tablename;

    IF NOT p_dry_run AND v_entries > 0 THEN
      DELETE FROM shared.audit_log al
      WHERE al.table_name = v_tablename AND al.changed_at < v_cutoff;
      GET DIAGNOSTICS entries_pruned = ROW_COUNT;

      UPDATE shared.audit_retention_config arc
      SET last_pruned_at = NOW(), updated_at = NOW()
      WHERE arc.table_name = v_tablename;

      SELECT MIN(al.changed_at) INTO oldest_kept
      FROM shared.audit_log al
      WHERE al.table_name = v_tablename;
    END IF;

    RETURN NEXT;
    RETURN;

  END IF;

  -- ─── Prune ALL tables ──────────────────────────────────
  FOR v_tablename IN
    SELECT DISTINCT al.table_name FROM shared.audit_log al
  LOOP
    -- Determine retention
    SELECT COALESCE(
      (SELECT arc.retention_days
       FROM shared.audit_retention_config arc
       WHERE arc.table_name = v_tablename AND arc.active = true),
      v_default_days
    ) INTO v_retention_days;

    v_cutoff := NOW() - (v_retention_days || ' days')::INTERVAL;

    SELECT COUNT(*)::BIGINT INTO v_entries
    FROM shared.audit_log al
    WHERE al.table_name = v_tablename AND al.changed_at < v_cutoff;

    -- Build return row
    table_name := v_tablename;
    retention_days := v_retention_days;
    entries_before := v_entries;
    entries_pruned := 0;
    cutoff_date := v_cutoff;
    SELECT MIN(al.changed_at) INTO oldest_kept FROM shared.audit_log al WHERE al.table_name = v_tablename;

    IF NOT p_dry_run AND v_entries > 0 THEN
      DELETE FROM shared.audit_log al
      WHERE al.table_name = v_tablename AND al.changed_at < v_cutoff;
      GET DIAGNOSTICS entries_pruned = ROW_COUNT;

      UPDATE shared.audit_retention_config arc
      SET last_pruned_at = NOW(), updated_at = NOW()
      WHERE arc.table_name = v_tablename;

      SELECT MIN(al.changed_at) INTO oldest_kept
      FROM shared.audit_log al
      WHERE al.table_name = v_tablename;
    END IF;

    RETURN NEXT;
  END LOOP;

END;
$$;

COMMENT ON FUNCTION shared.prune_audit_log IS
  'Prune audit log entries older than configured retention. Pass table_name to prune one table, NULL for all. Set dry_run=true to preview without deleting.';

-- ═══════════════════════════════════════════════════════════════
-- 4. Helper view for admin UI
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW shared.audit_retention_status AS
WITH config AS (
  -- Resolved retention_days per each actual table in audit_log
  SELECT
    al.table_name,
    COALESCE(arc.retention_days, def.retention_days) AS effective_retention_days,
    arc.retention_days AS override_retention_days,
    arc.last_pruned_at,
    CASE WHEN arc.table_name IS NOT NULL THEN true ELSE false END AS has_override
  FROM (SELECT DISTINCT table_name FROM shared.audit_log) al
  LEFT JOIN shared.audit_retention_config arc ON arc.table_name = al.table_name AND arc.active = true
  CROSS JOIN (SELECT retention_days FROM shared.audit_retention_config WHERE table_name IS NULL AND active = true) def
),
stats AS (
  SELECT
    table_name,
    COUNT(*)::BIGINT AS entry_count,
    MIN(changed_at) AS oldest_entry,
    MAX(changed_at) AS newest_entry
  FROM shared.audit_log
  GROUP BY table_name
)
SELECT
  c.table_name,
  c.effective_retention_days,
  c.override_retention_days,
  c.has_override,
  c.last_pruned_at,
  COALESCE(s.entry_count, 0)::BIGINT AS entry_count,
  s.oldest_entry,
  s.newest_entry,
  -- Number of entries that WOULD be pruned with current config
  CASE
    WHEN s.entry_count > 0 THEN
      (SELECT COUNT(*)::BIGINT FROM shared.audit_log al2
       WHERE al2.table_name = c.table_name
         AND al2.changed_at < NOW() - (c.effective_retention_days || ' days')::INTERVAL)
    ELSE 0
  END::BIGINT AS prunable_count
FROM config c
LEFT JOIN stats s ON s.table_name = c.table_name
ORDER BY c.table_name;

COMMIT;