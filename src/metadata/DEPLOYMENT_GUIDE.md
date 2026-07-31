# Roastery ERP — Metadata Deployment Guide

## Overview

The metadata deployment system allows you to export ERP metadata (forms, fields,
events, navigation, permissions, reports, settings) from the database, package it
into a portable .zip archive, and import it into another environment. This
supports a dev → staging → prod promotion workflow.

### Architecture

```
Database ──[export]──→ JSON definitions ──[packager]──→ .zip archive
                                                              │
                    ┌─────────────────────────────────────────┘
                    ▼
              Validator ──→ Backup ──→ Upsert ──→ Target Database
```

---

## 1. Manual Export

Export current database metadata into a deployable .zip archive:

```bash
./src/metadata/scripts/export-metadata.sh --source development --message "Pre-deployment export"
```

What happens:
1. **Export** — Reads the database and writes JSON definition files to
   `src/metadata/export/definitions/`
2. **Package** — Bundles definitions into `deploy/erp_metadata_YYYY-MM-DD.zip`
   with manifest, checksums, and version file
3. **Git** — Commits the archive and tags it as `deploy/v<version>`

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--source <env>` | Environment label (dev/staging/prod) | `development` |
| `--message <text>` | Description of this export | `Metadata export` |
| `--help` | Show usage | — |

### Example

```bash
# Export tagged for staging
./src/metadata/scripts/export-metadata.sh --source staging --message "Release v1.2.0"
```

---

## 2. Manual Import

Import a metadata archive into the current database:

```bash
./src/metadata/scripts/import-metadata.sh --archive deploy/erp_metadata_2026-07-30.zip
```

What happens:
1. **Validate** — Verifies manifest structure, checksums, file completeness,
   and JSON parse validity
2. **Backup** — Creates an automatic backup (`auto-backup-*-before-import.zip`)
   recorded in the `shared.metadata_backups` table
3. **Upsert** — INSERT or UPDATE every definition row into the database

### Options

| Flag | Description |
|------|-------------|
| `--archive <path>` | Path to the metadata .zip archive (required) |
| `--skip-validation` | Skip manifest/checksum validation (for pre-validated archives) |
| `--help` | Show usage |

### Example

```bash
# Import with full validation
./src/metadata/scripts/import-metadata.sh --archive deploy/erp_metadata_2026-07-30.zip

# Import without re-validating (already checked in pipeline)
./src/metadata/scripts/import-metadata.sh --archive deploy/erp_metadata_2026-07-30.zip --skip-validation
```

---

## 3. Dev → Staging → Prod Promotion

### Single-machine simulation

In the current single-machine dev setup, promotion exports metadata, copies the
archive to a promotion-named file, and re-imports it to simulate multi-env flow:

```bash
# Promote from development to staging
./src/metadata/scripts/promote.sh --from dev --to staging

# Promote from staging to production
./src/metadata/scripts/promote.sh --from staging --to prod
```

### Promotion flow

```
Phase 1: Export from source
  └─ export-metadata.sh --source <from>
  └─ Archive created in deploy/

Phase 2: Transfer archive
  └─ Archive copied to deploy/promotion-<from>-to-<to>-<timestamp>.zip
  └─ Symlink created: deploy/latest-<to>.zip

Phase 3: Import to target
  └─ import-metadata.sh --archive <promo-archive>
  └─ Backup created automatically before import
  └─ Upsert all definitions into target database
```

### Real multi-environment setup

When deploying to separate machines:

1. **Export** on the source machine
2. **Transfer** the archive (e.g., `scp deploy/erp_metadata_*.zip user@target:~/deploy/`)
3. **Import** on the target machine:
   ```bash
   ssh target './src/metadata/scripts/import-metadata.sh --archive ~/deploy/erp_metadata_2026-07-30.zip'
   ```

---

## 4. Verify a Deployment

After an import or promotion, verify the metadata is correct:

### UI Verification
- Open the ERP application
- Navigate through forms, navigation, and reports
- Check that changes are reflected correctly

### Diff Preview (UI)
- The Export/Import dialogs provide a diff preview before import
- Use the Diff Preview component to see what changed

### Backup List (UI)
- The Backup List shows all automatic and manual backups
- Each backup shows the reason, timestamp, and file path

### CLI Verification
```bash
# List available archives
ls -la deploy/*.zip

# List recorded backups
node server/metadata-backup.cjs --list 2>/dev/null || node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ database: 'polyaccess' });
  pool.query('SELECT id, reason, created_at, path FROM shared.metadata_backups ORDER BY created_at DESC LIMIT 5')
    .then(r => { console.table(r.rows); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
"

# Check archive contents
unzip -l deploy/erp_metadata_2026-07-30.zip | head -20
```

---

## 5. Roll Back

If an import causes issues, you can roll back to a previous state:

### Via UI (Backup List)
1. Open the Metadata Manager in the ERP UI
2. Go to the **Backup List** tab
3. Find the pre-import backup (reason: `pre_import`)
4. Click **Rollback** to restore metadata from that backup

### Via CLI
```bash
# List available backups
node server/metadata-rollback.cjs --list

# Preview a rollback (shows what will change)
node server/metadata-rollback.cjs --preview --backup-id <id>

# Execute rollback
node server/metadata-rollback.cjs --backup-id <id>
```

### Via direct restore
```bash
# If you have the backup .zip, re-import it as a regular archive
./src/metadata/scripts/import-metadata.sh --archive deploy/auto-backup-*-before-import.zip
```

Rolling back restores the database metadata to the state captured in the
backup. This is an idempotent UPSERT operation — running it multiple times
is safe.

---

## 6. CI/CD Pipeline

### GitHub Actions

A GitHub Actions workflow is available at `.github/workflows/metadata-deploy.yml`.
It automatically exports metadata when definition files change on `main` or
`staging`, and can be triggered manually via `workflow_dispatch`.

**Automatic trigger:**
- Pushes to `main` or `staging` branches that include changes under
  `src/metadata/export/definitions/*.json`

**Manual trigger:**
1. Go to Actions → **Metadata Deploy** → Run workflow
2. Select target: `staging` or `production`

**Secrets required:**
- `staging_DATABASE_URL` — PostgreSQL connection string for staging
- `production_DATABASE_URL` — PostgreSQL connection string for production

### npm Scripts

```bash
npm run metadata:export   # Export metadata via shell script
npm run metadata:import   # Import metadata via shell script
npm run metadata:promote  # Promote metadata between environments
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Export metadata | `npm run metadata:export -- --source development` |
| Import metadata | `npm run metadata:import -- --archive deploy/erp_metadata_*.zip` |
| Promote dev→staging | `npm run metadata:promote -- --from dev --to staging` |
| Promote staging→prod | `npm run metadata:promote -- --from staging --to prod` |
| List backups | `node server/metadata-rollback.cjs --list` |
| Roll back | `node server/metadata-rollback.cjs --backup-id <id>` |
| Run tests | `npm run test` |
| Build | `npm run build` |
