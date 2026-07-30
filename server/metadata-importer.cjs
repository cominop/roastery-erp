#!/usr/bin/env node
/**
 * Metadata Importer — Roastery ERP
 *
 * Step 82: Metadata Deployment 3 — Import: validate manifest + checksums
 *
 * Validates a packaged metadata archive (.zip from metadata-packager.cjs)
 * by checking manifest integrity, checksum consistency, and file completeness.
 *
 * Validation pipeline:
 *   ┌──────────────────┐
 *   │   Load .zip       │
 *   │   Extract to tmp  │
 *   ├──────────────────┤
 *   │  Validate         │
 *   │  manifest.json    │
 *   │  structure + req  │
 *   │  fields           │
 *   ├──────────────────┤
 *   │  Validate         │
 *   │  checksums vs     │
 *   │  manifest & .sha256│
 *   ├──────────────────┤
 *   │  Validate file    │
 *   │  completeness     │
 *   ├──────────────────┤
 *   │  Validate JSON    │
 *   │  parse of each    │
 *   │  definition file  │
 *   ├──────────────────┤
 *   │  Report result    │
 *   └──────────────────┘
 *
 * Usage:
 *   node server/metadata-importer.cjs --archive deploy/erp_metadata_2026-07-30.zip
 *   node server/metadata-importer.cjs --archive deploy/erp_metadata_2026-07-30.zip --verbose
 *   node server/metadata-importer.cjs --archive deploy/latest.zip
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { execSync } = require("child_process");

// ─── Config ──────────────────────────────────────────

const EXPECTED_SCHEMA_VERSION = "1.0.0";
const EXPECTED_MANIFEST_VERSION = 1;
const SCHEMA_VERSION_FILE = "version.txt";

// Definition files that must be present (subset of what packager emits)
const REQUIRED_DEFINITIONS = [
  "definitions/forms.json",
  "definitions/fields.json",
  "definitions/events.json",
  "definitions/nav_tree.json",
  "definitions/permissions.json",
  "definitions/reports.json",
  "definitions/settings.json",
];

// Required top-level fields in manifest.json
const REQUIRED_MANIFEST_FIELDS = [
  "manifest_version",
  "created_at",
  "source",
  "erp_version",
  "exported_by",
  "description",
  "checksums",
  "counts",
];

// Fields that must be present inside manifest.json.checksums — one per definition
const EXPECTED_CHECKSUM_KEYS = REQUIRED_DEFINITIONS;

// ─── State ───────────────────────────────────────────

const errors = [];
const warnings = [];
const info = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function note(msg) {
  info.push(msg);
}

// ─── Helpers ─────────────────────────────────────────

function sha256Hex(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function sha256HexFromBuffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx < args.length - 1 ? args[idx + 1] : null;
  };
  return {
    archivePath: get("--archive") || args[0] || null,
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

function printHeader(title) {
  console.log("");
  console.log("  " + "─".repeat(54));
  console.log("  " + title);
  console.log("  " + "─".repeat(54));
}

function printResult(label, ok, detail) {
  const mark = ok ? "✓" : "✗";
  console.log(`  ${mark} ${label}${detail ? ": " + detail : ""}`);
}

function printSummary() {
  console.log("");
  console.log("  " + "═".repeat(54));
  const total = errors.length + warnings.length + (info.length > 0 ? 1 : 0);
  if (errors.length === 0 && warnings.length === 0) {
    console.log("  ✓ ALL CHECKS PASSED — archive is valid");
  } else {
    if (errors.length > 0) {
      console.log(`  ✗ ${errors.length} validation error(s)`);
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
    if (errors.length > 0) {
      console.log("");
      console.log("  ✗ VALIDATION FAILED — archive cannot be imported");
    }
  }
  console.log("  " + "═".repeat(54));
}

// ─── Validation Functions ───────────────────────────

/**
 * Step 1: Extract the archive
 */
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
    // unzip writes to stderr even on success for some versions
    const out = ex.stdout ? ex.stdout.toString() : "";
    const err = ex.stderr ? ex.stderr.toString() : "";
    // Check if extraction actually happened despite the error
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

