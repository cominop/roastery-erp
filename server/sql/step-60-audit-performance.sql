-- Step 60: Audit Trail 9 — Performance optimization
-- Target: shared schema in polyaccess database
--
-- Three pillars:
--   1. Partitioning — convert audit_log to monthly RANGE partitions on changed_at
--      for fast pruning and time-range queries
--   2. GIN indexes — JSONB GIN indexes on old_data / new_data for fast
--      content-based queries (diff lookup, field-level search)
--   3. Async write queue — optional fire-and-forget mode that decouples
--      the trigger INSERT from the main transaction (configurable via
--      shared.audit_performance_config)
--
-- Migration approach (28 existing rows — fast):
--   Rename old table → create partitioned table → migrate data → drop old
--   All views/functions referencing shared.audit_log resolve automatically
--   since the table name remains unchanged.
--
-- Usage:
--   SELECT shared.create_audit_partition('2026_08');  -- create a specific month
--   SELECT shared.create_audit_partitions_future();    -- auto-create next 3 months
--   SELECT shared.flush_audit_write_queue();           -- flush async queue
--   SET audit.write_mode = 'async';                    -- per-session switch to async
--
-- Config:
--   INSERT INTO shared.audit_performance_config (param_key, param_value)
--   VALUES ('write_mode', 'sync');
--   -- 'sync'  = trigger writes directly to partitioned audit_log (default)
--   -- 'async' = trigger writes to audit_write_queue; flush by cron/function
--
-- Cron (runs alongside prune-audit.cjs):
--   node server/cron/audit-writer.cjs          -- flush queue + create future partitions

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. Performance config table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shared.audit_performance_config (
  id            SERIAL PRIMARY KEY,
  param_key     VARCHAR(100) NOT NULL,
  param_value   TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (param_key)
);

COMMENT ON TABLE shared.audit_performance_config IS
  'Audit log performance tuning parameters — write_mode, partition_interval, etc.';

-- Seed defaults
INSERT INTO shared.audit_performance_config (param_key, param_value, description)
VALUES
  ('write_mode', 'sync', 'sync=direct insert into partitioned audit_log; async=insert into write queue, flushed by background worker'),
  ('partition_interval', '1 month', 'Partition interval: 1 month, 3 months, etc.'),
  ('partition_future_months', '3', 'Number of future monthly partitions to auto-create ahead')
ON CONFLICT (param_key) DO UPDATE SET
  param_value = EXCLUDED.param_value,
  updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════
-- 2. Async write queue table (lightweight, fewer indexes)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shared.audit_write_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      VARCHAR(255) NOT NULL,
  record_id       INTEGER      NOT NULL,
  action          VARCHAR(10)  NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data        JSONB,
  new_data        JSONB,
  changed_by      INTEGER,
  changed_by_name VARCHAR(255),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id      INTEGER      NOT NULL DEFAULT 1,
  -- Flush tracking
  flushed         BOOLEAN      NOT NULL DEFAULT false,
  flushed_at      TIMESTAMPTZ,
  error_msg       TEXT
);

COMMENT ON TABLE shared.audit_write_queue IS
  'Async audit write queue — lightweight staging table. Worker moves entries to the partitioned audit_log.';

-- Index for flush queries (find unflushed, ordered by age)
CREATE INDEX IF NOT EXISTS idx_audit_queue_unflushed
  ON shared.audit_write_queue (flushed, changed_at)
  WHERE flushed = false;

