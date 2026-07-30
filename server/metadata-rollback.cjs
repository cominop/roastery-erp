#!/usr/bin/env node
/**
 * Metadata Rollback — Roastery ERP
 *
 * Step 86: Metadata Deployment 7 — Rollback from backup
 *
 * Restores metadata from a backup archive created by metadata-backup.cjs.
 * Validates the archive integrity, then UPSERTs the backed-up metadata back
 * into the database — effectively rolling back to the state at backup time.
 *
 * Usage:
 *   node server/metadata-rollback.cjs --backup-path deploy/auto-backup-2026-07-30-143000-before-import.zip
 *   node server/metadata-rollback.cjs --backup-id <uuid>
 *   node server/metadata-rollback.cjs --backup-path <path> --dry-run        # validate only
 *   node server/metadata-rollback.cjs --backup-id <uuid> --json             # machine-readable output
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { execSync } = require("child_process");
const { Pool } = require("pg");

// ─── Config ──────────────────────────────────────────

const SERVER_DIR = __dirname;
const PROJECT_DIR = path.resolve(SERVER_DIR, "..");
const IMPORTER_UPSERT_SCRIPT = path.join(SERVER_DIR, "metadata-importer-upsert.cjs");

const pool = new Pool({
  database: "polyaccess",
});

// ─── Helpers ─────────────────────────────────────────

function sha256Hex(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx < args.length - 1 ? args[idx + 1] : null;
  };
  return {
    backupPath: get("--backup-path") || null,
    backupId: get("--backup-id") || null,
    dryRun: args.includes("--dry-run"),
    json: args.includes("--json"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

function log(msg) {
  process.stderr.write(msg + "\n");
}

function parseJsonFromExec(stdout) {
  if (typeof stdout === "string") return JSON.parse(stdout);
  return JSON.parse(stdout.toString());
}

// ─── Main ────────────────────────────────────────────

async function run() {
  const opts = parseArgs();

  if (!opts.backupPath && !opts.backupId) {
    const msg = "No backup specified. Use --backup-path <path> or --backup-id <uuid>";
    if (opts.json) {
      process.stdout.write(JSON.stringify({ success: false, error: msg }) + "\n");
    } else {
      log(`✗ ${msg}`);
    }
    process.exit(1);
  }

  if (!opts.json) {
    log("");
    log("╔══════════════════════════════════════════════╗");
    log("║    Roastery ERP — Metadata Rollback         ║");
    log("╚══════════════════════════════════════════════╝");
    if (opts.dryRun) log("  [DRY RUN MODE] No changes will be persisted");
    log("");
  }

  try {
    // ── Stage 1: Resolve backup path ───────────────────
    let backupPath = opts.backupPath;

    if (opts.backupId && !backupPath) {
      if (!opts.json) log("→ Looking up backup by ID...");

      const { rows } = await pool.query(
        "SELECT * FROM shared.metadata_backups WHERE id = $1",
        [opts.backupId]
      );

      if (rows.length === 0) {
        throw new Error(`Backup not found: id=${opts.backupId}`);
      }

      backupPath = rows[0].path;
      if (!opts.json) {
        log(`  ✓ Found backup: id=${rows[0].id}, path=${backupPath}, created=${rows[0].created_at}`);
      }
    }

    if (!backupPath) {
      throw new Error("Could not resolve backup path");
    }

    backupPath = path.resolve(backupPath);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup archive not found on disk: ${backupPath}`);
    }

    const archiveStats = fs.statSync(backupPath);
    const sizeKB = (archiveStats.size / 1024).toFixed(0);
    const archiveChecksum = `sha256:${sha256Hex(backupPath)}`;

    if (!opts.json) {
      log(`  Archive: ${backupPath} (${sizeKB} KB)`);
      log(`  Checksum: ${archiveChecksum}`);
      log("");
    }

    // ── Stage 2: Validate the backup archive ───────────
    if (!opts.json) log("→ Validating backup archive integrity...");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-rollback-"));
    const extractDir = path.join(tmpDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });

    try {
      // Extract
      execSync(`unzip -o "${backupPath}" -d "${extractDir}"`, {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
      });

      // Validate manifest
      const manifestPath = path.join(extractDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        throw new Error("Archive is invalid: manifest.json missing");
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      // Minimal required manifest fields
      const requiredFields = ["manifest_version", "created_at", "checksums"];
      for (const field of requiredFields) {
        if (!(field in manifest)) {
          throw new Error(`Archive is invalid: manifest.json missing "${field}"`);
        }
      }

      // Validate checksums
      if (manifest.checksums) {
        for (const [relPath, expectedHash] of Object.entries(manifest.checksums)) {
          const fullPath = path.join(extractDir, relPath);
          if (!fs.existsSync(fullPath)) {
            throw new Error(`Archive integrity check failed: ${relPath} not found in archive`);
          }
          const actualHex = sha256Hex(fullPath);
          const expectedHex = expectedHash.replace(/^sha256:/, "");
          if (actualHex !== expectedHex) {
            throw new Error(
              `Archive integrity check failed: ${relPath} checksum mismatch ` +
              `(expected ${expectedHex}, actual ${actualHex})`
            );
          }
        }
      }

      if (!opts.json) {
        log("  ✓ Archive integrity verified");
        log(`  ✓ Manifest: version ${manifest.manifest_version}, ` +
            `created ${manifest.created_at}, source "${manifest.source || "unknown"}"`);
        if (manifest.counts) {
          const totalRecords = Object.values(manifest.counts).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
          log(`  ✓ Contains ${totalRecords} metadata records across ${Object.keys(manifest.counts).length} types`);
        }
        log("");
      }

      // ── Stage 3: Dry-run check ────────────────────────
      if (opts.dryRun) {
        if (!opts.json) {
          log("→ [DRY RUN] Validating roll readiness (no changes)...");
          log("  ✓ Archive is valid and ready for rollback");
          log("");
          log("╔══════════════════════════════════════════════╗");
          log("║       Rollback Dry-Run Complete              ║");
          log("╚══════════════════════════════════════════════╝");
          log(`  Archive:       ${backupPath}`);
          log(`  Size:          ${sizeKB} KB`);
          log(`  Checksum:      ${archiveChecksum}`);
          log(`  Manifest:      v${manifest.manifest_version}`);
          log(`  Created:       ${manifest.created_at}`);
          log("");
        } else {
          process.stdout.write(JSON.stringify({
            success: true,
            dryRun: true,
            message: "Archive is valid and ready for rollback",
            backup: {
              path: backupPath,
              size_bytes: archiveStats.size,
              size_kb: Number(sizeKB),
              checksum: archiveChecksum,
            },
            manifest,
          }, null, 2) + "\n");
        }

        // Clean up temp (pool.end() is handled by the finally block)
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return;
      }

      // ── Stage 4: Perform the rollback UPSERT ──────────
      if (!opts.json) log("→ Performing metadata rollback (UPSERT from backup)...");

      const upsertResult = execSync(
        `node "${IMPORTER_UPSERT_SCRIPT}" --archive "${backupPath}" --skip-validation`,
        {
          cwd: PROJECT_DIR,
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 120000,
          encoding: "utf-8",
        }
      );

      // Capture the upsert stdout for the import log
      const upsertStdout = typeof upsertResult === "string" ? upsertResult : upsertResult.stdout?.toString() || "";

      if (!opts.json) {
        // Print the import output (it may have errors within it)
        const lines = upsertStdout.split("\n").filter(l => l.trim());
        for (const line of lines) {
          log(`  ${line}`);
        }
        log("");
        log("  ✓ Rollback UPSERT completed");
        log("");
      }

      // ── Stage 5: Record rollback in metadata_imports ──
      if (!opts.json) log("→ Recording rollback in metadata_imports...");

      try {
        // Create the metadata_imports table if it doesn't exist
        await pool.query(`
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
          )
        `);

        // Find the backup record ID if we resolved from path (not from --backup-id)
        let backupRecordId = opts.backupId;
        if (!backupRecordId) {
          const { rows: backupRows } = await pool.query(
            "SELECT id FROM shared.metadata_backups WHERE path = $1 ORDER BY created_at DESC LIMIT 1",
            [backupPath]
          );
          if (backupRows.length > 0) {
            backupRecordId = backupRows[0].id;
          }
        }

        await pool.query(
          `INSERT INTO shared.metadata_imports
           (filename, checksum, status, backup_path, rollback_at, rollback_backup_id, import_log)
           VALUES ($1, $2, 'rolled_back', $3, NOW(), $4, $5)`,
          [
            path.basename(backupPath),
            archiveChecksum,
            backupPath,
            backupRecordId || null,
            upsertStdout.slice(0, 5000),
          ]
        );

        if (!opts.json) {
          log("  ✓ Rollback recorded in metadata_imports");
        }
      } catch (dbErr) {
        // Non-fatal — the rollback already happened; just warn
        log(`  ⚠ Warning: could not record rollback in DB: ${dbErr.message}`);
      }

      // ── Clean up temp ────────────────────────────────
      fs.rmSync(tmpDir, { recursive: true, force: true });

      // ── Output ────────────────────────────────────────
      if (opts.json) {
        process.stdout.write(JSON.stringify({
          success: true,
          dryRun: false,
          message: "Rollback completed successfully",
          backup: {
            path: backupPath,
            size_bytes: archiveStats.size,
            size_kb: Number(sizeKB),
            checksum: archiveChecksum,
          },
        }, null, 2) + "\n");
      } else {
        log("");
        log("╔══════════════════════════════════════════════╗");
        log("║         Rollback Complete                    ║");
        log("╚══════════════════════════════════════════════╝");
        log(`  Archive:  ${backupPath}`);
        log(`  Size:     ${sizeKB} KB`);
        log(`  Status:   ✓ Metadata restored from backup`);
        log("");
      }

    } finally {
      // Ensure temp cleanup even on error
      if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }

  } catch (err) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({
        success: false,
        error: err.message,
      }) + "\n");
    } else {
      log(`\n✗ Rollback failed: ${err.message}`);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();