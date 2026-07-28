-- Step 53: PostgreSQL trigger function for automatic audit logging
-- Target: shared schema, used by all db_fcc_erp tables
--
-- Replaces the fire-and-forget middleware-based audit inserts from Step 52
-- with a single DB-level trigger that:
--   1. Captures INSERT/UPDATE/DELETE automatically (no code duplication)
--   2. Uses to_jsonb() for OLD/NEW row snapshots
--   3. Reads changed_by from current_setting('app.changed_by_id') —
--      set per-request by Express middleware
--   4. Fires within the same transaction — never orphans an audit entry
--
-- Usage:
--   CREATE TRIGGER trg_audit_<table>
--     AFTER INSERT OR UPDATE OR DELETE ON db_fcc_erp."<table>"
--     FOR EACH ROW EXECUTE FUNCTION shared.audit_log_trigger();
--
-- The trigger gracefully handles tables WITHOUT a company_id column
-- (defaults to 1) and tables WITHOUT a primary key (defaults to 'id').
--
-- Step 54 will apply this trigger to all 42+ ERP tables.

BEGIN;

-- ─── Trigger Function ──────────────────────────────────
-- Fires on INSERT/UPDATE/DELETE of any row.
-- For INSERT: stores new_data
-- For UPDATE: stores old_data + new_data
-- For DELETE: stores old_data

CREATE OR REPLACE FUNCTION shared.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pk_col        TEXT;
  record_id_val INTEGER;
  company_id_val INTEGER;
  changed_by_id_val  INTEGER;
  changed_by_name_val VARCHAR(255);
  new_json      JSONB;
  old_json      JSONB;
  raw_id_str    TEXT;
  raw_name_str  TEXT;
BEGIN
  -- ── Resolve primary key ──────────────────────────────
  SELECT a.attname INTO pk_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = TG_RELID AND i.indisprimary
  LIMIT 1;
  pk_col := COALESCE(pk_col, 'id');

  -- ── Read session context (set by Express queryWithAudit) ──
  -- current_setting(..., true) returns NULL when unset,
  -- but may return '' on reused connections. Handle both.
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

  -- ── Dispatch by operation ────────────────────────────
  IF TG_OP = 'INSERT' THEN
    new_json := to_jsonb(NEW);
    record_id_val := (new_json ->> pk_col)::INTEGER;
    company_id_val := COALESCE((new_json ->> 'company_id')::INTEGER, 1);

    INSERT INTO shared.audit_log
      (table_name, record_id, action, new_data, changed_by, changed_by_name, company_id)
    VALUES
      (TG_TABLE_NAME, record_id_val, 'INSERT', new_json,
       changed_by_id_val, changed_by_name_val, company_id_val);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    new_json := to_jsonb(NEW);
    old_json := to_jsonb(OLD);
    record_id_val := (new_json ->> pk_col)::INTEGER;
    company_id_val := COALESCE((new_json ->> 'company_id')::INTEGER,
                                (old_json ->> 'company_id')::INTEGER, 1);

    INSERT INTO shared.audit_log
      (table_name, record_id, action, old_data, new_data,
       changed_by, changed_by_name, company_id)
    VALUES
      (TG_TABLE_NAME, record_id_val, 'UPDATE', old_json, new_json,
       changed_by_id_val, changed_by_name_val, company_id_val);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    old_json := to_jsonb(OLD);
    record_id_val := (old_json ->> pk_col)::INTEGER;
    company_id_val := COALESCE((old_json ->> 'company_id')::INTEGER, 1);

    INSERT INTO shared.audit_log
      (table_name, record_id, action, old_data,
       changed_by, changed_by_name, company_id)
    VALUES
      (TG_TABLE_NAME, record_id_val, 'DELETE', old_json,
       changed_by_id_val, changed_by_name_val, company_id_val);
    RETURN OLD;
  END IF;

  RETURN NULL; -- never reached
END;
$$;

COMMIT;
