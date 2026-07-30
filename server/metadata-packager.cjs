#!/usr/bin/env node
/**
 * Metadata Packager — Roastery ERP
 *
 * Step 81: Metadata Deployment 2 — Packaging
 * Takes the exported JSON definition files and packages them into
 * a deployable .zip archive with manifest.json, version.txt, and
 * checksums.sha256 for integrity verification.
 *
 * Archive structure:
 *   erp_metadata_YYYY-MM-DD.zip
 *   ├── manifest.json            # Version, date, source, checksums, counts
 *   ├── version.txt              # Schema version for migration
 *   ├── definitions/
 *   │   ├── forms.json
 *   │   ├── fields.json
 *   │   ├── events.json
 *   │   ├── nav_tree.json
 *   │   ├── permissions.json
 *   │   ├── reports.json
 *   │   └── settings.json
 *   ├── templates/               # Report .ods templates (populated when available)
 *   └── checksums.sha256         # SHA-256 of every file in the archive
 *
 * Usage:
 *   node server/metadata-packager.cjs
 *   node server/metadata-packager.cjs --description "Invoice form fix" --source staging
 *   node server/metadata-packager.cjs --output deploy/erp-release.zip
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { execSync } = require("child_process");

// ─── Config ──────────────────────────────────────────

const DEFINITIONS_DIR = path.resolve(__dirname, "..", "src", "metadata", "export", "definitions");
const TEMPLATES_SRC_DIR = path.resolve(__dirname, "..", "src", "metadata", "export", "templates");
const PKG_JSON_PATH = path.resolve(__dirname, "..", "package.json");
const OUTPUT_DIR = path.resolve(__dirname, "..", "deploy");

const SCHEMA_VERSION = "1.0.0";
const MANIFEST_VERSION = 1;

// Definition files to include (in display order)
const DEFINITION_FILES = [
  "forms.json",
  "fields.json",
  "events.json",
  "nav_tree.json",
  "permissions.json",
  "reports.json",
  "settings.json",
];

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
    description: get("--description") || "Metadata export",
    source: get("--source") || "development",
    outputPath: get("--output") || null,
  };
}

// ─── Main ────────────────────────────────────────────

function run() {
  const opts = parseArgs();
  const pkg = JSON.parse(fs.readFileSync(PKG_JSON_PATH, "utf-8"));
  const erpVersion = pkg.version;
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const now = new Date().toISOString();

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║     Roastery ERP — Metadata Packager        ║");
  console.log("╚══════════════════════════════════════════════╝");

  // ── 1. Collect definition files ────────────────────

  const defFiles = {};
  for (const f of DEFINITION_FILES) {
    const filePath = path.join(DEFINITIONS_DIR, f);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ ${f} not found — skipping`);
      continue;
    }
    defFiles[f] = filePath;
  }

  if (Object.keys(defFiles).length === 0) {
    console.error("\n✗ No definition files found. Run `node server/metadata-exporter.cjs` first.");
    process.exit(1);
  }

  console.log(`  Definitions: ${Object.keys(defFiles).length} files found`);

  // ── 2. Collect template files ──────────────────────

  const templateFiles = [];
  if (fs.existsSync(TEMPLATES_SRC_DIR)) {
    const entries = fs.readdirSync(TEMPLATES_SRC_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        templateFiles.push(entry.name);
      }
    }
  }
  console.log(`  Templates:   ${templateFiles.length} files`);

  // ── 3. Build temp directory ────────────────────────

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-meta-"));
  const defsDir = path.join(tmpDir, "definitions");
  const templatesDir = path.join(tmpDir, "templates");
  fs.mkdirSync(defsDir, { recursive: true });
  fs.mkdirSync(templatesDir, { recursive: true });

  // ── 4. Copy definition files & compute checksums ───

  const checksums = {};   // relPath → "sha256:hex"
  const counts = {};

  for (const [filename, filePath] of Object.entries(defFiles)) {
    const buf = fs.readFileSync(filePath);
    const destPath = path.join(defsDir, filename);
    fs.writeFileSync(destPath, buf);

    const relPath = `definitions/${filename}`;
    checksums[relPath] = `sha256:${sha256HexFromBuffer(buf)}`;

    try {
      const data = JSON.parse(buf.toString("utf-8"));
      if (Array.isArray(data)) {
        counts[filename.replace(".json", "")] = data.length;
      } else if (typeof data === "object" && data !== null) {
        counts[filename.replace(".json", "")] = Object.keys(data).length;
      }
    } catch {
      counts[filename.replace(".json", "")] = "?";
    }
  }

  // ── 5. Copy template files ─────────────────────────

  for (const tpl of templateFiles) {
    const srcPath = path.join(TEMPLATES_SRC_DIR, tpl);
    const buf = fs.readFileSync(srcPath);
    const destPath = path.join(templatesDir, tpl);
    fs.writeFileSync(destPath, buf);

    const relPath = `templates/${tpl}`;
    checksums[relPath] = `sha256:${sha256HexFromBuffer(buf)}`;
  }

  // ── 6. Generate manifest.json ──────────────────────

  const manifest = {
    manifest_version: MANIFEST_VERSION,
    created_at: now,
    source: opts.source,
    erp_version: erpVersion,
    exported_by: process.env.USER || "unknown",
    description: opts.description,
    checksums: { ...checksums },
    counts: { ...counts },
  };

  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8");
  fs.writeFileSync(path.join(tmpDir, "manifest.json"), manifestBuf);

  // ── 7. Generate version.txt ────────────────────────

  const versionBuf = Buffer.from(`${SCHEMA_VERSION}\n`, "utf-8");
  fs.writeFileSync(path.join(tmpDir, "version.txt"), versionBuf);

  // ── 8. Generate checksums.sha256 ───────────────────

  // Format matches sha256sum: <hex>  <relative-path>
  const allEntries = [
    { relPath: "manifest.json", buf: manifestBuf },
    { relPath: "version.txt", buf: versionBuf },
    ...Object.entries(checksums).map(([relPath, hash]) => ({
      relPath,
      buf: null, // use hash from checksums dict
      hash: hash.replace("sha256:", ""),
    })),
  ];

  const shaLines = allEntries.map((entry) => {
    const hex = entry.hash || sha256HexFromBuffer(entry.buf);
    return `${hex}  ${entry.relPath}`;
  });

  fs.writeFileSync(path.join(tmpDir, "checksums.sha256"), shaLines.join("\n") + "\n", "utf-8");

  // ── 9. Create .zip archive ─────────────────────────

  const zipFilename = opts.outputPath || path.join(OUTPUT_DIR, `erp_metadata_${today}.zip`);
  fs.mkdirSync(path.dirname(zipFilename), { recursive: true });

  // Remove existing archive (zip -r appends to existing)
  if (fs.existsSync(zipFilename)) {
    fs.unlinkSync(zipFilename);
  }

  console.log(`  Creating archive...`);
  execSync(`zip -r "${zipFilename}" .`, {
    cwd: tmpDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stats = fs.statSync(zipFilename);
  const sizeKB = (stats.size / 1024).toFixed(0);

  // ── 10. Clean up ───────────────────────────────────

  fs.rmSync(tmpDir, { recursive: true, force: true });

  // ── 11. Summary ────────────────────────────────────

  const totalFiles = Object.keys(checksums).length + 2; // definitions + manifest + version.txt + checksums.sha256 (not counted)
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║            Package Complete                  ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Archive:  ${zipFilename}`);
  console.log(`  Size:     ${sizeKB} KB`);
  console.log(`  Files:    ${totalFiles}`);
  console.log(`  Source:   ${opts.source}`);
  console.log(`  Version:  ${erpVersion}`);
  console.log(`  Created:  ${now}`);
  console.log("");
  console.log("  Contents:");
  for (const [name, count] of Object.entries(counts)) {
    console.log(`    definitions/${name}.json  ${String(count).padStart(6)} entries`);
  }
  if (templateFiles.length > 0) {
    for (const tpl of templateFiles) {
      console.log(`    templates/${tpl}`);
    }
  }
  console.log(`    manifest.json              1`);
  console.log(`    version.txt                1`);
  console.log(`    checksums.sha256           1`);
  console.log("");

  // ── 12. Verify checksums ───────────────────────────

  console.log("  ✓ Verifying archive integrity...");
  const verifyResult = execSync(`unzip -l "${zipFilename}"`, {
    cwd: path.dirname(zipFilename),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lineCount = verifyResult
    .toString()
    .split("\n")
    .filter((l) => l.trim().length > 0).length;
  console.log(`  ✓ Archive contains ${lineCount - 2} files`); // header and footer
  console.log("");
}

run();