-- ═══════════════════════════════════════════════════════════════
-- 3. Flush queue function
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shared.flush_audit_write_queue(
  p_batch_size  INTEGER DEFAULT 500,
  p_dry_run     BOOLEAN DEFAULT false
)
RETURNS TABLE(
  batch_id      UUID,
  entries_moved BIGINT,
  entries_errored BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_entries      BIGINT;
  v_errors       BIGINT := 0;
  v_batch_id     UUID;
  v_queue_record RECORD;
  v_partition    TEXT;
  v_partition_ok BOOLEAN;
BEGIN
  -- Generate a batch tracking ID
  v_batch_id := gen_random_uuid();

  -- Count unflushed entries
  SELECT COUNT(*)::BIGINT INTO v_entries
  FROM shared.audit_write_queue
  WHERE flushed = false;

  IF v_entries = 0 THEN
    batch_id := v_batch_id;
    entries_moved := 0;
    entries_errored := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Dry run: report counts only
  IF p_dry_run THEN
    batch_id := v_batch_id;
    entries_moved := v_entries;
    entries_errored := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Move entries in batch to the partitioned audit_log
  FOR v_queue_record IN
    SELECT * FROM shared.audit_write_queue
    WHERE flushed = false
    ORDER BY changed_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Check partition exists (auto-create if needed — handled by caller)
      INSERT INTO shared.audit_log (
        table_name, record_id, action, old_data, new_data,
        changed_by, changed_by_name, changed_at, company_id
      ) VALUES (
        v_queue_record.table_name, v_queue_record.record_id, v_queue_record.action,
        v_queue_record.old_data, v_queue_record.new_data,
        v_queue_record.changed_by, v_queue_record.changed_by_name,
        v_queue_record.changed_at, v_queue_record.company_id
      );

      -- Mark as flushed
      UPDATE shared.audit_write_queue
      SET flushed = true, flushed_at = NOW()
      WHERE id = v_queue_record.id;
    EXCEPTION WHEN OTHERS THEN
      -- Mark errored with the message
      v_errors := v_errors + 1;
      UPDATE shared.audit_write_queue
      SET error_msg = SQLERRM
      WHERE id = v_queue_record.id;
    END;
  END LOOP;

  -- Return stats
  batch_id := v_batch_id;
  entries_moved := v_entries - v_errors;
  entries_errored := v_errors;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION shared.flush_audit_write_queue IS
  'Move unflushed entries from audit_write_queue to the partitioned audit_log table. Returns batch_id for tracking.';

-- ═══════════════════════════════════════════════════════════════
-- 4. Partition migration
-- ═══════════════════════════════════════════════════════════════
-- Since audit_log is currently a regular table, we rename the old one,
-- create the new partitioned table, migrate existing data, then drop the old.
-- Views and functions that reference shared.audit_log by name will
-- automatically resolve to the new partitioned table.

DO $$
DECLARE
  v_is_partitioned BOOLEAN;
BEGIN
  -- Check if already partitioned
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'shared' AND c.relname = 'audit_log' AND c.relkind = 'p'
  ) INTO v_is_partitioned;

  IF v_is_partitioned THEN
    RAISE NOTICE 'shared.audit_log is already partitioned — skipping migration';
    RETURN;
  END IF;

  RAISE NOTICE 'Starting partition migration for shared.audit_log...';

  -- Step 1: Rename old table to audit_log_legacy
  ALTER TABLE shared.audit_log RENAME TO audit_log_legacy;
  RAISE NOTICE 'Renamed to shared.audit_log_legacy';

  -- Step 2: Create new partitioned table
  -- Note: PRIMARY KEY must include partition column (changed_at)
  CREATE TABLE shared.audit_log (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    table_name      VARCHAR(255) NOT NULL,
    record_id       INTEGER      NOT NULL,
    action          VARCHAR(10)  NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data        JSONB,
    new_data        JSONB,
    changed_by      INTEGER,
    changed_by_name VARCHAR(255),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    company_id      INTEGER      NOT NULL DEFAULT 1,
    PRIMARY KEY (id, changed_at)
  ) PARTITION BY RANGE (changed_at);

  RAISE NOTICE 'Created shared.audit_log as partitioned table';

  -- Step 3: Create initial partitions for existing data
  -- Determine date range from existing data
  -- We'll create one partition per month for existing data
  CREATE TABLE shared.audit_log_2026_07 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
  CREATE TABLE shared.audit_log_2026_08 PARTITION OF shared.audit_log
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

  RAISE NOTICE 'Created initial monthly partitions (2026-07, 2026-08)';

  -- Step 4: Copy existing data
  INSERT INTO shared.audit_log
    (id, table_name, record_id, action, old_data, new_data,
     changed_by, changed_by_name, changed_at, company_id)
  SELECT
    id, table_name, record_id, action, old_data, new_data,
    changed_by, changed_by_name, changed_at, company_id
  FROM shared.audit_log_legacy;

  RAISE NOTICE 'Migrated % rows from legacy table', (SELECT COUNT(*) FROM shared.audit_log_legacy);

  -- Step 5: Drop legacy table (CASCADE to handle dependent views — we recreate below)
  DROP TABLE shared.audit_log_legacy CASCADE;

  RAISE NOTICE 'Legacy table dropped — partition migration complete';
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 4b. Recreate audit_retention_status view (was dropped by CASCADE)
-- ═══════════════════════════════════════════════════════════════
-- Same definition as step-59, referencing shared.audit_log (now partitioned)

