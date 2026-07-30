-- Step 86: Metadata Deployment 7 — Rollback from backup
--
-- Creates the shared.metadata_imports table to track all metadata
-- imports and rollbacks, linking them to the metadata_backups table.
--
-- Run: psql polyaccess -f server/sql/step-86-rollback.sql

CREATE TABLE IF NOT EXISTS shared.metadata_imports (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename          TEXT NOT NULL,
    checksum          TEXT NOT NULL,
    imported_by       UUID,
    imported_at       TIMESTAMP DEFAULT NOW(),
    status            TEXT DEFAULT 'completed'
      CHECK (status IN ('pending', 'importing', 'completed', 'failed', 'rolled_back')),
    backup_path       TEXT,
    rollback_at       TIMESTAMP,
    rollback_backup_id UUID REFERENCES shared.metadata_backups(id),
    error_log         TEXT,
    import_log        TEXT
);

-- Index on imported_at for reverse-chronological listing
CREATE INDEX IF NOT EXISTS idx_metadata_imports_imported_at
    ON shared.metadata_imports (imported_at DESC);

-- Index on status for filtering active/rolled-back imports
CREATE INDEX IF NOT EXISTS idx_metadata_imports_status
    ON shared.metadata_imports (status);