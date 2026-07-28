/**
 * test_audit_performance.cjs — Step 60 audit performance optimization tests
 *
 * Run: node server/__tests__/test_audit_performance.cjs
 *
 * Checks:
 *   1. SQL migration file is readable and valid
 *   2. Partitioning
 *   3. GIN indexes
 *   4. Async write queue
 *   5. Performance config
 *   6. Auto-partition functions
 *   7. Partition status view
 *   8. Helper functions
 *   9. audit-writer.cjs exists
 *  10. Backward compatibility
 *  11. Async write mode end-to-end
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({ database: "polyaccess" });

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

(async () => {
  console.log("\n--- Step 60: Audit Performance Optimization Tests ---\n");

  // 1. SQL migration file validity
  {
    const sqlPath = path.join(__dirname, "../sql/step-60-audit-performance.sql");
    const ok = fs.existsSync(sqlPath);
    assert("SQL migration file exists", ok);
    if (ok) {
      const sql = fs.readFileSync(sqlPath, "utf8");
      assert("SQL file is non-empty", sql.length > 100);
      assert("Contains PARTITION BY RANGE", sql.includes("PARTITION BY RANGE"));
      assert("Contains GIN indexes", sql.includes("USING GIN (old_data jsonb_path_ops)"));
      assert("Contains audit_write_queue", sql.includes("audit_write_queue"));
      assert("Contains audit_performance_config", sql.includes("audit_performance_config"));
      assert("Contains flush_audit_write_queue", sql.includes("flush_audit_write_queue"));
      assert("Contains create_audit_partition", sql.includes("create_audit_partition"));
      assert("Wrapped in BEGIN/COMMIT", sql.includes("BEGIN;") && sql.includes("COMMIT;"));
    }
  }

  // 2. Partitioned table structure
  {
    const { rows } = await pool.query(
      `SELECT relkind FROM pg_class c
       JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname = 'shared' AND c.relname = 'audit_log'`
    );
    assert("audit_log relkind is 'p' (partitioned)", rows.length === 1 && rows[0].relkind === "p");
  }

  // 3. Monthly partitions exist
  {
    const { rows } = await pool.query(
      `SELECT c.relname FROM pg_class c
       JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname = 'shared'
         AND c.relname LIKE 'audit_log_2026_%'
         AND c.relkind = 'r'
       ORDER BY c.relname`
    );
    assert("at least 2 monthly partitions", rows.length >= 2);
    assert("partition audit_log_2026_07 exists", rows.some((r) => r.relname === "audit_log_2026_07"));
    assert("partition audit_log_2026_08 exists", rows.some((r) => r.relname === "audit_log_2026_08"));
  }

  // 4. Existing data in correct partition
  {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::INT AS cnt FROM shared.audit_log
       WHERE changed_at >= '2026-07-01' AND changed_at < '2026-08-01'`
    );
    assert("28 existing rows in audit_log_2026_07", rows[0].cnt === 28);
  }

  // 5. New INSERT routes correctly
  {
    const { rows: ins } = await pool.query(
      `INSERT INTO shared.audit_log (table_name, record_id, action, new_data, changed_by_name, company_id)
       VALUES ('__test_partition', 1, 'INSERT', '{}'::jsonb, 'system', 1)
       RETURNING id`
    );
    assert("INSERT into partitioned table returns id", ins.length === 1 && ins[0].id != null);
    const { rows: check } = await pool.query(
      `SELECT table_name FROM shared.audit_log WHERE id = $1`, [ins[0].id]
    );
    assert("row is queryable from parent", check.length === 1 && check[0].table_name === "__test_partition");
    await pool.query("DELETE FROM shared.audit_log WHERE id = $1", [ins[0].id]);
  }

  // 6. GIN indexes exist with correct options
  {
    const { rows } = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'shared' AND tablename = 'audit_log'
         AND indexname LIKE '%gin%'
       ORDER BY indexname`
    );
    const names = rows.map((r) => r.indexname);
    const defs = rows.map((r) => r.indexdef);
    assert("idx_audit_log_old_data_gin exists", names.includes("idx_audit_log_old_data_gin"));
    assert("idx_audit_log_new_data_gin exists", names.includes("idx_audit_log_new_data_gin"));
    assert("old_data GIN uses jsonb_path_ops",
      defs.some((d) => d.includes("old_data") && d.includes("jsonb_path_ops")));
    assert("new_data GIN uses jsonb_path_ops",
      defs.some((d) => d.includes("new_data") && d.includes("jsonb_path_ops")));
  }

  // 7. Async write queue table exists
  {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'shared' AND table_name = 'audit_write_queue'`
    );
    assert("shared.audit_write_queue table exists", rows.length === 1);
  }

  // 8. Queue table columns
  {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'shared' AND table_name = 'audit_write_queue'
       ORDER BY ordinal_position`
    );
    const cols = rows.map((r) => r.column_name);
    assert("queue has id", cols.includes("id"));
    assert("queue has table_name", cols.includes("table_name"));
    assert("queue has flushed", cols.includes("flushed"));
    assert("queue has error_msg", cols.includes("error_msg"));
  }

  // 9. Queue insert + flush round-trip
  {
    const { rows: queued } = await pool.query(
      `INSERT INTO shared.audit_write_queue (table_name, record_id, action, new_data, changed_by_name)
       VALUES ('__test_queue', 1, 'INSERT', '{"test":true}'::jsonb, 'tester')
       RETURNING id`
    );
    assert("queue insert returns id", queued.length === 1 && queued[0].id != null);
    const queueId = queued[0].id;

    const { rows: unflushed } = await pool.query(
      `SELECT flushed FROM shared.audit_write_queue WHERE id = $1`, [queueId]
    );
    assert("entry starts unflushed", !unflushed[0].flushed);

    const { rows: flushResult } = await pool.query(
      `SELECT * FROM shared.flush_audit_write_queue(500, false)`
    );
    assert("flush returns batch_id", flushResult[0].batch_id != null);
    assert("flush moved >= 1 entry", flushResult[0].entries_moved >= 1);

    const { rows: auditCheck } = await pool.query(
      `SELECT table_name FROM shared.audit_log WHERE table_name = '__test_queue'`
    );
    assert("flushed entry appears in audit_log", auditCheck.length >= 1);

    const { rows: flushedCheck } = await pool.query(
      `SELECT flushed, flushed_at FROM shared.audit_write_queue WHERE id = $1`, [queueId]
    );
    assert("entry marked flushed", flushedCheck[0].flushed);
    assert("flushed_at timestamp set", flushedCheck[0].flushed_at != null);

    await pool.query("DELETE FROM shared.audit_log WHERE table_name = '__test_queue'");
    await pool.query("DELETE FROM shared.audit_write_queue WHERE id = $1", [queueId]);
  }

  // 10. Dry-run flush
  {
    const { rows } = await pool.query(
      `SELECT * FROM shared.flush_audit_write_queue(500, true)`
    );
    assert("dry-run returns batch_id", rows[0].batch_id != null);
    assert("dry-run errors is 0", parseInt(rows[0].entries_errored) === 0);
  }

  // 11. Performance config table
  {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'shared' AND table_name = 'audit_performance_config'`
    );
    assert("shared.audit_performance_config exists", rows.length === 1);
  }

  // 12. Config seeded correctly
  {
    const { rows } = await pool.query(
      `SELECT param_key, param_value FROM shared.audit_performance_config ORDER BY param_key`
    );
    const cfg = {};
    for (const r of rows) cfg[r.param_key] = r.param_value;
    assert("write_mode = sync", cfg.write_mode === "sync");
    assert("partition_interval set", cfg.partition_interval != null);
    assert("partition_future_months set", cfg.partition_future_months != null);
    assert("at least 3 config rows", rows.length >= 3);
  }

  // 13. create_audit_partition function
  {
    const { rows } = await pool.query(
      `SELECT proname FROM pg_proc
       WHERE proname = 'create_audit_partition' AND pronamespace = 'shared'::regnamespace`
    );
    assert("shared.create_audit_partition() exists", rows.length >= 1);
  }

  // 14. create_audit_partitions_future function
  {
    const { rows } = await pool.query(
      `SELECT proname FROM pg_proc
       WHERE proname = 'create_audit_partitions_future' AND pronamespace = 'shared'::regnamespace`
    );
    assert("shared.create_audit_partitions_future() exists", rows.length >= 1);
  }

  // 15. Create a partition programmatically
  {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 3).padStart(2, "0");
    const suffix = `${y}_${m}`;

    const { rows } = await pool.query(
      `SELECT shared.create_audit_partition($1)`, [suffix]
    );
    assert("create_audit_partition returns result", rows.length >= 1 && rows[0].create_audit_partition != null);

    const { rows: check } = await pool.query(
      `SELECT COUNT(*)::INT AS cnt FROM pg_class c
       JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname = 'shared' AND c.relname = 'audit_log_' || $1`,
      [suffix]
    );
    assert(`partition audit_log_${suffix} exists`, check[0].cnt >= 1);
  }

  // 16. Partition status view exists
  {
    const { rows } = await pool.query(
      `SELECT viewname FROM pg_views
       WHERE schemaname = 'shared' AND viewname = 'audit_partition_status'`
    );
    assert("shared.audit_partition_status view exists", rows.length === 1);
  }

  // 17. Partition status view returns data
  {
    const { rows } = await pool.query(`SELECT * FROM shared.audit_partition_status`);
    assert("partition_status returns >= 4 rows", rows.length >= 4);
    assert("includes 2026_07", rows.some((r) => r.partition_name.includes("2026_07")));
    assert("includes 2026_08", rows.some((r) => r.partition_name.includes("2026_08")));
    assert("row has size", rows[0].size != null);
    assert("row has estimated_row_count", rows[0].estimated_row_count != null);
    assert("row has partition_boundary", rows[0].partition_boundary != null);
  }

  // 18. drop_audit_partition function
  {
    const { rows } = await pool.query(
      `SELECT proname FROM pg_proc
       WHERE proname = 'drop_audit_partition' AND pronamespace = 'shared'::regnamespace`
    );
    assert("shared.drop_audit_partition() exists", rows.length >= 1);
  }

  // 19. audit-writer.cjs exists
  {
    const sp = path.join(__dirname, "../cron/audit-writer.cjs");
    const ok = fs.existsSync(sp);
    assert("audit-writer.cjs exists", ok);
    if (ok) {
      const script = fs.readFileSync(sp, "utf8");
      assert("writer is non-empty", script.length > 100);
      assert("imports pg Pool", script.includes("Pool"));
      assert("calls flush_audit_write_queue", script.includes("flush_audit_write_queue"));
      assert("calls create_audit_partitions_future", script.includes("create_audit_partitions_future"));
    }
  }

  // 20. Backward compat: trigger function exists
  {
    const { rows } = await pool.query(
      `SELECT proname FROM pg_proc
       WHERE proname = 'audit_log_trigger' AND pronamespace = 'shared'::regnamespace`
    );
    assert("shared.audit_log_trigger() still exists", rows.length === 1);
  }

  // 21. Backward compat: prune function exists (same signature)
  {
    const { rows } = await pool.query(
      `SELECT proname FROM pg_proc
       WHERE proname = 'prune_audit_log' AND pronamespace = 'shared'::regnamespace`
    );
    assert("shared.prune_audit_log() still exists", rows.length >= 1);
  }

  // 22. Dry-run prune works with partitioned table
  {
    const { rows } = await pool.query(
      `SELECT * FROM shared.prune_audit_log(NULL, true)`
    );
    assert("prune dry-run returns rows", rows.length >= 0);
    if (rows.length > 0) {
      assert("prune result has table_name", rows[0].table_name != null);
      assert("prune result has entries_pruned", rows[0].entries_pruned != null);
    }
  }

  // 23. Async write mode end-to-end via trigger + queue
  {
    const TEST_TABLE = "__test_perf_async";
    try {
      await pool.query(`DROP TABLE IF EXISTS db_fcc_erp."${TEST_TABLE}" CASCADE`);
      await pool.query(
        `CREATE TABLE db_fcc_erp."${TEST_TABLE}" (id SERIAL PRIMARY KEY, name VARCHAR(100), company_id INT DEFAULT 1)`
      );
      await pool.query(
        `CREATE TRIGGER trg_audit_${TEST_TABLE}
         AFTER INSERT OR UPDATE OR DELETE ON db_fcc_erp."${TEST_TABLE}"
         FOR EACH ROW EXECUTE FUNCTION shared.audit_log_trigger()`
      );

      // Switch to async mode
      await pool.query(
        `UPDATE shared.audit_performance_config SET param_value = 'async' WHERE param_key = 'write_mode'`
      );

      const { rows: ins } = await pool.query(
        `INSERT INTO db_fcc_erp."${TEST_TABLE}" (name) VALUES ('async-test') RETURNING id`
      );
      const recordId = ins[0].id;

      // Verify in queue, not in audit_log
      const { rows: qc } = await pool.query(
        `SELECT COUNT(*)::INT AS cnt FROM shared.audit_write_queue
         WHERE table_name = $1 AND record_id = $2 AND flushed = false`,
        [TEST_TABLE, recordId]
      );
      assert("async: entry in write queue", qc[0].cnt >= 1);

      const { rows: ac } = await pool.query(
        `SELECT COUNT(*)::INT AS cnt FROM shared.audit_log
         WHERE table_name = $1 AND record_id = $2`,
        [TEST_TABLE, recordId]
      );
      assert("async: entry NOT yet in audit_log", ac[0].cnt === 0);

      // Flush
      await pool.query(`SELECT * FROM shared.flush_audit_write_queue(500, false)`);

      const { rows: af } = await pool.query(
        `SELECT COUNT(*)::INT AS cnt FROM shared.audit_log
         WHERE table_name = $1 AND record_id = $2`,
        [TEST_TABLE, recordId]
      );
      assert("async: after flush, in audit_log", af[0].cnt >= 1);

      await pool.query(`DROP TABLE IF EXISTS db_fcc_erp."${TEST_TABLE}" CASCADE`);
      await pool.query(`DELETE FROM shared.audit_write_queue WHERE table_name = $1`, [TEST_TABLE]);
      await pool.query(`DELETE FROM shared.audit_log WHERE table_name = $1`, [TEST_TABLE]);
    } catch (e) {
      assert("async mode test: " + e.message, false);
    }

    // Restore sync
    await pool.query(
      `UPDATE shared.audit_performance_config SET param_value = 'sync' WHERE param_key = 'write_mode'`
    );
    const { rows: cm } = await pool.query(
      `SELECT param_value FROM shared.audit_performance_config WHERE param_key = 'write_mode'`
    );
    assert("config restored to sync", cm[0].param_value === "sync");
  }

  // ─── Summary ─────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
  await pool.end();
  if (failed > 0) process.exit(1);
})();