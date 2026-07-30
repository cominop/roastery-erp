-- Step 85: Metadata Deployment 6 — Automatic backup before import
--
-- Creates the shared.metadata_backups table to track all metadata
-- backups created before imports (or manually).
--
-- Run: psql polyaccess -f server/sql/step-85-metadata-backups.sql

CREATE TABLE IF NOT EXISTS shared.metadata_backups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path        TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    reason      TEXT,             -- 'pre_import', 'manual', 'scheduled'
    size_bytes  BIGINT,
    checksum    TEXT NOT NULL
);

-- Index on created_at for reverse-chronological listing
CREATE INDEX IF NOT EXISTS idx_metadata_backups_created_at
    ON shared.metadata_backups (created_at DESC);

-- Index on reason for filtering by type
CREATE INDEX IF NOT EXISTS idx_metadata_backups_reason
    ON shared.metadata_backups (reason);