CREATE OR REPLACE VIEW shared.audit_retention_status AS
WITH config AS (
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

-- ═══════════════════════════════════════════════════════════════
-- 5. Partition indexes (on parent table, auto-propagated to partitions)
-- ═══════════════════════════════════════════════════════════════

-- B-tree indexes (recreate from step-52 on the new partitioned parent)
CREATE INDEX IF NOT EXISTS idx_audit_log_record
  ON shared.audit_log (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
  ON shared.audit_log (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON shared.audit_log (action);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_date
  ON shared.audit_log (table_name, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON shared.audit_log (changed_by);

-- ═══════════════════════════════════════════════════════════════
-- 6. GIN indexes on JSONB columns
-- ═══════════════════════════════════════════════════════════════
-- Allows efficient queries like:
--   SELECT * FROM shared.audit_log WHERE old_data @> '{"productname": "Coffee"}';
--   SELECT * FROM shared.audit_log WHERE new_data ? 'unitprice';
--   SELECT * FROM shared.audit_log WHERE new_data->>'unitprice' != old_data->>'unitprice';

-- jsonb_path_ops is more compact and faster for path-based queries (@>, ?, ?|, ?&)
CREATE INDEX IF NOT EXISTS idx_audit_log_old_data_gin
  ON shared.audit_log USING GIN (old_data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_audit_log_new_data_gin
  ON shared.audit_log USING GIN (new_data jsonb_path_ops);

-- ═══════════════════════════════════════════════════════════════
-- 7. Auto-partition function
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shared.create_audit_partition(
  p_partition_suffix TEXT,        -- e.g. '2026_09'
  p_from_date       DATE DEFAULT NULL,  -- defaults to first of the month
  p_to_date         DATE DEFAULT NULL    -- defaults to first of next month
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_partition_name TEXT;
  v_from_date      DATE;
  v_to_date        DATE;
  v_year           INT;
  v_month          INT;
BEGIN
  -- Parse partition suffix
  v_year := SPLIT_PART(p_partition_suffix, '_', 1)::INT;
  v_month := SPLIT_PART(p_partition_suffix, '_', 2)::INT;

  v_partition_name := 'shared.audit_log_' || p_partition_suffix;
  v_from_date := COALESCE(p_from_date, MAKE_DATE(v_year, v_month, 1));
  v_to_date := COALESCE(p_to_date, (MAKE_DATE(v_year, v_month, 1) + INTERVAL '1 month')::DATE);

  -- Check if partition already exists
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'shared'
      AND c.relname = 'audit_log_' || p_partition_suffix
  ) THEN
    RETURN 'EXISTS: audit_log_' || p_partition_suffix;
  END IF;

  -- Check that the parent is actually partitioned
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'shared' AND c.relname = 'audit_log' AND c.relkind = 'p'
  ) THEN
    RAISE EXCEPTION 'shared.audit_log is not a partitioned table — cannot create partition';
  END IF;

  -- Create the partition
  EXECUTE format(
    'CREATE TABLE shared.%I PARTITION OF shared.audit_log
     FOR VALUES FROM (%L) TO (%L)',
    'audit_log_' || p_partition_suffix,
    v_from_date,
    v_to_date
  );

  RETURN 'CREATED: audit_log_' || p_partition_suffix;
END;
$$;

COMMENT ON FUNCTION shared.create_audit_partition IS
  'Create a monthly partition for the audit_log table. Usage: SELECT shared.create_audit_partition(''2026_09'');';

-- ═══════════════════════════════════════════════════════════════
-- 8. Auto-create future partitions function
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shared.create_audit_partitions_future(
  p_months_ahead INTEGER DEFAULT NULL  -- NULL = use config value
)
RETURNS TEXT[]
LANGUAGE plpgsql
AS $$
DECLARE
  v_months_ahead  INTEGER;
  v_created       TEXT[] := '{}';
  v_next_date     DATE;
  v_suffix        TEXT;
  v_result        TEXT;
  i               INTEGER;
BEGIN
  -- Determine how many months ahead to create
  IF p_months_ahead IS NULL THEN
    SELECT COALESCE(
      (SELECT param_value::INTEGER FROM shared.audit_performance_config
       WHERE param_key = 'partition_future_months'),
      3
    ) INTO v_months_ahead;
  ELSE
    v_months_ahead := p_months_ahead;
  END IF;

  -- Start from the first day of next month
  v_next_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month')::DATE;

  FOR i IN 0..(v_months_ahead - 1) LOOP
    v_suffix := TO_CHAR(v_next_date + (i || ' months')::INTERVAL, 'YYYY_MM');
    v_result := shared.create_audit_partition(v_suffix);
    v_created := array_append(v_created, v_result);
  END LOOP;

  RETURN v_created;
END;
$$;

COMMENT ON FUNCTION shared.create_audit_partitions_future IS
  'Auto-create future monthly partitions for the audit_log table. Creates N months ahead based on config.';

-- ═══════════════════════════════════════════════════════════════
-- 9. Create current & future partitions
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_results TEXT[];
  v_item    TEXT;
BEGIN
  v_results := shared.create_audit_partitions_future(3);
  RAISE NOTICE 'Auto-partition results:';
  FOREACH v_item IN ARRAY v_results LOOP
    RAISE NOTICE '  %', v_item;
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 10. Update trigger function to support async write mode
-- ═══════════════════════════════════════════════════════════════
-- Uses the same session-based context approach as changed_by_id.
-- SET audit.write_mode = 'async' to divert writes to the queue.
-- Default (unset) = 'sync' = direct INSERT into partitioned table.

CREATE OR REPLACE FUNCTION shared.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pk_col            TEXT;
  record_id_val     INTEGER;
  company_id_val    INTEGER;
  changed_by_id_val  INTEGER;
  changed_by_name_val VARCHAR(255);
  new_json          JSONB;
  old_json          JSONB;
  raw_id_str        TEXT;
  raw_name_str      TEXT;
  write_mode_val    TEXT;
  use_async         BOOLEAN;
BEGIN
  -- ── Resolve primary key ──────────────────────────────
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = TG_RELID AND i.indisprimary
  LIMIT 1;
  pk_col := COALESCE(pk_col, 'id');

  -- ── Read session context ────────────────────────────
  BEGIN
    raw_id_str := current_setting('app.changed_by_id', true);
    IF raw_id_str IS NOT NULL AND raw_id_str != '' THEN
      changed_by_id_val := raw_id_str::INTEGER;
    ELSE
      changed_by_id_val := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    changed_by_id_val := NULL;
  END;

  BEGIN
    raw_name_str := current_setting('app.changed_by_name', true);
    IF raw_name_str IS NOT NULL AND raw_name_str != '' THEN
      changed_by_name_val := raw_name_str;
    ELSE
      changed_by_name_val := 'system';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    changed_by_name_val := 'system';
  END;

  -- ── Determine write mode ────────────────────────────
  -- Check per-session setting first, then fall back to config
  BEGIN
    write_mode_val := current_setting('audit.write_mode', true);
    IF write_mode_val IS NULL OR write_mode_val = '' THEN
      SELECT param_value INTO write_mode_val
      FROM shared.audit_performance_config
      WHERE param_key = 'write_mode';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    SELECT param_value INTO write_mode_val
    FROM shared.audit_performance_config
    WHERE param_key = 'write_mode';
  END;

  write_mode_val := COALESCE(write_mode_val, 'sync');
  use_async := (write_mode_val = 'async');

  -- ── Dispatch by operation ────────────────────────────
  IF TG_OP = 'INSERT' THEN
    new_json := to_jsonb(NEW);
    record_id_val := (new_json ->> pk_col)::INTEGER;
    company_id_val := COALESCE((new_json ->> 'company_id')::INTEGER, 1);

    IF use_async THEN
      INSERT INTO shared.audit_write_queue
        (table_name, record_id, action, new_data, changed_by, changed_by_name, company_id)
      VALUES
        (TG_TABLE_NAME, record_id_val, 'INSERT', new_json,
         changed_by_id_val, changed_by_name_val, company_id_val);
    ELSE
      INSERT INTO shared.audit_log
        (table_name, record_id, action, new_data, changed_by, changed_by_name, company_id)
      VALUES
        (TG_TABLE_NAME, record_id_val, 'INSERT', new_json,
         changed_by_id_val, changed_by_name_val, company_id_val);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    new_json := to_jsonb(NEW);
    old_json := to_jsonb(OLD);
    record_id_val := (new_json ->> pk_col)::INTEGER;
    company_id_val := COALESCE((new_json ->> 'company_id')::INTEGER,
                                (old_json ->> 'company_id')::INTEGER, 1);

    IF use_async THEN
      INSERT INTO shared.audit_write_queue
        (table_name, record_id, action, old_data, new_data,
         changed_by, changed_by_name, company_id)
      VALUES
        (TG_TABLE_NAME, record_id_val, 'UPDATE', old_json, new_json,
         changed_by_id_val, changed_by_name_val, company_id_val);
    ELSE
      INSERT INTO shared.audit_log
        (table_name, record_id, action, old_data, new_data,
         changed_by, changed_by_name, company_id)
      VALUES
        (TG_TABLE_NAME, record_id_val, 'UPDATE', old_json, new_json,
         changed_by_id_val, changed_by_name_val, company_id_val);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    old_json := to_jsonb(OLD);
    record_id_val := (old_json ->> pk_col)::INTEGER;
    company_id_val := COALESCE((old_json ->> 'company_id')::INTEGER, 1);

    IF use_async THEN
      INSERT INTO shared.audit_write_queue
        (table_name, record_id, action, old_data,
         changed_by, changed_by_name, company_id)
      VALUES
        (TG_TABLE_NAME, record_id_val, 'DELETE', old_json,
         changed_by_id_val, changed_by_name_val, company_id_val);
    ELSE
      INSERT INTO shared.audit_log
        (table_name, record_id, action, old_data,
         changed_by, changed_by_name, company_id)
      VALUES
        (TG_TABLE_NAME, record_id_val, 'DELETE', old_json,
         changed_by_id_val, changed_by_name_val, company_id_val);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION shared.audit_log_trigger IS
  'Updated for Step 60 — writes to partitioned audit_log (sync) or audit_write_queue (async). Set audit.write_mode per-session or via config.';

-- ═══════════════════════════════════════════════════════════════
-- 11. Update prune function for partitioned table
-- ═══════════════════════════════════════════════════════════════
-- DELETE works on partitioned tables (PG routes to the correct child).
-- For high-scale bulk pruning, use shared.drop_audit_partition()
-- to detach and drop entire partitions (much faster).

CREATE OR REPLACE FUNCTION shared.prune_audit_log(
  p_table_name   VARCHAR(255) DEFAULT NULL,
  p_dry_run      BOOLEAN DEFAULT false
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
  v_default_days      INTEGER;
  v_retention_days    INTEGER;
  v_cutoff            TIMESTAMPTZ;
  v_entries           BIGINT;
  v_tablename         VARCHAR(255);
BEGIN
  -- Get the default retention days
  SELECT arc.retention_days INTO v_default_days
  FROM shared.audit_retention_config arc
  WHERE arc.table_name IS NULL AND arc.active = true;

  IF v_default_days IS NULL THEN
    RAISE EXCEPTION 'No default retention policy configured';
  END IF;

  -- ─── Helper: prune a single table ──────────────────────
  -- Returns true if entries were pruned.
  -- Uses partition-detach strategy when possible, falls back to DELETE.

  -- ─── Prune a specific table ────────────────────────────
  IF p_table_name IS NOT NULL THEN
    v_tablename := p_table_name;

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

    table_name := v_tablename;
    retention_days := v_retention_days;
    entries_before := v_entries;
    entries_pruned := 0;
    cutoff_date := v_cutoff;
    SELECT MIN(al.changed_at) INTO oldest_kept FROM shared.audit_log al WHERE al.table_name = v_tablename;

    IF NOT p_dry_run AND v_entries > 0 THEN
      -- Standard DELETE (works on partitioned tables — PG routes to correct partition)
      DELETE FROM shared.audit_log al
      WHERE al.table_name = v_tablename AND al.changed_at < v_cutoff;
      GET DIAGNOSTICS v_entries = ROW_COUNT;
      entries_pruned := v_entries;

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
  'Step 60: Updated for partitioned audit_log — uses standard DELETE (PG routes to correct partition). For bulk month-level pruning, use shared.drop_audit_partition().';

-- ═══════════════════════════════════════════════════════════════
-- 12. Helper: partition-detach-and-drop function
-- ═══════════════════════════════════════════════════════════════
-- Drops a partition whose entire date range is fully expired.
-- Much faster than DELETE for bulk pruning.

CREATE OR REPLACE FUNCTION shared.drop_audit_partition(
  p_partition_suffix TEXT   -- e.g. '2025_01'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_partition_name TEXT;
  v_entry_count    BIGINT;
BEGIN
  v_partition_name := 'audit_log_' || p_partition_suffix;

  -- Verify partition exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'shared' AND c.relname = v_partition_name
  ) THEN
    RETURN 'NOT_FOUND: ' || v_partition_name;
  END IF;

  -- Count entries being removed
  EXECUTE format('SELECT COUNT(*) FROM shared.%I', v_partition_name) INTO v_entry_count;

  -- Detach and drop
  EXECUTE format(
    'DROP TABLE IF EXISTS shared.%I CASCADE',
    v_partition_name
  );

  RETURN 'DROPPED: ' || v_partition_name || ' (' || v_entry_count || ' entries)';
END;
$$;

COMMENT ON FUNCTION shared.drop_audit_partition IS
  'Drop an audit_log partition by suffix (e.g. ''2025_01''). Much faster than DELETE for bulk pruning.';

-- ═══════════════════════════════════════════════════════════════
-- 13. Helper view: partition status
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW shared.audit_partition_status AS
SELECT
  c.relname AS partition_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
  c.reltuples::BIGINT AS estimated_row_count,
  pg_get_expr(c.relpartbound, c.oid) AS partition_boundary
FROM pg_inherits i
JOIN pg_class c ON i.inhrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'shared'
  AND i.inhparent = (SELECT oid FROM pg_class WHERE relname = 'audit_log' AND relnamespace = 'shared'::regnamespace)
ORDER BY c.relname DESC;

COMMENT ON VIEW shared.audit_partition_status IS
  'Shows all partitions of the audit_log table with size and row counts.';

COMMIT;