#!/usr/bin/env node
/**
 * Metadata Importer — Roastery ERP
 *
 * Step 83: Metadata Deployment 4 — Import: UPSERT all metadata types
 *
 * Reads a validated .zip archive (from metadata-packager.cjs), extracts each
 * definition file, and UPSERTs every row into the target database.
 *
 * Metadata routing:
 *   forms.json        → source=forms_table  → shared.forms
 *                       source=objects_form → shared.objects (type=form)
 *   fields.json       → derived data (skipped — re-derived from form definitions)
 *   events.json       → shared.event_handlers
 *   nav_tree.json     → shared.nav_tree
 *   permissions.json  → roles              → shared.roles
 *                       user_roles         → shared.user_roles
 *                       table_permissions  → shared.table_permissions
 *                       field_permissions  → shared.field_permissions
 *                       row_filters        → shared.row_filters
 *   reports.json      → source=reports_table → shared.reports
 *                       (no source)          → shared.objects (type=report)
 *   settings.json     → shared.objects (type=appearance)
 *
 * UPSERT strategy: INSERT ... ON CONFLICT (id) DO UPDATE SET ...
 * This preserves existing rows and updates them with archive data.
 *
 * Usage:
 *   node server/metadata-importer-upsert.cjs --archive deploy/erp_metadata_2026-07-30.zip
 *   node server/metadata-importer-upsert.cjs --archive deploy/erp_metadata_2026-07-30.zip --dry-run
 *   node server/metadata-importer-upsert.cjs --archive deploy/erp_metadata_2026-07-30.zip --skip-validation
 *   node server/metadata-importer-upsert.cjs --archive deploy/erp_metadata_2026-07-30.zip --verbose
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { execSync } = require("child_process");
const { Pool } = require("pg");

// ─── Config ──────────────────────────────────────────

const EXPECTED_SCHEMA_VERSION = "1.0.0";
const EXPECTED_MANIFEST_VERSION = 1;
const SCHEMA_VERSION_FILE = "version.txt";

// Same required definitions as the validator
const REQUIRED_DEFINITIONS = [
  "definitions/forms.json",
  "definitions/fields.json",
  "definitions/events.json",
  "definitions/nav_tree.json",
  "definitions/permissions.json",
  "definitions/reports.json",
  "definitions/settings.json",
];

// ─── State ───────────────────────────────────────────

const errors = [];
const warnings = [];
const info = [];

// Per-table stats
const stats = {
  inserted: 0,
  updated: 0,
  skipped: 0,
  tables: {},
};

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function note(msg) { info.push(msg); }

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
    archivePath: get("--archive") || args[0] || null,
    dryRun: args.includes("--dry-run"),
    skipValidation: args.includes("--skip-validation"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

function printHeader(title) {
  console.log("");
  console.log("  " + "─".repeat(58));
  console.log("  " + title);
  console.log("  " + "─".repeat(58));
}

function printResult(label, ok, detail) {
  const mark = ok ? "✓" : "✗";
  console.log(`  ${mark} ${label}${detail ? ": " + detail : ""}`);
}

function printSummary() {
  console.log("");
  console.log("  " + "═".repeat(58));
  if (errors.length === 0 && warnings.length === 0) {
    console.log("  ✓ IMPORT COMPLETE — all metadata upserted successfully");
  } else {
    if (errors.length > 0) {
      console.log(`  ✗ ${errors.length} error(s)`);
      for (const e of errors) {
        console.log(`      • ${e}`);
      }
    }
    if (warnings.length > 0) {
      console.log(`  ⚠ ${warnings.length} warning(s)`);
      for (const w of warnings) {
        console.log(`      • ${w}`);
      }
    }
  }
  console.log("  " + "═".repeat(58));
}

function walkDir(dir, prefix, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      acc.push({ path: relPath, isDir: true });
      walkDir(path.join(dir, entry.name), relPath, acc);
    } else {
      acc.push({ path: relPath, isDir: false });
    }
  }
}

// ─── Validation (reused from Step 82) ────────────────

const REQUIRED_MANIFEST_FIELDS = [
  "manifest_version", "created_at", "source", "erp_version",
  "exported_by", "description", "checksums", "counts",
];

const EXPECTED_CHECKSUM_KEYS = [
  "definitions/forms.json", "definitions/fields.json",
  "definitions/events.json", "definitions/nav_tree.json",
  "definitions/permissions.json", "definitions/reports.json",
  "definitions/settings.json",
];

function extractArchive(zipPath, extractDir) {
  printHeader("1. Extract Archive");

  if (!fs.existsSync(zipPath)) {
    fail(`Archive not found at: ${zipPath}`);
    return false;
  }

  const stats = fs.statSync(zipPath);
  const sizeKB = (stats.size / 1024).toFixed(0);
  note(`Archive: ${zipPath} (${sizeKB} KB)`);

  try {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });
  } catch (ex) {
    const out = ex.stdout ? ex.stdout.toString() : "";
    const err = ex.stderr ? ex.stderr.toString() : "";
    const extractedFiles = fs.readdirSync(extractDir);
    if (extractedFiles.length === 0) {
      fail(`Failed to extract archive: ${err || out || ex.message}`);
      return false;
    }
    warn(`unzip reported issues: ${err.trim() || out.trim()}`);
  }

  const items = [];
  walkDir(extractDir, "", items);
  note(`Extracted ${items.length} files/dirs to ${extractDir}`);
  return true;
}

function validateManifest(extractDir) {
  printHeader("2. Validate manifest.json");

  const manifestPath = path.join(extractDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    fail("manifest.json is missing from archive");
    return null;
  }

  let manifest;
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
    note(`manifest.json: ${raw.length} bytes, valid JSON`);
  } catch (ex) {
    fail(`manifest.json is not valid JSON: ${ex.message}`);
    return null;
  }

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in manifest)) {
      fail(`manifest.json missing required field: "${field}"`);
    }
  }

  if (typeof manifest.manifest_version !== "number") {
    fail(`manifest.json "manifest_version" must be a number, got ${typeof manifest.manifest_version}`);
  } else if (manifest.manifest_version !== EXPECTED_MANIFEST_VERSION) {
    warn(`manifest.json "manifest_version" is ${manifest.manifest_version}, expected ${EXPECTED_MANIFEST_VERSION}`);
  }

  if (typeof manifest.created_at !== "string") {
    fail(`manifest.json "created_at" must be a string`);
  } else {
    const d = new Date(manifest.created_at);
    if (isNaN(d.getTime())) {
      fail(`manifest.json "created_at" is not a valid ISO date: "${manifest.created_at}"`);
    }
  }

  if (typeof manifest.erp_version !== "string") {
    fail(`manifest.json "erp_version" must be a string`);
  }

  if (typeof manifest.checksums !== "object" || manifest.checksums === null) {
    fail(`manifest.json "checksums" must be an object`);
  } else {
    for (const key of EXPECTED_CHECKSUM_KEYS) {
      if (!(key in manifest.checksums)) {
        fail(`manifest.json "checksums" missing key: "${key}"`);
      }
    }
    for (const [key, val] of Object.entries(manifest.checksums)) {
      if (typeof val !== "string") {
        fail(`manifest.json checksums["${key}"] must be a string`);
      } else if (!/^sha256:[a-f0-9]{64}$/i.test(val)) {
        fail(`manifest.json checksums["${key}"] has invalid format`);
      }
    }
  }

  if (typeof manifest.counts !== "object" || manifest.counts === null) {
    fail(`manifest.json "counts" must be an object`);
  }

  return manifest;
}

function validateVersionFile(extractDir) {
  printHeader("3. Validate version.txt");

  const versionPath = path.join(extractDir, "version.txt");
  if (!fs.existsSync(versionPath)) {
    fail("version.txt is missing from archive");
    return;
  }

  const version = fs.readFileSync(versionPath, "utf-8").trim();
  note(`version.txt: "${version}"`);

  if (version !== EXPECTED_SCHEMA_VERSION) {
    warn(`version.txt contains "${version}", expected "${EXPECTED_SCHEMA_VERSION}". Migration may be required.`);
  }
}

function validateChecksums(extractDir, manifest) {
  printHeader("4. Validate Checksums");

  if (!manifest) {
    fail("Cannot validate checksums — manifest is invalid");
    return;
  }

  const manifestChecksums = manifest.checksums;

  // 4a. Against manifest.json checksums
  for (const [relPath, expectedHash] of Object.entries(manifestChecksums)) {
    const fullPath = path.join(extractDir, relPath);
    if (!fs.existsSync(fullPath)) {
      fail(`File referenced in manifest checksums not found: "${relPath}"`);
      continue;
    }
    const actualHex = sha256Hex(fullPath);
    const expectedHex = expectedHash.replace(/^sha256:/, "");
    if (actualHex !== expectedHex) {
      fail(`Checksum mismatch for "${relPath}": expected ${expectedHex}, actual ${actualHex}`);
    } else {
      printResult("", true, `${relPath} ✓`);
    }
  }

  // 4b. Against checksums.sha256
  const shaPath = path.join(extractDir, "checksums.sha256");
  if (!fs.existsSync(shaPath)) {
    fail("checksums.sha256 is missing from archive");
  } else {
    const shaContent = fs.readFileSync(shaPath, "utf-8");
    const shaLines = shaContent.trim().split("\n").filter((l) => l.trim().length > 0);

    for (const line of shaLines) {
      const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/);
      if (!match) {
        warn(`Unparseable checksums.sha256 line: "${line}"`);
        continue;
      }
      const expectedHex = match[1];
      const relPath = match[2];
      const fullPath = path.join(extractDir, relPath);
      if (!fs.existsSync(fullPath)) {
        fail(`File referenced in checksums.sha256 not found: "${relPath}"`);
        continue;
      }
      const actualHex = sha256Hex(fullPath);
      if (actualHex !== expectedHex) {
        fail(`Checksum mismatch for "${relPath}" in checksums.sha256: expected ${expectedHex}, actual ${actualHex}`);
      } else {
        printResult("", true, `${relPath} ✓`);
      }
    }
  }
}

function validateFileCompleteness(extractDir) {
  printHeader("5. Validate File Completeness");

  let allFound = true;
  for (const relPath of REQUIRED_DEFINITIONS) {
    const fullPath = path.join(extractDir, relPath);
    if (!fs.existsSync(fullPath)) {
      fail(`Required definition file missing: "${relPath}"`);
      allFound = false;
    } else {
      const st = fs.statSync(fullPath);
      const sizeKB = (st.size / 1024).toFixed(1);
      printResult("", true, `${relPath} (${sizeKB} KB)`);
    }
  }

  printResult("All required files present", allFound,
    allFound ? `${REQUIRED_DEFINITIONS.length}/${REQUIRED_DEFINITIONS.length}` : "");
}

function validateDefinitionJSON(extractDir) {
  printHeader("6. Validate Definition JSON");

  let allValid = true;
  for (const relPath of REQUIRED_DEFINITIONS) {
    const fullPath = path.join(extractDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const data = JSON.parse(raw);
      const len = Array.isArray(data) ? data.length :
        (typeof data === "object" && data !== null ? Object.keys(data).length : "?");
      printResult("", true, `${relPath}: valid JSON, ${len} entries`);
    } catch (ex) {
      fail(`${relPath}: invalid JSON — ${ex.message}`);
      allValid = false;
    }
  }

  printResult("All definitions valid JSON", allValid,
    allValid ? "All files parse correctly" : `${errors.length} error(s)`);
}

// ─── UPSERT Engine ───────────────────────────────────

/**
 * Table routing configuration.
 *
 * Each entry:
 *   table       — target DB table (schema-qualified)
 *   conflict    — conflict target column (e.g. "id")
 *   filter      — optional function that receives a row, returns true if row belongs here
 *   excludeCols — columns to strip before upserting (e.g. routing-only fields like "source")
 */
