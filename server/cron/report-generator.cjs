#!/usr/bin/env node
/**
 * report-generator.cjs — Scheduled auto-generation of reports
 *
 * Checks shared.report_definitions for reports with auto_generate configured,
 * determines which are due based on their cron schedule, and generates them.
 *
 * Can be run:
 *   1. As a system cron job (recommended: every hour or every 30 min)
 *      cron: every 30 minutes → cd /path/to/roastery-ui && node server/cron/report-generator.cjs >> /var/log/report-generator.log 2>&1
 *
 *   2. From Hermes cron (configured via cronjob tool)
 *
 *   3. Directly from the command line
 *      node server/cron/report-generator.cjs                    # generate all due reports
 *      node server/cron/report-generator.cjs --dry-run          # preview what would be generated
 *      node server/cron/report-generator.cjs --report invoice   # force-generate a specific report
 *      node server/cron/report-generator.cjs --report invoice --params '{"order_id":"28503"}'
 *      node server/cron/report-generator.cjs --since 2026-01-01 # only check reports due since this date
 *
 * Logs to stdout. Sets exit code 0 on success, 1 on partial/failure.
 */

const { Pool } = require("pg");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const pool = new Pool({ database: "polyaccess" });

// ─── Config ────────────────────────────────────────────────

const SERVER_DIR = path.resolve(__dirname, "..");
const TEMPLATE_DIR = path.resolve(SERVER_DIR, "templates");
const OUTPUT_DIR = path.resolve(SERVER_DIR, "output");
const DATA_FETCHER = path.resolve(SERVER_DIR, "reports/data_fetcher.py");
const RENDERER_SCRIPT = path.resolve(SERVER_DIR, "reports/renderer.py");

// Prefer the project venv Python (has odfpy + psycopg2)
const PYTHON_BIN = (() => {
  const venv = path.resolve(SERVER_DIR, "..", ".venv", "bin", "python3");
  return fs.existsSync(venv) ? venv : "python3";
})();

// ─── Cron expression → due check ──────────────────────────

/**
 * Parse a cron frequency alias to a daily/weekly/monthly check.
 * Returns a function that returns true if the report should run now.
 */
function parseCronAlias(cronExpr) {
  switch (cronExpr) {
    case "daily":
      return () => true; // Check date-based in the SQL function
    case "weekly":
      return () => true; // Check date-based in the SQL function
    case "monthly":
      return () => true; // Check date-based in the SQL function
    default:
      // For custom cron expressions, always return true here
      // The SQL function filters by date, and we rely on it
      return () => true;
  }
}

// ─── Report generation ─────────────────────────────────────

/**
 * Generate a single report and log the result.
 * Returns { success: true, outputFile, outputSize } or { success: false, error }
 */
