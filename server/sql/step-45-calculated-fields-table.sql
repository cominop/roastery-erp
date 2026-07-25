-- Step 45: Calculated field definition table
-- Target: shared.calculated_fields in polyaccess database
--
-- Stores calculated field definitions used by the expression
-- parser/evaluator (Steps 42-44). Each row defines a computation
-- that is evaluated at runtime against a db_fcc_erp record context.

BEGIN;

CREATE TABLE IF NOT EXISTS shared.calculated_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name       VARCHAR(255) NOT NULL,            -- snake_case identifier
  caption    VARCHAR(255) NOT NULL,            -- display label
  table_name VARCHAR(255) NOT NULL,            -- belongs to this db_fcc_erp table

  -- Calculation
  calc_type  VARCHAR(20)  NOT NULL CHECK (calc_type IN ('scalar', 'aggregate', 'lookup', 'formula', 'stored')),
  expression TEXT         NOT NULL,             -- the calculation expression
  data_type  VARCHAR(20)  NOT NULL CHECK (data_type IN ('text', 'number', 'currency', 'boolean', 'date')),

  -- Dependencies
  depends_on        TEXT[] DEFAULT '{}',        -- field names this calc depends on
  depends_on_tables TEXT[] DEFAULT '{}',        -- related tables (for aggregates)

  -- Behaviour
  read_only      BOOLEAN      DEFAULT true,
  refresh_on     VARCHAR(10)  DEFAULT 'read' CHECK (refresh_on IN ('read', 'save', 'manual')),
  null_when_empty BOOLEAN     DEFAULT false,

  -- Display formatting
  format   VARCHAR(100),                        -- e.g. "$%.2f", "%d items"
  decimals INTEGER,
  prefix   VARCHAR(50),
  suffix   VARCHAR(50),

  -- UX flags
  visible   BOOLEAN DEFAULT true,
  sortable  BOOLEAN DEFAULT true,
  filterable BOOLEAN DEFAULT false,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(name, table_name)
);

-- Index for looking up fields by table
CREATE INDEX IF NOT EXISTS idx_calculated_fields_table_name
  ON shared.calculated_fields (table_name);

COMMIT;
