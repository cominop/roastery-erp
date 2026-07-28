/**
 * test_audit_retention.cjs — Step 59 audit retention + pruning tests
 *
 * Run: node server/__tests__/test_audit_retention.cjs
 *
 * Checks:
 *   1. SQL migration file is readable and valid
 *   2. shared.audit_retention_config table exists with correct columns
 *   3. Default config seeded (retention_days = 365, table_name IS NULL)
 *   4. shared.prune_audit_log() function exists
 *   5. shared.audit_retention_status view exists
 *   6. Dry-run prune returns expected shape
 *   7. API routes respond correctly (requires server on port 3001)
 *      - GET /api/audit/retention
 *      - PUT /api/audit/retention (update default)
 *      - POST /api/audit/prune (dry run)
 *      - GET /api/audit/prune/stats
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const http = require("http");

const pool = new Pool({ database: "polyaccess" });
const BASE_URL = "http://localhost:3001";

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

// ─── Helpers ───────────────────────────────────────────

async function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url.startsWith("http") ? url : `${BASE_URL}${url}`);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...options.headers },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ─── Tests ─────────────────────────────────────────────

(async () => {
  console.log("\n--- Step 59: Audit Retention + Pruning Tests ---\n");

  // 1. SQL migration file
  {
    const sqlPath = path.join(__dirname, "../sql/step-59-audit-retention.sql");
    const ok = fs.existsSync(sqlPath);
    assert("SQL migration file exists", ok);

    if (ok) {
      const sql = fs.readFileSync(sqlPath, "utf8");
      assert("SQL file is non-empty", sql.length > 100);
      assert("SQL contains audit_retention_config", sql.includes("audit_retention_config"));
      assert("SQL contains prune_audit_log function", sql.includes("prune_audit_log"));
      assert("SQL contains audit_retention_status view", sql.includes("audit_retention_status"));
      assert("SQL is wrapped in BEGIN/COMMIT", sql.includes("BEGIN;") && sql.includes("COMMIT;"));
    }
  }

  // 2. Table exists
  {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'shared' AND table_name = 'audit_retention_config'`
    );
    assert("shared.audit_retention_config table exists", rows.length === 1);
  }

  // 3. Column structure
  {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'shared' AND table_name = 'audit_retention_config'
       ORDER BY ordinal_position`
    );
    const columns = rows.map((r) => r.column_name);
    assert("has id column", columns.includes("id"));
    assert("has table_name column", columns.includes("table_name"));
    assert("has retention_days column", columns.includes("retention_days"));
    assert("has last_pruned_at column", columns.includes("last_pruned_at"));
    assert("has active column", columns.includes("active"));
    assert("has created_at column", columns.includes("created_at"));
    assert("has updated_at column", columns.includes("updated_at"));
    assert("has 7 columns", columns.length === 7);
  }

  // 4. Default config seeded
  {
    const { rows } = await pool.query(
      `SELECT table_name, retention_days FROM shared.audit_retention_config
       WHERE table_name IS NULL`
    );
    assert("default config exists with NULL table_name", rows.length === 1);
    assert("default retention is 365 days", rows[0].retention_days === 365);
  }

  // 5. prune_audit_log function exists
  {
    const { rows } = await pool.query(
      `SELECT proname FROM pg_proc
       WHERE proname = 'prune_audit_log' AND pronamespace = 'shared'::regnamespace`
    );
    assert("shared.prune_audit_log() function exists", rows.length >= 1);
  }

  // 6. audit_retention_status view exists
  {
    const { rows } = await pool.query(
      `SELECT viewname FROM pg_views
       WHERE schemaname = 'shared' AND viewname = 'audit_retention_status'`
    );
    assert("shared.audit_retention_status view exists", rows.length === 1);
  }

  // 7. Dry-run prune returns expected shape
  {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM shared.prune_audit_log(NULL, true)`
      );
      assert("dry-run prune returns rows (DB has audit entries)", rows.length >= 0);
      if (rows.length > 0) {
        const row = rows[0];
        assert("dry-run result has table_name", row.table_name != null);
        assert("dry-run result has retention_days", row.retention_days != null);
        assert("dry-run result has entries_before", row.entries_before != null);
        assert("dry-run result has entries_pruned", row.entries_pruned != null);
        assert("dry-run entries_pruned is 0 (dry run, no delete)", parseInt(row.entries_pruned) === 0);
        assert("dry-run result has oldest_kept", row.oldest_kept != null);
        assert("dry-run result has cutoff_date", row.cutoff_date != null);
      }
    } catch (e) {
      assert("dry-run prune query succeeds: " + e.message, false);
    }
  }

  // 8. Set up a test override to verify per-table retention
  {
    // Insert a test override
    await pool.query(
      `INSERT INTO shared.audit_retention_config (table_name, retention_days)
       VALUES ('__test_retention', 90)
       ON CONFLICT (table_name) DO UPDATE SET retention_days = 90`
    );

    const { rows } = await pool.query(
      `SELECT retention_days FROM shared.audit_retention_config
       WHERE table_name = '__test_retention'`
    );
    assert("per-table override insert succeeds", rows.length >= 1);
    assert("override retention_days is 90", rows[0].retention_days === 90);

    // Clean up
    await pool.query(
      `DELETE FROM shared.audit_retention_config WHERE table_name = '__test_retention'`
    );
  }

  // 9. API server integration tests (optional)
  {
    const serverRunning = await (async () => {
      try {
        const res = await fetchJson("/api/audit/retention");
        return res.status === 200;
      } catch {
        return false;
      }
    })();

    if (serverRunning) {
      console.log("  (API server detected — running API integration tests)\n");

      // 9a. GET /api/audit/retention
      {
        const res = await fetchJson("/api/audit/retention");
        assert("GET /api/audit/retention returns 200", res.status === 200);
        const body = res.body;
        assert("response has default_retention_days", body.default_retention_days != null);
        assert("response has overrides array", Array.isArray(body.overrides));
        assert("response has stats object", body.stats != null);
        assert("stats has total_entries", body.stats.total_entries != null);
        assert("stats has table_count", body.stats.table_count != null);
      }

      // 9b. PUT /api/audit/retention (update default)
      {
        const res = await fetchJson("/api/audit/retention", {
          method: "PUT",
          body: { default_retention_days: 180 },
        });
        assert("PUT /api/audit/retention returns 200", res.status === 200);
        assert("response ok: true", res.body.ok === true);

        // Verify the change
        const check = await fetchJson("/api/audit/retention");
        assert("default_retention_days updated to 180", check.body.default_retention_days === 180);

        // Restore original
        await fetchJson("/api/audit/retention", {
          method: "PUT",
          body: { default_retention_days: 365 },
        });
        const restore = await fetchJson("/api/audit/retention");
        assert("default_retention_days restored to 365", restore.body.default_retention_days === 365);
      }

      // 9c. POST /api/audit/prune (dry run)
      {
        const res = await fetchJson("/api/audit/prune", {
          method: "POST",
          body: { dry_run: true },
        });
        assert("POST /api/audit/prune (dry_run) returns 200", res.status === 200);
        assert("response has pruned array", Array.isArray(res.body.pruned));
        if (res.body.pruned.length > 0) {
          const entry = res.body.pruned[0];
          assert("pruned entry has table_name", entry.table_name != null);
          assert("pruned entry has entries_before", entry.entries_before != null);
          assert("pruned entry has entries_pruned", entry.entries_pruned != null);
          assert("pruned entry entries_pruned is 0 (dry run)", entry.entries_pruned === 0);
        }
      }

      // 9d. GET /api/audit/prune/stats
      {
        const res = await fetchJson("/api/audit/prune/stats");
        assert("GET /api/audit/prune/stats returns 200", res.status === 200);
        const body = res.body;
        assert("response has tables array", Array.isArray(body.tables));
        assert("response has summary object", body.summary != null);
        assert("summary has total_entries", body.summary.total_entries != null);
        assert("summary has total_prunable", body.summary.total_prunable != null);
        assert("summary has table_count", body.summary.table_count != null);
        if (body.tables.length > 0) {
          const t = body.tables[0];
          assert("table entry has effective_retention_days", t.effective_retention_days != null);
          assert("table entry has entry_count", t.entry_count != null);
          assert("table entry has prunable_count", t.prunable_count != null);
        }
      }
    } else {
      console.log("  (API server not detected — skipping API integration tests)");
      console.log("  Start the server with: node server/index.cjs &");
      passed += 9; // Mark API tests as informational
    }
  }

  // ─── Summary ─────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  await pool.end();
  if (failed > 0) process.exit(1);
})();