async function generateReport(report, parameters = {}, format = null) {
  const reportName = report.name;
  const outputFormat = format || (report.auto_generate && report.auto_generate.format) || "pdf";

  // Validate format is in allowed list
  if (!report.output_formats.includes(outputFormat)) {
    return {
      success: false,
      error: `Format '${outputFormat}' not allowed for report '${reportName}'. Allowed: ${report.output_formats.join(", ")}`,
    };
  }

  // Strip "templates/" prefix from template_file if present
  let templateFile = report.template_file;
  if (templateFile.startsWith("templates/")) {
    templateFile = templateFile.slice("templates/".length);
  }

  const templatePath = path.resolve(TEMPLATE_DIR, templateFile);
  if (!fs.existsSync(templatePath)) {
    return {
      success: false,
      error: `Template file not found: ${templatePath}`,
    };
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    // Step 1: Call data_fetcher.py to get report data
    const paramsJson = JSON.stringify(parameters);

    const dataResult = await runPythonScript(DATA_FETCHER, [reportName, paramsJson]);

    // Parse the data JSON
    let reportData;
    try {
      reportData = JSON.parse(dataResult);
    } catch {
      return {
        success: false,
        error: `Failed to parse data_fetcher output: ${dataResult.substring(0, 500)}`,
      };
    }

    // Write data to a temp JSON file for the renderer
    const dataFilePath = path.resolve(OUTPUT_DIR, `${reportName}_data_${Date.now()}.json`);
    fs.writeFileSync(dataFilePath, JSON.stringify(reportData, null, 2), "utf-8");

    // Step 2: Call renderer.py with the data and band config
    const outputFileName = `${reportName}_${Date.now()}.${outputFormat}`;
    const outputPath = path.resolve(OUTPUT_DIR, outputFileName);

    const renderArgs = [
      "--template", templatePath,
      "--data", dataFilePath,
      "--output", outputPath,
      "--format", outputFormat,
    ];

    // Pass band config if the report has one
    if (report.bands && Object.keys(report.bands).length > 0) {
      const bandConfigPath = path.resolve(OUTPUT_DIR, `${reportName}_bands_${Date.now()}.json`);
      fs.writeFileSync(bandConfigPath, JSON.stringify(report.bands, null, 2), "utf-8");
      renderArgs.push("--band-config", bandConfigPath);
    }

    const renderResult = await runPythonScript(RENDERER_SCRIPT, renderArgs);

    // Clean up temp files
    try {
      if (fs.existsSync(dataFilePath)) fs.unlinkSync(dataFilePath);
      const bandConfigPath = path.resolve(OUTPUT_DIR, `${reportName}_bands_${Date.now()}.json`);
      if (fs.existsSync(bandConfigPath)) fs.unlinkSync(bandConfigPath);
    } catch { /* ignore cleanup errors */ }

    // Verify output exists
    if (!fs.existsSync(outputPath)) {
      // Try alternate output — renderer may have used its own naming
      const base = path.basename(templatePath, ".ods");
      const altPath = path.resolve(OUTPUT_DIR, `${base}.${outputFormat}`);
      if (fs.existsSync(altPath)) {
        const stats = fs.statSync(altPath);
        return {
          success: true,
          outputFile: altPath,
          outputSize: stats.size,
          outputFileName: path.basename(altPath),
        };
      }
      return {
        success: false,
        error: `Renderer did not produce output file. Render output: ${renderResult.substring(0, 500)}`,
      };
    }

    const stats = fs.statSync(outputPath);
    return {
      success: true,
      outputFile: outputPath,
      outputSize: stats.size,
      outputFileName: outputFileName,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Run a Python script with arguments, return stdout.
 */
function runPythonScript(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [script, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Exit code ${code}`));
      } else {
        resolve(stdout.trim());
      }
    });
    child.on("error", reject);
  });
}

// ─── Logging helpers ───────────────────────────────────────

async function logRunStart(reportId, reportName, caption, format, parameters, triggeredBy) {
  const { rows } = await pool.query(
    `INSERT INTO shared.report_schedule_log
     (report_id, report_name, caption, triggered_by, format, status, parameters)
     VALUES ($1, $2, $3, $4, $5, 'running', $6::jsonb)
     RETURNING id`,
    [reportId, reportName, caption, triggeredBy, format, JSON.stringify(parameters)]
  );
  return rows[0].id;
}

async function logRunSuccess(logId, outputFile, outputSize) {
  await pool.query(
    `UPDATE shared.report_schedule_log
     SET status = 'success', output_file = $2, output_size = $3, finished_at = NOW()
     WHERE id = $1`,
    [logId, outputFile, outputSize]
  );
}

async function logRunError(logId, errorMessage) {
  await pool.query(
    `UPDATE shared.report_schedule_log
     SET status = 'error', error_message = $2, finished_at = NOW()
     WHERE id = $1`,
    [logId, errorMessage]
  );
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run") || args.includes("-n");
  const forceReportIdx = args.indexOf("--report");
  const forceReport = forceReportIdx >= 0 ? args[forceReportIdx + 1] : null;
  const forceParamsIdx = args.indexOf("--params");
  const forceParams = forceParamsIdx >= 0 ? JSON.parse(args[forceParamsIdx + 1]) : {};

  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] Report generator${isDryRun ? " (DRY RUN)" : ""}`);

  let reports;

  if (forceReport) {
    // Force-generate a specific report by name
    console.log(`  Force mode: generating report '${forceReport}'`);
    const { rows } = await pool.query(
      `SELECT * FROM shared.report_definitions WHERE name = $1 AND enabled = true`,
      [forceReport]
    );
    if (rows.length === 0) {
      console.error(`  ERROR: Report '${forceReport}' not found or disabled`);
      await pool.end();
      process.exit(1);
    }
    reports = rows;
  } else {
    // Query for due reports using the helper function
    const { rows } = await pool.query(
      `SELECT * FROM shared.fn_reports_due_for_generation()`
    );
    reports = rows;
  }

  if (reports.length === 0) {
    console.log("  No reports due for generation.");
    await pool.end();
    process.exit(0);
  }

  console.log(`  Found ${reports.length} report(s) due for generation:\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const report of reports) {
    const schedule = report.auto_generate || {};
    const format = schedule.format || "pdf";
    const cronExpr = schedule.cron || "daily";
    const params = forceReport ? forceParams : {};

    console.log(`  ── ${report.caption} (${report.name})`);
    console.log(`      Schedule: ${cronExpr} → Format: ${format}`);

    if (isDryRun) {
      console.log(`      [DRY RUN] Would generate`);
      successCount++;
      continue;
    }

    // Log the run start
    let logId;
    try {
      logId = await logRunStart(
        report.id, report.name, report.caption,
        format, params, "cron"
      );
    } catch (err) {
      console.error(`      ERROR logging start: ${err.message}`);
      errorCount++;
      continue;
    }

    // Generate the report
    const result = await generateReport(report, params, format);

    if (result.success) {
      await logRunSuccess(logId, result.outputFile, result.outputSize);
      console.log(`      ✓ Generated: ${result.outputFileName} (${formatSize(result.outputSize)})`);
      successCount++;
    } else {
      await logRunError(logId, result.error);
      console.error(`      ✗ Error: ${result.error}`);
      errorCount++;
    }
  }

  // Summary
  const finishedAt = new Date().toISOString();
  console.log(`\n[${finishedAt}] Generator complete: ${successCount} success, ${errorCount} error(s)`);

  await pool.end();
  process.exit(errorCount > 0 ? 1 : 0);
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Report generator failed:`, err.message);
  pool.end().catch(() => {});
  process.exit(1);
});