#!/usr/bin/env node
/**
 * Metadata Differ — Roastery ERP
 *
 * Step 84: Metadata Deployment 5 — Diff Preview
 *
 * Orchestrates the diff between the current metadata (exported live from DB)
 * and an incoming archive. Works in three stages:
 *   1. Export current metadata to a temp directory (via metadata-exporter.cjs)
 *   2. Extract the incoming archive to a temp directory (via unzip)
 *   3. Call python3 server/differ.py to compare the two
 *
 * The output is a structured diff JSON printed to stdout.
 *
 * Usage:
 *   node server/metadata-differ.cjs --archive deploy/erp_metadata_2026-07-30.zip
 *   node server/metadata-differ.cjs --archive deploy/erp_metadata_2026-07-30.zip --output diff.json
 *   node server/metadata-differ.cjs --archive deploy/latest.zip --verbose
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// ─── Config ──────────────────────────────────────────

const SERVER_DIR = __dirname;
const PROJECT_DIR = path.resolve(SERVER_DIR, "..");
const EXPORTER_SCRIPT = path.join(SERVER_DIR, "metadata-exporter.cjs");
const DIFFER_SCRIPT = path.join(SERVER_DIR, "differ.py");
const EXPORT_DEFINITIONS_DIR = path.resolve(PROJECT_DIR, "src", "metadata", "export", "definitions");

// ─── Helpers ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx < args.length - 1 ? args[idx + 1] : null;
  };
  return {
    archivePath: get("--archive") || args[0] || null,
    outputPath: get("--output") || null,
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

function log(msg) {
  // Only print to stderr so stdout stays clean for the JSON result
  process.stderr.write(msg + "\n");
}

function logVerbose(msg, opts) {
  if (opts.verbose) log(msg);
}

// ─── Main ────────────────────────────────────────────

function run() {
  const opts = parseArgs();

  if (!opts.archivePath) {
    log("Error: --archive <path> is required");
    log("Usage: node server/metadata-differ.cjs --archive deploy/erp_metadata_<date>.zip");
    process.exit(1);
  }

  if (!fs.existsSync(opts.archivePath)) {
    log(`Error: Archive not found: ${opts.archivePath}`);
    process.exit(1);
  }

  // ── Stage 1: Export current metadata ────────────────
  log("Stage 1/3: Exporting current metadata from database...");
  const currentDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-diff-current-"));
  logVerbose(`  Current dir: ${currentDir}`, opts);

  try {
    // Run the exporter, but redirect its output to the temp dir
    // Actually, the exporter writes to src/metadata/export/definitions/
    // We need to run it first, then copy the output to our temp dir
    execSync(`node "${EXPORTER_SCRIPT}"`, {
      cwd: PROJECT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });
    log("  ✓ Export complete");

    // Copy the export definitions to the temp dir
    const defsDir = path.join(currentDir, "definitions");
    fs.mkdirSync(defsDir, { recursive: true });
    if (fs.existsSync(EXPORT_DEFINITIONS_DIR)) {
      const files = fs.readdirSync(EXPORT_DEFINITIONS_DIR);
      for (const file of files) {
        const src = path.join(EXPORT_DEFINITIONS_DIR, file);
        const dst = path.join(defsDir, file);
        fs.copyFileSync(src, dst);
      }
      logVerbose(`  Copied ${files.length} definition files to temp dir`, opts);
    } else {
      log("  ⚠ Export definitions directory not found, using empty dir");
    }
  } catch (err) {
    log(`Error: Failed to export current metadata: ${err.message}`);
    fs.rmSync(currentDir, { recursive: true, force: true });
    process.exit(1);
  }

  // ── Stage 2: Extract incoming archive ────────────────
  log("Stage 2/3: Extracting incoming archive...");
  const incomingDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-diff-incoming-"));
  logVerbose(`  Incoming dir: ${incomingDir}`, opts);

  try {
    execSync(`unzip -o "${opts.archivePath}" -d "${incomingDir}"`, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });
    log("  ✓ Archive extracted");
  } catch (err) {
    log(`Error: Failed to extract archive: ${err.message}`);
    fs.rmSync(currentDir, { recursive: true, force: true });
    fs.rmSync(incomingDir, { recursive: true, force: true });
    process.exit(1);
  }

  // ── Stage 3: Run the diff ────────────────────────────
  log("Stage 3/3: Computing diff...");

  try {
    const result = execSync(
      `python3 "${DIFFER_SCRIPT}" --current "${currentDir}" --incoming "${incomingDir}"`,
      {
        cwd: PROJECT_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60000,
        encoding: "utf-8",
      }
    );

    const diffJson = result.stdout;

    if (opts.outputPath) {
      fs.writeFileSync(opts.outputPath, diffJson, "utf-8");
      log(`  ✓ Diff written to ${opts.outputPath}`);
    } else {
      // Print the JSON result to stdout for programmatic consumption
      process.stdout.write(diffJson);
    }

    log("  ✓ Diff complete");
  } catch (err) {
    log(`Error: Failed to compute diff: ${err.message}`);
    const stderr = err.stderr ? err.stderr.toString() : "";
    if (stderr) log(`  stderr: ${stderr}`);
    fs.rmSync(currentDir, { recursive: true, force: true });
    fs.rmSync(incomingDir, { recursive: true, force: true });
    process.exit(1);
  }

  // ── Cleanup ──────────────────────────────────────────
  logVerbose("  Cleaning up temp directories...", opts);
  fs.rmSync(currentDir, { recursive: true, force: true });
  fs.rmSync(incomingDir, { recursive: true, force: true });
}

run();