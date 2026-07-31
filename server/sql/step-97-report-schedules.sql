-- Step 97: Reports 8 — Scheduled auto-generation (daily/weekly/monthly cron)
-- Target: shared schema in polyaccess database
--
-- Creates the report_schedule_log table that tracks every auto-generated report
-- run (when, for which report, what output was produced, any errors).
-- Also provides helper functions for the Node.js cron script.
--
-- Migration: idempotent (IF NOT EXISTS, ON CONFLICT)

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. report_schedule_log — audit trail for auto-generated reports
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shared.report_schedule_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES shared.report_definitions(id) ON DELETE CASCADE,
  report_name     VARCHAR(255) NOT NULL,
  caption         VARCHAR(255) NOT NULL,
  triggered_by    VARCHAR(50) NOT NULL DEFAULT 'cron',  -- 'cron', 'manual', 'api'
  format          VARCHAR(10) NOT NULL DEFAULT 'pdf',
  output_file     TEXT,
  output_size     BIGINT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, running, success, error
  error_message   TEXT,
  parameters      JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE shared.report_schedule_log IS
  'Audit trail for auto-generated and manually-triggered report runs.';

COMMENT ON COLUMN shared.report_schedule_log.report_id IS 'FK to shared.report_definitions.id.';
COMMENT ON COLUMN shared.report_schedule_log.triggered_by IS 'How the generation was triggered: cron, manual, api.';
COMMENT ON COLUMN shared.report_schedule_log.format IS 'Output format of the generated file.';
COMMENT ON COLUMN shared.report_schedule_log.output_file IS 'Relative path to the generated output file under server/output/.';
COMMENT ON COLUMN shared.report_schedule_log.output_size IS 'File size in bytes of the generated output.';
COMMENT ON COLUMN shared.report_schedule_log.status IS 'Generation status: pending, running, success, error.';
COMMENT ON COLUMN shared.report_schedule_log.error_message IS 'Error message if status = error.';
COMMENT ON COLUMN shared.report_schedule_log.parameters IS 'The parameters that were used for this generation run.';

-- Index for looking up the most recent run per report
CREATE INDEX IF NOT EXISTS idx_schedule_log_report_id
  ON shared.report_schedule_log (report_id, created_at DESC);

-- Index for recent runs listing
CREATE INDEX IF NOT EXISTS idx_schedule_log_created
  ON shared.report_schedule_log (created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 2. Helper: fn_reports_due_for_generation — find reports that
--    should be generated based on their auto_generate schedule
-- ═══════════════════════════════════════════════════════════════
--
-- Returns rows from shared.report_definitions where:
--   - auto_generate IS NOT NULL (has a schedule config)
--   - enabled = true
--   - The schedule indicates the report is DUE based on last successful run
--
-- The auto_generate JSONB has this shape:
--   {
--     "cron": "daily" | "weekly" | "monthly" | cron expression,
--     "format": "pdf" | "csv" | "xlsx",
--     "recipients": ["email@example.com", ...],
--     "subject": "Optional subject override"
--   }
--
-- Cron aliases supported:
--   "daily"   → every day at 6:00 AM
--   "weekly"  → every Monday at 6:00 AM
--   "monthly" → 1st of every month at 6:00 AM

CREATE OR REPLACE FUNCTION shared.fn_reports_due_for_generation()
RETURNS TABLE (
  id                UUID,
  name              VARCHAR,
  caption           VARCHAR,
  description       TEXT,
  category          VARCHAR,
  template_file     TEXT,
  output_formats    TEXT[],
  source_table      TEXT,
  filterable        BOOLEAN,
  parameters        JSONB,
  bands             JSONB,
  visible_to_roles  TEXT[],
  auto_generate     JSONB,
  enabled           BOOLEAN,
  company_id        INTEGER,
  last_run_at       TIMESTAMPTZ,
  last_status       VARCHAR
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rd.id,
    rd.name,
    rd.caption,
    rd.description,
    rd.category,
    rd.template_file,
    rd.output_formats,
    rd.source_table,
    rd.filterable,
    rd.parameters,
    rd.bands,
    rd.visible_to_roles,
    rd.auto_generate,
    rd.enabled,
    rd.company_id,
    latest.created_at AS last_run_at,
    latest.status AS last_status
  FROM shared.report_definitions rd
  LEFT JOIN LATERAL (
    SELECT created_at, status
    FROM shared.report_schedule_log
    WHERE report_id = rd.id AND status = 'success'
    ORDER BY created_at DESC
    LIMIT 1
  ) latest ON true
  WHERE rd.enabled = true
    AND rd.auto_generate IS NOT NULL
    AND rd.auto_generate->>'cron' IS NOT NULL
    AND (
      -- No successful run yet → due now
      latest.created_at IS NULL
      OR
      -- Determine if due based on cron alias
      (
        rd.auto_generate->>'cron' = 'daily'
        AND latest.created_at < CURRENT_DATE
      )
      OR
      (
        rd.auto_generate->>'cron' = 'weekly'
        AND latest.created_at < date_trunc('week', CURRENT_DATE)
      )
      OR
      (
        rd.auto_generate->>'cron' = 'monthly'
        AND latest.created_at < date_trunc('month', CURRENT_DATE)
      )
      OR
      (
        rd.auto_generate->>'cron' NOT IN ('daily', 'weekly', 'monthly')
        -- For custom cron expressions, return reports that haven't run today
        -- The cron script will do a more precise check via Node.js cron-parser
        AND (
          latest.created_at < CURRENT_DATE
          OR latest.created_at IS NULL
        )
      )
    )
  ORDER BY rd.category, rd.name;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. Helper: fn_get_report_last_run — get the last run info for a single report
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shared.fn_get_report_last_run(
  p_report_id UUID
)
RETURNS TABLE (
  last_run_at     TIMESTAMPTZ,
  last_status     VARCHAR,
  last_output     TEXT,
  last_format     VARCHAR,
  last_error      TEXT,
  total_runs      BIGINT,
  success_runs    BIGINT,
  error_runs      BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT created_at FROM shared.report_schedule_log
     WHERE report_id = p_report_id AND status = 'success'
     ORDER BY created_at DESC LIMIT 1) AS last_run_at,
    (SELECT status FROM shared.report_schedule_log
     WHERE report_id = p_report_id
     ORDER BY created_at DESC LIMIT 1) AS last_status,
    (SELECT output_file FROM shared.report_schedule_log
     WHERE report_id = p_report_id AND status = 'success'
     ORDER BY created_at DESC LIMIT 1) AS last_output,
    (SELECT format FROM shared.report_schedule_log
     WHERE report_id = p_report_id AND status = 'success'
     ORDER BY created_at DESC LIMIT 1) AS last_format,
    (SELECT error_message FROM shared.report_schedule_log
     WHERE report_id = p_report_id AND status = 'error'
     ORDER BY created_at DESC LIMIT 1) AS last_error,
    (SELECT COUNT(*) FROM shared.report_schedule_log
     WHERE report_id = p_report_id)::BIGINT AS total_runs,
    (SELECT COUNT(*) FROM shared.report_schedule_log
     WHERE report_id = p_report_id AND status = 'success')::BIGINT AS success_runs,
    (SELECT COUNT(*) FROM shared.report_schedule_log
     WHERE report_id = p_report_id AND status = 'error')::BIGINT AS error_runs;
END;
$$;

COMMIT;