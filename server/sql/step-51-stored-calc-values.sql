-- Step 51: Stored calculation values table
-- Target: shared.calculated_field_values in polyaccess database
--
-- Stores pre-computed values for calc_type='stored' calculated fields.
-- Values are computed on save (POST/PUT) and read back on next load,
-- avoiding expensive re-computation on every read.
--
-- Also stores the expression snapshot so we can detect staleness
-- if the expression definition changes.

BEGIN;

CREATE TABLE IF NOT EXISTS shared.calculated_field_values (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity: which table + record + field this value belongs to
  table_name  VARCHAR(255) NOT NULL,
  record_id   INTEGER      NOT NULL,
  field_name  VARCHAR(255) NOT NULL,

  -- The computed value (stored as text, cast to the field's data_type on read)
  value       TEXT,

  -- Snapshot of the expression at time of computation
  -- Used for staleness detection when definition changes
  expression  TEXT,

  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  -- One value per field per record
  UNIQUE(table_name, record_id, field_name)
);

-- Index for bulk lookups (all stored values for a record)
CREATE INDEX IF NOT EXISTS idx_calc_field_values_record
  ON shared.calculated_field_values (table_name, record_id);

COMMIT;
