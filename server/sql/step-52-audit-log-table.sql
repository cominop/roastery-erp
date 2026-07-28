-- Step 52: Audit trail — audit_log table + indexes
-- Target: shared.audit_log in polyaccess database
--
-- Records every INSERT/UPDATE/DELETE on db_fcc_erp tables for
-- full change tracking, accountability, and debugging.
--
-- Fire-and-forget inserts from the CRUD routes — never blocks
-- the main data operation.

BEGIN;

CREATE TABLE IF NOT EXISTS shared.audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was changed
  table_name      VARCHAR(255) NOT NULL,
  record_id       INTEGER      NOT NULL,

  -- What action
  action          VARCHAR(10)  NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),

  -- Before/after snapshots (JSONB for flexible diffing)
  old_data        JSONB,
  new_data        JSONB,

  -- Who did it (foreign key to db_fcc_erp."Users" or just store the ID)
  changed_by      INTEGER,
  changed_by_name VARCHAR(255),

  -- When
  changed_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Tenant scoping (matches existing company_id=1 pattern)
  company_id      INTEGER      NOT NULL DEFAULT 1
);

-- Index for lookup by table + record (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_audit_log_record
  ON shared.audit_log (table_name, record_id);

-- Index for time-based queries (recent changes, date range filtering)
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
  ON shared.audit_log (changed_at DESC);

-- Index for action-based filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON shared.audit_log (action);

-- Composite index for full-page listing (filter by table + date range)
CREATE INDEX IF NOT EXISTS idx_audit_log_table_date
  ON shared.audit_log (table_name, changed_at DESC);

-- Index for user-based queries
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON shared.audit_log (changed_by);

COMMIT;
