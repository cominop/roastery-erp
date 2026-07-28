#!/usr/bin/env node
/**
 * audit-writer.cjs — Background writer for the async audit queue
 *
 * Flushes unflushed entries from shared.audit_write_queue to the
 * partitioned shared.audit_log table. Also ensures future monthly
 * partitions exist.
 *
 * Can be run:
 *   1. As a system cron job (recommended: every minute during business hours)
 *      * * * * * cd /path/to/roastery-ui && node server/cron/audit-writer.cjs >> /var/log/audit-writer.log 2>&1
 *
 *   2. Directly from the command line
 *      node server/cron/audit-writer.cjs                # flush queue + create partitions
 *      node server/cron/audit-writer.cjs --dry-run      # preview only
 *      node server/cron/audit-writer.cjs --flush-only   # skip partition creation
 *      node server/cron/audit-writer.cjs --partitions-only  # skip queue flush
 *
 *   3. From Hermes cron (configured via cronjob tool)
 *
 * Logs to stdout. Sets exit code 0 on success, 1 on failure.
 */

const { Pool } = require("pg");

const pool = new Pool({ database: "polyaccess" });

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run") || args.includes("-n");
const flushOnly = args.includes("--flush-only");
const partitionsOnly = args.includes("--partitions-only");

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] Audit writer${isDryRun ? " (DRY RUN)" : ""}`);

  // ── Phase 1: Ensure future partitions exist ───────────
  if (!flushOnly) {
    console.log("\n  Phase 1: Ensuring future partitions...");
    try {
      const { rows } = await pool.query(
        `SELECT * FROM shared.create_audit_partitions_future(NULL)`
      );
      for (const row of rows) {
        console.log(`    ${row.create_audit_partitions_future}`);
      }
    } catch (err) {
      console.error(`    ERROR creating partitions: ${err.message}`);
      // Non-fatal — queue flush can still proceed
    }
  }

  // ── Phase 2: Flush write queue ────────────────────────
  if (!partitionsOnly) {
    console.log("\n  Phase 2: Flushing write queue...");

    try {
      const { rows } = await pool.query(
        `SELECT * FROM shared.flush_audit_write_queue(500, $1)`,
        [isDryRun]
      );

      for (const row of rows) {
        const label = isDryRun ? "would flush" : "flushed";
        console.log(
          `    batch=${row.batch_id}: ${label} ${row.entries_moved} entries` +
            (row.entries_errored > 0
              ? `, ${row.entries_errored} errored`
              : "")
        );
      }
    } catch (err) {
      console.error(`    ERROR flushing queue: ${err.message}`);
    }

    // Check for errored entries
    if (!isDryRun) {
      try {
        const { rows: errored } = await pool.query(
          `SELECT COUNT(*)::INT AS cnt FROM shared.audit_write_queue WHERE error_msg IS NOT NULL`
        );
        if (errored[0].cnt > 0) {
          console.log(`    ${errored[0].cnt} entries have errors (see error_msg column)`);
        }
      } catch (_) {
        // Best-effort
      }
    }
  }

  // ── Summary ───────────────────────────────────────────
  const finishedAt = new Date().toISOString();
  console.log(`\n[${finishedAt}] Audit writer complete`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Audit writer failed:`, err.message);
  pool.end().catch(() => {});
  process.exit(1);
});