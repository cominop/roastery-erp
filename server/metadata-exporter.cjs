#!/usr/bin/env node
/**
 * Metadata Exporter — Roastery ERP
 *
 * Step 80: Metadata Deployment 1 — Export
 * Serialises all metadata from the database into individual JSON files
 * under src/metadata/export/definitions/.
 *
 * Tables exported:
 *   forms.json      — form definitions (shared.forms + shared.objects type='form')
 *   fields.json     — field definitions (form fields extracted from definitions)
 *   events.json     — event handlers (shared.event_handlers)
 *   nav_tree.json   — navigation tree (shared.nav_tree)
 *   permissions.json — roles, user_roles, table_permissions, field_permissions, row_filters
 *   reports.json    — report definitions (shared.objects type='report')
 *   settings.json   — theme/appearance (shared.objects type='appearance')
 *
 * Usage: node server/metadata-exporter.cjs
 * Output: src/metadata/export/definitions/*.json
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// ─── Config ──────────────────────────────────────────

const EXPORT_DIR = path.resolve(__dirname, "..", "src", "metadata", "export", "definitions");

const pool = new Pool({
  database: "polyaccess",
});

// ─── Helpers ─────────────────────────────────────────

function writeJson(filename, data) {
  const filePath = path.join(EXPORT_DIR, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  const count = Array.isArray(data) ? data.length : 1;
  console.log(`  ${filename.padEnd(20)} ${String(count).padStart(6)} ${Array.isArray(data) ? "rows" : "object"}`);
  return count;
}

async function queryAll(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ─── Main Export ─────────────────────────────────────

async function run() {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║       Roastery ERP — Metadata Export        ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Output: ${EXPORT_DIR}`);
  console.log("");

  const summary = {};

  try {
    // ── 1. Form definitions ─────────────────────────

    console.log("→ Exporting form definitions...");
    const forms = [];

    // From shared.forms table
    try {
      const formRows = await queryAll("SELECT * FROM shared.forms ORDER BY id");
      forms.push(...formRows.map(r => ({
        source: "forms_table",
        id: r.id,
        database_id: r.database_id,
        name: r.name,
        definition: r.definition,
        record_source: r.record_source,
        description: r.description,
        version: r.version,
        is_current: r.is_current,
        created_at: r.created_at,
        owner: r.owner,
        modified_by: r.modified_by,
      })));
    } catch (err) {
      console.log("  ⚠ shared.forms query failed:", err.message);
    }

    // Legacy form definitions from shared.objects
    try {
      const objForms = await queryAll(
        "SELECT * FROM shared.objects WHERE type = 'form' ORDER BY id"
      );
      forms.push(...objForms.map(r => ({
        source: "objects_form",
        id: r.id,
        database_id: r.database_id,
        name: r.name,
        definition: r.definition,
        record_source: r.record_source,
        description: r.description,
        version: r.version,
        is_current: r.is_current,
        created_at: r.created_at,
        owner: r.owner,
        modified_by: r.modified_by,
        status: r.status,
        hidden: r.hidden,
      })));
    } catch (err) {
      console.log("  ⚠ shared.objects (type=form) query failed:", err.message);
    }

    writeJson("forms.json", forms);
    summary.forms = forms.length;

    // ── 2. Field definitions ───────────────────────

    console.log("→ Exporting field definitions...");
    // Extract fields/controls from form definitions (JSONB)
    const fields = [];

    function extractControls(def, formName, section = "root") {
      if (!def || typeof def !== "object") return;
      // Check detail.controls
      if (def.detail && Array.isArray(def.detail.controls)) {
        for (const control of def.detail.controls) {
          fields.push({
            form_name: formName,
            section,
            sub_section: "detail",
            control_name: control.name || control.controlSource || "unnamed",
            control_type: control.type || "unknown",
            control_source: control.controlSource || null,
            caption: control.caption || null,
            definition: control,
          });
          // Recurse into subform definitions
          if (control.definition && typeof control.definition === "object") {
            extractControls(control.definition, formName, section + ".detail");
          }
        }
      }
      // Check header.controls
      if (def.header && Array.isArray(def.header.controls)) {
        for (const control of def.header.controls) {
          fields.push({
            form_name: formName,
            section,
            sub_section: "header",
            control_name: control.name || control.controlSource || "unnamed",
            control_type: control.type || "unknown",
            control_source: control.controlSource || null,
            caption: control.caption || null,
            definition: control,
          });
        }
      }
      // Check footer.controls
      if (def.footer && Array.isArray(def.footer.controls)) {
        for (const control of def.footer.controls) {
          fields.push({
            form_name: formName,
            section,
            sub_section: "footer",
            control_name: control.name || control.controlSource || "unnamed",
            control_type: control.type || "unknown",
            control_source: control.controlSource || null,
            caption: control.caption || null,
            definition: control,
          });
        }
      }
      // Check nested controls within section objects (e.g. sections.detailHeight etc.)
      if (def.sections && typeof def.sections === "object") {
        for (const [sectionKey, sectionVal] of Object.entries(def.sections)) {
          if (sectionVal && typeof sectionVal === "object" && Array.isArray(sectionVal.controls)) {
            for (const control of sectionVal.controls) {
              fields.push({
                form_name: formName,
                section,
                sub_section: "sections." + sectionKey,
                control_name: control.name || control.controlSource || "unnamed",
                control_type: control.type || "unknown",
                control_source: control.controlSource || null,
                caption: control.caption || null,
                definition: control,
              });
            }
          }
        }
      }
    }

    for (const form of forms) {
      if (form.definition && typeof form.definition === "object") {
        extractControls(form.definition, form.name || "unknown");
      }
    }
    writeJson("fields.json", fields);
    summary.fields = fields.length;

    // ── 3. Event handlers ──────────────────────────

    console.log("→ Exporting event handlers...");
    let events = [];
    try {
      events = await queryAll("SELECT * FROM shared.event_handlers ORDER BY sort_order NULLS LAST, id");
    } catch (err) {
      console.log("  ⚠ shared.event_handlers query failed:", err.message);
    }
    writeJson("events.json", events);
    summary.events = events.length;

    // ── 4. Navigation tree ─────────────────────────

    console.log("→ Exporting navigation tree...");
    let navTree = [];
    try {
      navTree = await queryAll("SELECT * FROM shared.nav_tree ORDER BY sort_order NULLS LAST, id");
    } catch (err) {
      console.log("  ⚠ shared.nav_tree query failed:", err.message);
    }
    writeJson("nav_tree.json", navTree);
    summary.nav_tree = navTree.length;

    // ── 5. Permissions ─────────────────────────────

    console.log("→ Exporting permissions...");
    const permissions = {};

    try {
      permissions.roles = await queryAll("SELECT * FROM shared.roles ORDER BY id");
    } catch (err) {
      console.log("  ⚠ shared.roles query failed:", err.message);
      permissions.roles = [];
    }

    try {
      permissions.user_roles = await queryAll("SELECT * FROM shared.user_roles ORDER BY id");
    } catch (err) {
      console.log("  ⚠ shared.user_roles query failed:", err.message);
      permissions.user_roles = [];
    }

    try {
      permissions.table_permissions = await queryAll("SELECT * FROM shared.table_permissions ORDER BY role_id, table_name");
    } catch (err) {
      console.log("  ⚠ shared.table_permissions query failed:", err.message);
      permissions.table_permissions = [];
    }

    try {
      permissions.field_permissions = await queryAll("SELECT * FROM shared.field_permissions ORDER BY role_id, table_name, field_name");
    } catch (err) {
      console.log("  ⚠ shared.field_permissions query failed:", err.message);
      permissions.field_permissions = [];
    }

    try {
      permissions.row_filters = await queryAll("SELECT * FROM shared.row_filters ORDER BY id");
    } catch (err) {
      console.log("  ⚠ shared.row_filters query failed:", err.message);
      permissions.row_filters = [];
    }

    writeJson("permissions.json", permissions);
    summary.permissions = permissions.roles.length + " roles, " +
      permissions.user_roles.length + " user_roles, " +
      permissions.table_permissions.length + " table_perms, " +
      permissions.field_permissions.length + " field_perms, " +
      permissions.row_filters.length + " row_filters";

    // ── 6. Report definitions ──────────────────────

    console.log("→ Exporting report definitions...");
    let reports = [];
    try {
      // From shared.objects WHERE type = 'report'
      reports = await queryAll(
        "SELECT * FROM shared.objects WHERE type = 'report' ORDER BY id"
      );
    } catch (err) {
      console.log("  ⚠ shared.objects (type=report) query failed:", err.message);
    }
    // Also try shared.reports if it has data
    try {
      const reportRows = await queryAll("SELECT * FROM shared.reports ORDER BY id");
      for (const r of reportRows) {
        // Only add if not already present (dedup by name)
        if (!reports.find(ex => ex.name === r.name)) {
          reports.push({ ...r, source: "reports_table" });
        }
      }
    } catch (err) {
      console.log("  ⚠ shared.reports query failed:", err.message);
    }
    writeJson("reports.json", reports);
    summary.reports = reports.length;

    // ── 7. Settings / theme / appearance ────────────

    console.log("→ Exporting settings/theme...");
    let settings = [];
    try {
      settings = await queryAll(
        "SELECT * FROM shared.objects WHERE type = 'appearance' ORDER BY id"
      );
    } catch (err) {
      console.log("  ⚠ shared.objects (type=appearance) query failed:", err.message);
    }
    writeJson("settings.json", settings);
    summary.settings = settings.length;

    // ── Summary ─────────────────────────────────────

    console.log("");
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║              Export Complete                ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log(`  forms.json          ${String(summary.forms).padStart(6)} entries`);
    console.log(`  fields.json         ${String(summary.fields).padStart(6)} entries`);
    console.log(`  events.json         ${String(summary.events).padStart(6)} entries`);
    console.log(`  nav_tree.json       ${String(summary.nav_tree).padStart(6)} entries`);
    console.log(`  permissions.json    ${summary.permissions}`);
    console.log(`  reports.json        ${String(summary.reports).padStart(6)} entries`);
    console.log(`  settings.json       ${String(summary.settings).padStart(6)} entries`);
    console.log("");

  } catch (err) {
    console.error("\n✗ Export failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