const TABLE_ROUTES = [
  // ── Forms ──────────────────────────────────────────
  {
    sourceFile: "forms.json",
    table: "shared.forms",
    conflict: "id",
    filter: (row) => row.source === "forms_table",
    excludeCols: ["source", "status", "hidden"],
  },
  {
    sourceFile: "forms.json",
    table: "shared.objects",
    conflict: "id",
    filter: (row) => row.source === "objects_form",
    excludeCols: ["source"],
    // Ensure type is set for objects
    ensureCols: { type: "form" },
  },
  // ── Events ─────────────────────────────────────────
  {
    sourceFile: "events.json",
    table: "shared.event_handlers",
    conflict: "id",
    excludeCols: [],
  },
  // ── Navigation Tree ────────────────────────────────
  {
    sourceFile: "nav_tree.json",
    table: "shared.nav_tree",
    conflict: "id",
    excludeCols: [],
  },
  // ── Permissions (sub-objects) ──────────────────────
  {
    sourceFile: "permissions.json",
    subKey: "roles",
    table: "shared.roles",
    conflict: "id",
    excludeCols: [],
  },
  {
    sourceFile: "permissions.json",
    subKey: "user_roles",
    table: "shared.user_roles",
    conflict: "id",
    excludeCols: [],
  },
  {
    sourceFile: "permissions.json",
    subKey: "table_permissions",
    table: "shared.table_permissions",
    conflict: "id",
    excludeCols: [],
  },
  {
    sourceFile: "permissions.json",
    subKey: "field_permissions",
    table: "shared.field_permissions",
    conflict: "id",
    excludeCols: [],
  },
  {
    sourceFile: "permissions.json",
    subKey: "row_filters",
    table: "shared.row_filters",
    conflict: "id",
    excludeCols: [],
  },
  // ── Reports ────────────────────────────────────────
  {
    sourceFile: "reports.json",
    table: "shared.reports",
    conflict: "id",
    filter: (row) => row.source === "reports_table",
    excludeCols: ["source"],
  },
  {
    sourceFile: "reports.json",
    table: "shared.objects",
    conflict: "id",
    filter: (row) => !row.source || row.source !== "reports_table",
    excludeCols: ["source"],
    // Ensure type is set for objects-derived reports
    ensureCols: { type: "report" },
  },
  // ── Settings ───────────────────────────────────────
  {
    sourceFile: "settings.json",
    table: "shared.objects",
    conflict: "id",
    // All settings rows have type='appearance' already
    excludeCols: [],
  },
];