/**
 * Step 2: Validate manifest.json structure
 */
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

  // Check required top-level fields
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in manifest)) {
      fail(`manifest.json missing required field: "${field}"`);
    }
  }

  // Check types for known fields
  if (typeof manifest.manifest_version !== "number") {
    fail(`manifest.json "manifest_version" must be a number, got ${typeof manifest.manifest_version}`);
  } else if (manifest.manifest_version !== EXPECTED_MANIFEST_VERSION) {
    warn(
      `manifest.json "manifest_version" is ${manifest.manifest_version}, ` +
      `expected ${EXPECTED_MANIFEST_VERSION}`
    );
  }

  if (typeof manifest.created_at !== "string") {
    fail(`manifest.json "created_at" must be a string, got ${typeof manifest.created_at}`);
  } else {
    const d = new Date(manifest.created_at);
    if (isNaN(d.getTime())) {
      fail(`manifest.json "created_at" is not a valid ISO date: "${manifest.created_at}"`);
    } else {
      note(`Created: ${d.toISOString()}`);
    }
  }

  if (typeof manifest.erp_version !== "string") {
    fail(`manifest.json "erp_version" must be a string, got ${typeof manifest.erp_version}`);
  }

  if (typeof manifest.checksums !== "object" || manifest.checksums === null) {
    fail(`manifest.json "checksums" must be an object`);
  } else {
    // Check all expected checksum keys exist
    for (const key of EXPECTED_CHECKSUM_KEYS) {
      if (!(key in manifest.checksums)) {
        fail(`manifest.json "checksums" missing key: "${key}"`);
      }
    }
    // Flag keys that don't look like valid sha256:hex values
    for (const [key, val] of Object.entries(manifest.checksums)) {
      if (typeof val !== "string") {
        fail(`manifest.json checksums["${key}"] must be a string, got ${typeof val}`);
      } else if (!/^sha256:[a-f0-9]{64}$/i.test(val)) {
        fail(`manifest.json checksums["${key}"] has invalid format: "${val}" (expected sha256:<64-hex>)`);
      }
    }
  }

  if (typeof manifest.counts !== "object" || manifest.counts === null) {
    fail(`manifest.json "counts" must be an object`);
  }

  if (manifest.description && manifest.description.length > 200) {
    warn(`manifest.json "description" is ${manifest.description.length} chars (recommended ≤200)`);
  }

  return manifest;
}

/**
 * Step 3: Validate version.txt
 */
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
    warn(
      `version.txt contains "${version}", expected "${EXPECTED_SCHEMA_VERSION}". ` +
      `Migration may be required.`
    );
  }
}

/**
 * Step 4: Validate checksums
 */
function validateChecksums(extractDir, manifest) {
  printHeader("4. Validate Checksums");

  if (!manifest) {
    fail("Cannot validate checksums — manifest is invalid");
    return;
  }

  const manifestChecksums = manifest.checksums;
  let manifestOk = true;
  let sha256sumOk = true;

  // 4a. Verify against manifest.json checksums
  printResult("Against manifest.json checksums", true, "");
  for (const [relPath, expectedHash] of Object.entries(manifestChecksums)) {
    const fullPath = path.join(extractDir, relPath);
    if (!fs.existsSync(fullPath)) {
      fail(`File referenced in manifest checksums not found: "${relPath}"`);
      manifestOk = false;
      continue;
    }
    const actualHex = sha256Hex(fullPath);
    const expectedHex = expectedHash.replace(/^sha256:/, "");
    if (actualHex !== expectedHex) {
      fail(
        `Checksum mismatch for "${relPath}":\n` +
        `         expected: ${expectedHex}\n` +
        `         actual:   ${actualHex}`
      );
      manifestOk = false;
    } else {
      printResult("", true, `${relPath} ✓`);
    }
  }

  // 4b. Verify against checksums.sha256
  const shaPath = path.join(extractDir, "checksums.sha256");
  if (!fs.existsSync(shaPath)) {
    fail("checksums.sha256 is missing from archive");
    sha256sumOk = false;
  } else {
    printResult("Against checksums.sha256", true, "");
    const shaContent = fs.readFileSync(shaPath, "utf-8");
    const shaLines = shaContent.trim().split("\n").filter((l) => l.trim().length > 0);

    for (const line of shaLines) {
      // Format: <hex>  <relative-path>  (double-space separator, standard sha256sum format)
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
        sha256sumOk = false;
        continue;
      }
      const actualHex = sha256Hex(fullPath);
      if (actualHex !== expectedHex) {
        fail(
          `Checksum mismatch for "${relPath}" in checksums.sha256:\n` +
          `         expected: ${expectedHex}\n` +
          `         actual:   ${actualHex}`
        );
        sha256sumOk = false;
      } else {
        printResult("", true, `${relPath} ✓`);
      }
    }
  }

  // 4c. Cross-check: manifest and checksums.sha256 should agree
  if (manifestOk && sha256sumOk) {
    note("manifest.json and checksums.sha256 both pass — full integrity verified");
  }

  const allOk = manifestOk && sha256sumOk;
  printResult("Checksums overall", allOk,
    allOk ? "All files verified" : `${errors.length} error(s)`);
}

