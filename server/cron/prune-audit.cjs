#!/usr/bin/env node
/**
 * prune-audit.cjs — Cron script for auto-pruning audit log entries
 *
 * Can be run:
 *   1. As a system cron job (recommended: daily at 3am)
 *      0 3 * * * cd /path/to/roastery-ui && node server/cron/prune-audit.cjs >> /var/log/audit-prune.log 2>&1
 *
 *   2. Directly from the command line
 *      node server/cron/prune-audit.cjs
 *      node server/cron/prune-audit.cjs --dry-run     # preview only
 *      node server/cron/prune-audit.cjs --table products  # prune one table
 *
 *   3. From the API via POST /api/audit/prune (triggered in UI)
 *
 * Logs to stdout. Sets exit code 0 on success, 1 on failure.
 */

const { Pool } = require("pg");

const pool = new Pool({ database: "polyaccess" });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run") || args.includes("-n");
const tableArg = (() => {
  const ti = args.indexOf("--table");
  if (ti !== -1 && args[ti + 1]) return args[ti + 1];
  const ti2 = args.indexOf("-t");
  if (ti2 !== -1 && args[ti2 + 1]) return args[ti2 + 1];
  return null;
})();

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] Audit prune${isDryRun ? " (DRY RUN)" : ""}${tableArg ? ` — table: ${tableArg}` : " — all tables"}`);

  let result;
  if (tableArg) {
    const { rows } = await pool.query(
      `SELECT * FROM shared.prune_audit_log($1, $2)`,
      [tableArg, isDryRun]
    );
    result = rows;
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM shared.prune_audit_log(NULL, $1)`,
      [isDryRun]
    );
    result = rows;
  }

  let totalBefore = 0;
  let totalPruned = 0;
  let tableCount = 0;

  for (const row of result) {
    totalBefore += parseInt(row.entries_before) || 0;
    totalPruned += parseInt(row.entries_pruned) || 0;
    tableCount++;
    console.log(
      `  ${row.table_name}: retention=${row.retention_days}d, ` +
      `entries_before=${row.entries_before}, ` +
      `pruned=${row.entries_pruned}, ` +
      `oldest_kept=${row.oldest_kept || "none"}, ` +
      `cutoff=${row.cutoff_date}`
    );
  }

  const finishedAt = new Date().toISOString();
  if (isDryRun) {
    console.log(`\n[${finishedAt}] DRY RUN: ${totalBefore} entries would be pruned across ${tableCount} tables`);
  } else {
    console.log(`\n[${finishedAt}] Pruned ${totalPruned} entries across ${tableCount} tables (${totalBefore} eligible before prune)`);
  }

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Prune failed:`, err.message);
  pool.end().catch(() => {});
  process.exit(1);
});