/**
 * Load a definition file from the extracted archive.
 * Returns the parsed JSON data.
 */
function loadDefinitionFile(extractDir, relPath) {
  const fullPath = path.join(extractDir, relPath);
  if (!fs.existsSync(fullPath)) {
    fail(`Definition file not found: ${relPath}`);
    return null;
  }
  const raw = fs.readFileSync(fullPath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (ex) {
    fail(`Cannot parse ${relPath}: ${ex.message}`);
    return null;
  }
}

/**
 * Build a parameterized UPSERT query for a single row.
 * Returns { sql, params }.
 */
function buildUpsertQuery(table, conflict, row, excludeCols, ensureCols) {
  const cols = [];
  const vals = [];
  const params = [];
  let idx = 1;

  // Build the column list from the row's keys, minus excluded columns
  for (const key of Object.keys(row)) {
    if (excludeCols.includes(key)) continue;
    cols.push(key);
    vals.push(`$${idx++}`);
    params.push(row[key]);
  }

  // Add ensured columns (if not already present or if we want to override)
  if (ensureCols) {
    for (const [key, val] of Object.entries(ensureCols)) {
      if (!cols.includes(key)) {
        cols.push(key);
        vals.push(`$${idx++}`);
        params.push(val);
      }
    }
  }

  if (cols.length === 0) {
    return null; // Nothing to insert
  }

  const colList = cols.map((c) => `"${c}"`).join(", ");
  const valList = vals.join(", ");

  // Build SET clause for ON CONFLICT DO UPDATE (exclude the conflict column from SET)
  const setClauses = cols
    .filter((c) => c !== conflict)
    .map((c) => `"${c}" = EXCLUDED."${c}"`);

  let sql;
  if (setClauses.length > 0) {
    sql = `INSERT INTO ${table} (${colList}) VALUES (${valList}) ON CONFLICT ("${conflict}") DO UPDATE SET ${setClauses.join(", ")}`;
  } else {
    // Only the conflict column — use DO NOTHING
    sql = `INSERT INTO ${table} (${colList}) VALUES (${valList}) ON CONFLICT ("${conflict}") DO NOTHING`;
  }

  return { sql, params };
}

/**
 * Upsert rows for a single table route.
 * Returns { inserted, updated, total }.
 */
async function upsertBatch(client, route, rows, extractDir) {
  const { table, conflict, excludeCols, ensureCols, subKey } = route;

  // Resolve the actual row data
  let rowData;
  if (subKey) {
    // permissions.json has sub-objects like { roles: [...], user_roles: [...] }
    rowData = rows[subKey];
    if (!rowData) {
      return { inserted: 0, updated: 0, total: 0 };
    }
  } else {
    rowData = rows;
  }

  // Apply filter if present
  if (route.filter) {
    rowData = rowData.filter(route.filter);
  }

  if (!Array.isArray(rowData) || rowData.length === 0) {
    return { inserted: 0, updated: 0, total: 0 };
  }

  let inserted = 0;
  let updated = 0;

  for (const row of rowData) {
    const query = buildUpsertQuery(table, conflict, row, excludeCols, ensureCols);
    if (!query) continue;

    try {
      const result = await client.query(query.sql, query.params);
      if (result.rowCount > 0) {
        // Check if it was an insert or update
        // PostgreSQL doesn't directly tell us, but we can infer from the command tag
        // INSERT 0 1 = insert, UPDATE 1 = update
        // For ON CONFLICT DO UPDATE, the command tag is INSERT 0 N
        // We can't distinguish insert vs update from the result alone without a
        // separate check, but we can use a heuristic: if the command tag says UPDATE
        // it was an update. With INSERT ... ON CONFLICT, it's always INSERT.
        // Let's use a xmax check approach instead.
        inserted++;
      }
    } catch (err) {
      fail(`UPSERT error on ${table} (id=${row[conflict]}): ${err.message}`);
    }
  }

  return { inserted: rowData.length, updated: 0, total: rowData.length };
}

/**
 * Distinguish INSERT vs UPDATE by checking if the row existed before.
 * We do a pre-check query to count existing rows, then compute the delta.
 */
async function upsertBatchWithStats(client, route, rows, extractDir) {
  const { table, conflict, excludeCols, ensureCols, subKey } = route;

  let rowData;
  if (subKey) {
    rowData = rows[subKey];
    if (!rowData) return { inserted: 0, updated: 0, total: 0 };
  } else {
    rowData = rows;
  }

  if (route.filter) {
    rowData = rowData.filter(route.filter);
  }

  if (!Array.isArray(rowData) || rowData.length === 0) {
    return { inserted: 0, updated: 0, total: 0 };
  }

  // Pre-check: count how many rows already exist
  const ids = rowData.map((r) => r[conflict]).filter((id) => id !== undefined && id !== null);
  let existingCount = 0;
  if (ids.length > 0) {
    try {
      // Build a parameterized IN clause
      const placeholders = ids.map((_, i) => `$${i + 1}`);
      const sql = `SELECT COUNT(*) AS cnt FROM ${table} WHERE "${conflict}" IN (${placeholders.join(", ")})`;
      const result = await client.query(sql, ids);
      existingCount = parseInt(result.rows[0].cnt, 10);
    } catch (err) {
      fail(`Pre-check query failed for ${table}: ${err.message}`);
      return { inserted: 0, updated: 0, total: 0 };
    }
  }

  const newCount = ids.length - existingCount;
  const updateCount = existingCount;

  // Perform the actual UPSERTs
  for (const row of rowData) {
    const query = buildUpsertQuery(table, conflict, row, excludeCols, ensureCols);
    if (!query) continue;

    try {
      await client.query(query.sql, query.params);
    } catch (err) {
      // If the conflict is a UUID and the row has an id, try without the id
      // (auto-generate a new UUID)
      if (err.message && err.message.includes("invalid input syntax for type uuid")) {
        warn(`Invalid UUID for ${table} id="${row[conflict]}" — removing id to auto-generate`);
        const rowNoId = { ...row };
        delete rowNoId[conflict];
        const retryQuery = buildUpsertQuery(table, conflict, rowNoId, excludeCols, ensureCols);
        if (retryQuery) {
          // Remove the conflict clause for auto-generated ids
          const cleanSql = retryQuery.sql.replace(/\s+ON CONFLICT.*$/, "");
          try {
            await client.query(cleanSql, retryQuery.params);
            note(`  Inserted ${table} row with auto-generated id (was: ${row[conflict]})`);
          } catch (retryErr) {
            fail(`UPSERT error on ${table} (original id=${row[conflict]}): ${retryErr.message}`);
          }
        }
      } else {
        fail(`UPSERT error on ${table} (id=${row[conflict]}): ${err.message}`);
      }
    }
  }

  return { inserted: newCount, updated: updateCount, total: rowData.length };
}

// ─── Main UPSERT Runner ──────────────────────────────

async function runUpsert(extractDir, opts) {
  printHeader("8. Import: UPSERT Metadata");

  const pool = new Pool({ database: "polyaccess" });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Track which source files we've loaded (cache)
    const fileCache = {};

    for (const route of TABLE_ROUTES) {
      const { sourceFile } = route;

      // Load the file once per source
      if (!fileCache[sourceFile]) {
        const data = loadDefinitionFile(extractDir, `definitions/${sourceFile}`);
        if (data === null) {
          fail(`Cannot load ${sourceFile} — skipping related routes`);
          continue;
        }
        fileCache[sourceFile] = data;
      }

      const data = fileCache[sourceFile];
      if (data === null) continue;

      const routeLabel = route.subKey
        ? `${sourceFile} → ${route.subKey} → ${route.table}`
        : `${sourceFile} → ${route.table}`;

      // Skip fields.json — it's derived data
      if (sourceFile === "fields.json") {
        note(`  • ${routeLabel}: skipped (derived data — re-extracted from form definitions)`);
        continue;
      }

      const result = await upsertBatchWithStats(client, route, data, extractDir);

      if (result.total > 0) {
        if (opts.dryRun) {
          console.log(`  [DRY RUN] ${routeLabel}: ${result.total} rows (${result.inserted} new, ${result.updated} existing)`);
        } else {
          console.log(`  ✓ ${routeLabel}: ${result.total} rows (${result.inserted} new, ${result.updated} updated)`);
        }
      } else {
        console.log(`  - ${routeLabel}: 0 rows`);
      }

      // Accumulate stats
      if (!stats.tables[route.table]) {
        stats.tables[route.table] = { inserted: 0, updated: 0, total: 0 };
      }
      stats.tables[route.table].inserted += result.inserted;
      stats.tables[route.table].updated += result.updated;
      stats.tables[route.table].total += result.total;
      stats.inserted += result.inserted;
      stats.updated += result.updated;
      stats.skipped += result.total;
    }

    if (opts.dryRun) {
      await client.query("ROLLBACK");
      console.log("\n  [DRY RUN] Transaction rolled back — no changes persisted");
    } else {
      await client.query("COMMIT");
    }

  } catch (err) {
    await client.query("ROLLBACK");
    fail(`Transaction aborted: ${err.message}`);
  } finally {
    client.release();
    await pool.end();
  }
}

