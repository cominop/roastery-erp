-- Step 54: Apply audit triggers to all 68 ERP tables
-- Target: db_fcc_erp schema — every table gets an AFTER INSERT/UPDATE/DELETE trigger
--
-- Depends on: step-52 (audit_log table) + step-53 (shared.audit_log_trigger() function)
--
-- Uses a DO block to dynamically create triggers for ALL user tables in db_fcc_erp.
-- The shared.audit_log_trigger() function handles PK discovery, company_id defaults,
-- and session-context resolution transparently.
--
-- To verify: SELECT tgname, relid::regclass FROM pg_trigger
--   WHERE NOT tgisinternal AND tgname LIKE 'trg_audit_%'
--   ORDER BY relid::regclass::text;

BEGIN;

DO $$
DECLARE
  tbl TEXT;
  trig_name TEXT;
  dup_ct INT;
BEGIN
  -- Iterate every regular table in the db_fcc_erp schema
  FOR tbl IN
    SELECT t.tablename
    FROM pg_catalog.pg_tables t
    WHERE t.schemaname = 'db_fcc_erp'
      AND t.tablename NOT LIKE 'pg_%'
    ORDER BY t.tablename
  LOOP
    trig_name := 'trg_audit_' || tbl;

    -- Guard: skip if trigger already exists
    SELECT COUNT(*) INTO dup_ct
    FROM pg_trigger pgtr
    JOIN pg_class pgc ON pgtr.tgrelid = pgc.oid
    JOIN pg_namespace pgn ON pgc.relnamespace = pgn.oid
    WHERE pgn.nspname = 'db_fcc_erp'
      AND pgc.relname = tbl
      AND pgtr.tgname = trig_name;

    IF dup_ct = 0 THEN
      EXECUTE format(
        'CREATE TRIGGER %I
         AFTER INSERT OR UPDATE OR DELETE ON db_fcc_erp.%I
         FOR EACH ROW EXECUTE FUNCTION shared.audit_log_trigger()',
        trig_name, tbl
      );
      RAISE NOTICE 'Created trigger %.% on db_fcc_erp.%', trig_name, trig_name, tbl;
    ELSE
      RAISE NOTICE 'Trigger %.% already exists, skipping', trig_name, trig_name;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
