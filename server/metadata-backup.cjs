#!/usr/bin/env node
/**
 * Metadata Backup — Roastery ERP
 *
 * Step 85: Metadata Deployment 6 — Automatic backup before import
 *
 * Creates a backup of the current metadata by exporting from the database
 * and packaging into a versioned .zip archive. Records the backup in the
 * shared.metadata_backups table for rollback tracking.
 *
 * Auto-backup naming: auto-backup-YYYY-MM-DD-HHMMSS-before-import.zip
 *
 * Usage:
 *   node server/metadata-backup.cjs
 *   node server/metadata-backup.cjs --reason pre_import
 *   node server/metadata-backup.cjs --reason manual --output deploy/my-backup.zip
 *   node server/metadata-backup.cjs --json   # machine-readable output
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { Pool } = require("pg");

// ─── Config ──────────────────────────────────────────

const SERVER_DIR = __dirname;
const PROJECT_DIR = path.resolve(SERVER_DIR, "..");
const EXPORTER_SCRIPT = path.join(SERVER_DIR, "metadata-exporter.cjs");
const PACKAGER_SCRIPT = path.join(SERVER_DIR, "metadata-packager.cjs");
const OUTPUT_DIR = path.resolve(PROJECT_DIR, "deploy");

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
    reason: get("--reason") || "pre_import",
    outputPath: get("--output") || null,
    json: args.includes("--json"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

function log(msg) {
  process.stderr.write(msg + "\n");
}

function logVerbose(msg, opts) {
  if (opts.verbose) log(msg);
}

// ─── Main ────────────────────────────────────────────

async function run() {
  const opts = parseArgs();

  if (!opts.json) {
    log("");
    log("╔══════════════════════════════════════════════╗");
    log("║     Roastery ERP — Metadata Backup          ║");
    log("╚══════════════════════════════════════════════╝");
    log(`  Reason: ${opts.reason}`);
    log("");
  }

  try {
    // ── Stage 1: Export current metadata from DB ─────
    if (!opts.json) log("→ Exporting current metadata from database...");

    execSync(`node "${EXPORTER_SCRIPT}"`, {
      cwd: PROJECT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });

    if (!opts.json) log("  ✓ Export complete");

    // ── Stage 2: Package into .zip archive ───────────
    const now = new Date();
    const datePart = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const timePart = now.toISOString()
      .split("T")[1]
      .replace(/[:-]/g, "")
      .split(".")[0]; // HHMMSS

    const defaultName = `auto-backup-${datePart}-${timePart}-before-import.zip`;
    const outputPath = opts.outputPath || path.join(OUTPUT_DIR, defaultName);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    if (!opts.json) log("→ Packaging metadata into archive...");

    const description = `Auto-backup before import (${opts.reason})`;
    execSync(
      `node "${PACKAGER_SCRIPT}" --description "${description}" --source "backup" --output "${outputPath}"`,
      {
        cwd: PROJECT_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60000,
      }
    );

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Backup archive was not created at: ${outputPath}`);
    }

    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(0);
    const checksum = `sha256:${sha256Hex(outputPath)}`;

    if (!opts.json) {
      log(`  ✓ Archive created: ${outputPath}`);
      log(`  ✓ Size: ${sizeKB} KB`);
      log(`  ✓ Checksum: ${checksum}`);
    }

    // ── Stage 3: Record in metadata_backups table ────
    if (!opts.json) log("→ Recording backup in database...");

    const { rows } = await pool.query(
      `INSERT INTO shared.metadata_backups (path, reason, size_bytes, checksum)
       VALUES ($1, $2, $3, $4)
       RETURNING id, path, created_at, reason, size_bytes, checksum`,
      [outputPath, opts.reason, stats.size, checksum]
    );

    const record = rows[0];

    if (!opts.json) {
      log(`  ✓ Recorded: id=${record.id}`);
      log("");
      log("╔══════════════════════════════════════════════╗");
      log("║           Backup Complete                    ║");
      log("╚══════════════════════════════════════════════╝");
      log(`  Path:       ${record.path}`);
      log(`  Size:       ${sizeKB} KB`);
      log(`  Created:    ${record.created_at}`);
      log(`  Reason:     ${record.reason}`);
      log(`  Backup ID:  ${record.id}`);
      log("");
    }

    // Machine-readable JSON output
    if (opts.json) {
      process.stdout.write(JSON.stringify({
        success: true,
        backup: record,
        path: record.path,
        size_bytes: stats.size,
        size_kb: Number(sizeKB),
        checksum: checksum,
        created_at: record.created_at,
        id: record.id,
      }, null, 2) + "\n");
    }

  } catch (err) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({
        success: false,
        error: err.message,
      }) + "\n");
    } else {
      log(`\n✗ Backup failed: ${err.message}`);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();