/**
 * Step 5: Validate file completeness
 */
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

  // Check for extra unexpected files (heuristic — not a hard fail)
  const items = [];
  walkDir(extractDir, "", items);
  const fileItems = items.filter((i) => !i.isDir);
  const knownFiles = new Set([
    "manifest.json",
    "version.txt",
    "checksums.sha256",
    ...REQUIRED_DEFINITIONS,
    ...REQUIRED_DEFINITIONS.map((d) => d.replace("definitions/", "")),
  ]);

  // Templates directory is optional but if it has files, note them
  const templatesDir = path.join(extractDir, "templates");
  if (fs.existsSync(templatesDir)) {
    const templateEntries = fs.readdirSync(templatesDir);
    for (const tpl of templateEntries) {
      const tplPath = `templates/${tpl}`;
      if (!knownFiles.has(tplPath)) {
        note(`Extra file (template): ${tplPath}`);
      }
    }
  }

  printResult("All required files present", allFound,
    allFound ? `${REQUIRED_DEFINITIONS.length}/${REQUIRED_DEFINITIONS.length}` : "");
}

/**
 * Step 6: Validate JSON parse of each definition file
 */
function validateDefinitionJSON(extractDir) {
  printHeader("6. Validate Definition JSON");

  let allValid = true;
  for (const relPath of REQUIRED_DEFINITIONS) {
    const fullPath = path.join(extractDir, relPath);
    if (!fs.existsSync(fullPath)) {
      continue; // already reported above
    }
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const data = JSON.parse(raw);
      const len = Array.isArray(data) ? data.length : (typeof data === "object" && data !== null ? Object.keys(data).length : "?");
      printResult("", true, `${relPath}: valid JSON, ${len} entries`);
    } catch (ex) {
      fail(`${relPath}: invalid JSON — ${ex.message}`);
      allValid = false;
    }
  }

  printResult("All definitions valid JSON", allValid,
    allValid ? "All files parse correctly" : `${errors.length} error(s)`);
}

/**
 * Step 7: Optional — validate manifest counts against actual data
 */
function validateCounts(extractDir, manifest) {
  if (!manifest || !manifest.counts) return;

  printHeader("7. Validate Record Counts");

  let allMatch = true;
  for (const relPath of REQUIRED_DEFINITIONS) {
    const key = path.basename(relPath, ".json");
    const expectedCount = manifest.counts[key];
    if (expectedCount === undefined) continue;

    const fullPath = path.join(extractDir, relPath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const data = JSON.parse(raw);
      const actualCount = Array.isArray(data) ? data.length : (typeof data === "object" && data !== null ? Object.keys(data).length : 0);

      if (actualCount !== expectedCount) {
        warn(
          `Record count mismatch for "${relPath}": manifest says ${expectedCount}, ` +
          `actual data has ${actualCount}`
        );
        allMatch = false;
      } else {
        printResult("", true, `${relPath}: ${actualCount} records (matches manifest)`);
      }
    } catch {
      // Already reported in step 6
    }
  }

  printResult("Record counts", allMatch,
    allMatch ? "All counts match manifest" : `${warnings.length} warning(s)`);
}

// ─── Main ────────────────────────────────────────────

function run() {
  const opts = parseArgs();

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║    Roastery ERP — Metadata Importer          ║");
  console.log("║    Step 82: Validate Manifest + Checksums    ║");
  console.log("╚══════════════════════════════════════════════╝");

  // ── Check required args ────────────────────────────────

  if (!opts.archivePath) {
    console.error("\n  ✗ ERROR: No archive specified.");
    console.error("    Usage: node server/metadata-importer.cjs --archive <path-to-zip>");
    console.error("           node server/metadata-importer.cjs deploy/erp_metadata_2026-07-30.zip");
    process.exit(1);
  }

  // Resolve relative path
  const zipPath = path.resolve(opts.archivePath);

  // ── Create temp extraction directory ───────────────────

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-import-"));
  const extractDir = path.join(tmpDir, "extracted");
  fs.mkdirSync(extractDir, { recursive: true });

  let manifest = null;
  let extractionOk = false;

  try {
    // Step 1: Extract
    extractionOk = extractArchive(zipPath, extractDir);
    if (!extractionOk) {
      printSummary();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      process.exit(1);
    }

    // Step 2: Validate manifest
    manifest = validateManifest(extractDir);

    // Step 3: Validate version.txt
    validateVersionFile(extractDir);

    // Step 4: Validate checksums
    validateChecksums(extractDir, manifest);

    // Step 5: Validate file completeness
    validateFileCompleteness(extractDir);

    // Step 6: Validate JSON
    validateDefinitionJSON(extractDir);

    // Step 7: Validate counts
    validateCounts(extractDir, manifest);

    // ── Summary ──────────────────────────────────────────
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

run();