// ─── Main ────────────────────────────────────────────

async function run() {
  const opts = parseArgs();

  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     Roastery ERP — Metadata Importer UPSERT     ║");
  console.log("║     Step 83: Import — UPSERT all metadata       ║");
  console.log("╚══════════════════════════════════════════════════╝");

  if (opts.dryRun) {
    console.log("  [DRY RUN MODE] No changes will be persisted");
  }

  // ── Check required args ────────────────────────────────

  if (!opts.archivePath) {
    console.error("\n  ✗ ERROR: No archive specified.");
    console.error("    Usage: node server/metadata-importer-upsert.cjs --archive <path-to-zip>");
    console.error("           node server/metadata-importer-upsert.cjs deploy/erp_metadata_2026-07-30.zip");
    process.exit(1);
  }

  const zipPath = path.resolve(opts.archivePath);

  // ── Create temp extraction directory ───────────────────

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-import-"));
  const extractDir = path.join(tmpDir, "extracted");
  fs.mkdirSync(extractDir, { recursive: true });

  let manifest = null;
  let extractionOk = false;

  try {
    // ── Validation phase (unless skipped) ────────────────

    if (!opts.skipValidation) {
      extractionOk = extractArchive(zipPath, extractDir);
      if (!extractionOk) {
        printSummary();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        process.exit(1);
      }

      manifest = validateManifest(extractDir);
      if (manifest) {
        validateVersionFile(extractDir);
        validateChecksums(extractDir, manifest);
      }
      validateFileCompleteness(extractDir);
      validateDefinitionJSON(extractDir);

      if (errors.length > 0) {
        printSummary();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        process.exit(1);
      }

      console.log("\n  ✓ Validation passed — proceeding to import");
    } else {
      // Still need to extract even when skipping validation
      extractionOk = extractArchive(zipPath, extractDir);
      if (!extractionOk) {
        printSummary();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        process.exit(1);
      }
    }

    // ── Import phase ─────────────────────────────────────

    await runUpsert(extractDir, opts);

    // ── Summary ──────────────────────────────────────────

    console.log("");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║              Import Summary                     ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log(`  Archive:          ${zipPath}`);

    if (opts.dryRun) {
      console.log(`  Mode:             DRY RUN (no changes saved)`);
    }

    console.log("");

    // Sort tables by total rows descending
    const sortedTables = Object.entries(stats.tables)
      .sort(([, a], [, b]) => b.total - a.total);

    for (const [table, tstats] of sortedTables) {
      const label = table.padEnd(35);
      console.log(`  ${label} ${String(tstats.total).padStart(6)} total  ` +
        `(+${tstats.inserted} new, ~${tstats.updated} updated)`);
    }

    console.log("");
    console.log(`  Total rows:       ${String(stats.inserted + stats.updated + stats.skipped).padStart(6)} processed`);
    if (!opts.dryRun) {
      console.log(`  New rows:         ${String(stats.inserted).padStart(6)} inserted`);
      console.log(`  Updated rows:     ${String(stats.updated).padStart(6)} updated`);
    }

    printSummary();

    const hasErrors = errors.length > 0;
    if (hasErrors) {
      process.exit(1);
    }

  } finally {
    // Clean up temp directory
    if (tmpDir && fs.existsSync(tmpDir)) {
      if (opts.verbose) {
        console.log(`\n  Cleaning up temp directory: ${tmpDir}`);
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

run().catch((err) => {
  console.error("\n✗ Fatal error:", err.message);
  process.exit(1);
});