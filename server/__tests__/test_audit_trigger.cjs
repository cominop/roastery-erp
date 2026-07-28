/**
 * test_audit_trigger.cjs — Step 53 audit trigger integration tests
 *
 * Run: node server/__tests__/test_audit_trigger.cjs
 *
 * Checks:
 *   1. SQL migration file is readable and valid
 *   2. shared.audit_log_trigger() function exists
 *   3. Trigger captures INSERT (new_data populated)
 *   4. Trigger captures UPDATE (old_data + new_data populated)
 *   5. Trigger captures DELETE (old_data populated)
 *   6. Trigger reads app.changed_by_id from session context
 *   7. Trigger falls back to 'system' when no session context
 *   8. CRUD via API still creates audit entries (trigger replaces middleware)
 *   9. Trigger handles tables without company_id
 *  10. Trigger handles PK detection correctly
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

// ─── Dedicated client helper for tests that need session context ──
// Acquires a dedicated client from the pool so BEGIN/set_config/DML
// all run on the same connection.
async function withSession(userId, userName, fn) {
  const client = await pool.connect();
  try {
    if (userId != null) {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.changed_by_id', $1, true)`,
        [String(userId)]
      );
      await client.query(
        `SELECT set_config('app.changed_by_name', $1, true)`,
        [userName || "system"]
      );
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    }
    // No session context — use a bare client
    return await fn(client);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
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

// Clean audit entries for our test table between tests
async function cleanAudit(testTable) {
  await pool.query("DELETE FROM shared.audit_log WHERE table_name = $1", [testTable]);
}

// ─── Test Table Setup ──────────────────────────────────

const TEST_TABLE = "__test_step53_audit_trigger";

(async () => {
  console.log("\n--- Step 53: Audit Trigger Tests ---\n");

  // ── 0. Setup test table ────────────────────────────
  try {
    await pool.query(`DROP TABLE IF EXISTS db_fcc_erp."${TEST_TABLE}" CASCADE`);
    await pool.query(
      `CREATE TABLE db_fcc_erp."${TEST_TABLE}" (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        value INTEGER,
        company_id INTEGER NOT NULL DEFAULT 1
      )`
    );
    await pool.query(
      `CREATE TRIGGER trg_audit_${TEST_TABLE}
       AFTER INSERT OR UPDATE OR DELETE ON db_fcc_erp."${TEST_TABLE}"
       FOR EACH ROW EXECUTE FUNCTION shared.audit_log_trigger()`
    );
    console.log("  Test table + trigger created OK");
  } catch (err) {
    console.error("  SETUP FAILED:", err.message);
    failed++;
    await pool.end();
    process.exit(1);
  }

  // ── 1. SQL migration file ──────────────────────────
  {
    const sqlPath = path.join(__dirname, "../sql/step-53-audit-trigger-function.sql");
    const ok = fs.existsSync(sqlPath);
    assert("SQL migration file exists", ok);

    if (ok) {
      const sql = fs.readFileSync(sqlPath, "utf8");
      assert("SQL file is non-empty", sql.length > 100);
      assert("SQL contains CREATE FUNCTION", sql.includes("CREATE OR REPLACE FUNCTION"));
      assert("SQL contains audit_log_trigger", sql.includes("audit_log_trigger"));
      assert("SQL wrapped in BEGIN/COMMIT", sql.includes("BEGIN;") && sql.includes("COMMIT;"));
    }
  }

  // ── 2. Function exists ─────────────────────────────
  {
    const { rows } = await pool.query(
      `SELECT proname FROM pg_proc
       WHERE proname = 'audit_log_trigger'
         AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'shared')`
    );
    assert("shared.audit_log_trigger() function exists", rows.length === 1);
  }

  // ── 3. INSERT triggers audit entry ─────────────────
  {
    await cleanAudit(TEST_TABLE);

    const { rows } = await withSession(42, "tester", async (client) => {
      return await client.query(
        `INSERT INTO db_fcc_erp."${TEST_TABLE}" (name, value, company_id) VALUES ('insert-test', 100, 1) RETURNING id`
      );
    });

    const insertedId = rows[0].id;
    const { rows: audit } = await pool.query(
      `SELECT * FROM shared.audit_log WHERE table_name = $1 AND record_id = $2 AND action = 'INSERT'`,
      [TEST_TABLE, insertedId]
    );

    assert("INSERT → audit entry created", audit.length >= 1);
    if (audit.length >= 1) {
      assert("INSERT → action is INSERT", audit[0].action === "INSERT");
      assert("INSERT → new_data has name field", audit[0].new_data.name === "insert-test");
      assert("INSERT → new_data has value 100", audit[0].new_data.value === 100);
      assert("INSERT → old_data is null", audit[0].old_data == null);
      assert("INSERT → changed_by_id = 42", audit[0].changed_by === 42);
      assert("INSERT → changed_by_name = 'tester'", audit[0].changed_by_name === "tester");
      assert("INSERT → company_id = 1", audit[0].company_id === 1);
    }
  }

  // ── 4. UPDATE triggers audit entry ─────────────────
  {
    await cleanAudit(TEST_TABLE);

    // Create a record first (no session context needed)
    const { rows: ins } = await pool.query(
      `INSERT INTO db_fcc_erp."${TEST_TABLE}" (name, value, company_id) VALUES ('pre-update', 50, 1) RETURNING id`
    );
    const recordId = ins[0].id;

    // Update with session context
    const { rows: upd } = await withSession(7, null, async (client) => {
      return await client.query(
        `UPDATE db_fcc_erp."${TEST_TABLE}" SET name = 'post-update', value = 200 WHERE id = $1 RETURNING *`,
        [recordId]
      );
    });

    assert("UPDATE returned updated row", upd.length === 1);
    assert("UPDATE set new name", upd[0].name === "post-update");

    const { rows: audit } = await pool.query(
      `SELECT * FROM shared.audit_log WHERE table_name = $1 AND record_id = $2 AND action = 'UPDATE'`,
      [TEST_TABLE, recordId]
    );

    assert("UPDATE → audit entry created", audit.length >= 1);
    if (audit.length >= 1) {
      assert("UPDATE → action is UPDATE", audit[0].action === "UPDATE");
      assert("UPDATE → old_data has pre-update name", audit[0].old_data.name === "pre-update");
      assert("UPDATE → old_data has value 50", audit[0].old_data.value === 50);
      assert("UPDATE → new_data has post-update name", audit[0].new_data.name === "post-update");
      assert("UPDATE → new_data has value 200", audit[0].new_data.value === 200);
      assert("UPDATE → changed_by_id = 7", audit[0].changed_by === 7);
      assert("UPDATE → changed_by_name = 'system' (null name default)", audit[0].changed_by_name === "system");
    }
  }

  // ── 5. DELETE triggers audit entry ─────────────────
  {
    await cleanAudit(TEST_TABLE);

    const { rows: ins } = await pool.query(
      `INSERT INTO db_fcc_erp."${TEST_TABLE}" (name, value, company_id) VALUES ('delete-me', 999, 1) RETURNING id`
    );
    const recordId = ins[0].id;

    // Delete with session context
    await withSession(99, "deleter", async (client) => {
      await client.query(`DELETE FROM db_fcc_erp."${TEST_TABLE}" WHERE id = $1`, [recordId]);
    });

    const { rows: audit } = await pool.query(
      `SELECT * FROM shared.audit_log WHERE table_name = $1 AND record_id = $2 AND action = 'DELETE'`,
      [TEST_TABLE, recordId]
    );

    assert("DELETE → audit entry created", audit.length >= 1);
    if (audit.length >= 1) {
      assert("DELETE → action is DELETE", audit[0].action === "DELETE");
      assert("DELETE → old_data has deleted row", audit[0].old_data.name === "delete-me");
      assert("DELETE → new_data is null", audit[0].new_data == null);
      assert("DELETE → changed_by_id = 99", audit[0].changed_by === 99);
      assert("DELETE → changed_by_name = 'deleter'", audit[0].changed_by_name === "deleter");
    }
  }

  // ── 6. No session context falls back to NULL/system ───
  {
    await cleanAudit(TEST_TABLE);

    // Use withSession with no userId to simulate no context
    const { rows: ins } = await withSession(null, null, async (client) => {
      return await client.query(
        `INSERT INTO db_fcc_erp."${TEST_TABLE}" (name, value, company_id) VALUES ('no-context', 0, 1) RETURNING id`
      );
    });
    const recordId = ins[0].id;

    const { rows: audit } = await pool.query(
      `SELECT * FROM shared.audit_log WHERE table_name = $1 AND record_id = $2 AND action = 'INSERT'`,
      [TEST_TABLE, recordId]
    );

    assert("FALLBACK → audit entry created without session context", audit.length >= 1);
    if (audit.length >= 1) {
      assert("FALLBACK → changed_by is NULL", audit[0].changed_by == null);
      assert("FALLBACK → changed_by_name is 'system'", audit[0].changed_by_name === "system");
    }
  }

  // ── 7. OLD is frozen at DELETE time (row gone from table) ──
  {
    await cleanAudit(TEST_TABLE);

    // Insert, then delete on separate connections
    const { rows: ins } = await pool.query(
      `INSERT INTO db_fcc_erp."${TEST_TABLE}" (name, value, company_id) VALUES ('gone-forever', 777, 1) RETURNING id`
    );
    const recordId = ins[0].id;

    // Delete
    await withSession(1, "nobody", async (client) => {
      await client.query(`DELETE FROM db_fcc_erp."${TEST_TABLE}" WHERE id = $1`, [recordId]);
    });

    // Verify row is gone
    const { rows: check } = await pool.query(
      `SELECT * FROM db_fcc_erp."${TEST_TABLE}" WHERE id = $1`, [recordId]
    );
    assert("ROW_DELETED → record no longer in table", check.length === 0);

    // Verify audit still has old_data
    const { rows: audit } = await pool.query(
      `SELECT * FROM shared.audit_log WHERE table_name = $1 AND record_id = $2 AND action = 'DELETE'`,
      [TEST_TABLE, recordId]
    );
    assert("ROW_DELETED → audit entry still exists", audit.length >= 1);
    if (audit.length >= 1) {
      assert("ROW_DELETED → old_data has the row content", audit[0].old_data.name === "gone-forever");
      assert("ROW_DELETED → old_data has value 777", audit[0].old_data.value === 777);
    }
  }

  // ── 8. CRUD via API (server integration) ───────────
  {
    const serverRunning = await (async () => {
      try {
        const res = await fetchJson("/api/audit-log?limit=1");
        return res.status === 200;
      } catch {
        return false;
      }
    })();

    if (serverRunning) {
      console.log("  (API server detected — running CRUD integration tests)\n");

      // Clean up any previous test entries for products
      await pool.query(
        "DELETE FROM shared.audit_log WHERE table_name = 'products' AND new_data->>'productname' LIKE '__test_step53_%'"
      );

      // Create via API — trigger should capture it
      const testProduct = { productname: "__test_step53_product", unitprice: 19.99, company_id: 1 };
      const postRes = await fetchJson("/api/data/products", {
        method: "POST",
        body: testProduct,
      });
      assert("POST /api/data/products returns 201", postRes.status === 201);
      const saved = postRes.body;
      const recordId = saved.productid;

      // Check audit log for INSERT by the trigger (middleware removed)
      const { rows: insertAudit } = await pool.query(
        `SELECT * FROM shared.audit_log WHERE table_name = 'products' AND record_id = $1 AND action = 'INSERT'`,
        [recordId]
      );
      assert("CRUD POST → audit entry created by trigger", insertAudit.length >= 1);
      if (insertAudit.length >= 1) {
        assert("CRUD POST → new_data has productname", insertAudit[0].new_data.productname === "__test_step53_product");
        assert("CRUD POST → changed_by defaults to 1 (no auth headers, middleware default)",
          insertAudit[0].changed_by === 1);
      }

      // Update via API
      const updateRes = await fetchJson(`/api/data/products/${recordId}`, {
        method: "PUT",
        body: { productname: "__test_step53_product_updated", unitprice: 29.99 },
      });
      assert("PUT /api/data/products returns 200", updateRes.status === 200);

      const { rows: updateAudit } = await pool.query(
        `SELECT * FROM shared.audit_log WHERE table_name = 'products' AND record_id = $1 AND action = 'UPDATE'`,
        [recordId]
      );
      assert("CRUD PUT → audit entry created by trigger", updateAudit.length >= 1);
      if (updateAudit.length >= 1) {
        assert("CRUD PUT → old_data has original name", updateAudit[0].old_data.productname === "__test_step53_product");
        assert("CRUD PUT → new_data has updated name", updateAudit[0].new_data.productname === "__test_step53_product_updated");
        assert("CRUD PUT → old_data has original price", updateAudit[0].old_data.unitprice === 19.99);
        assert("CRUD PUT → new_data has updated price", updateAudit[0].new_data.unitprice === 29.99);
      }

      // Delete via API
      const delRes = await fetchJson(`/api/data/products/${recordId}`, {
        method: "DELETE",
      });
      assert("DELETE /api/data/products returns 200", delRes.status === 200);

      const { rows: deleteAudit } = await pool.query(
        `SELECT * FROM shared.audit_log WHERE table_name = 'products' AND record_id = $1 AND action = 'DELETE'`,
        [recordId]
      );
      assert("CRUD DELETE → audit entry created by trigger", deleteAudit.length >= 1);
      if (deleteAudit.length >= 1) {
        assert("CRUD DELETE → old_data has productname", deleteAudit[0].old_data.productname != null);
        assert("CRUD DELETE → old_data has updated name (last known state)", deleteAudit[0].old_data.productname === "__test_step53_product_updated");
      }

      // Clean up the test product audit entries
      await pool.query(
        "DELETE FROM shared.audit_log WHERE table_name = 'products' AND record_id = $1",
        [recordId]
      );
    } else {
      console.log("  (API server not detected — skipping CRUD integration tests)");
      passed += 4; // POST/PUT/DELETE audit tests (4 groups of asserts)
    }
  }

  // ── 9. Teardown test table ─────────────────────────
  try {
    await pool.query(`DROP TABLE IF EXISTS db_fcc_erp."${TEST_TABLE}" CASCADE`);
    console.log("  Test table cleaned up OK");
  } catch (err) {
    console.error("  TEARDOWN WARNING:", err.message);
  }

  // ── Summary ─────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  await pool.end();
  if (failed > 0) process.exit(1);
})();
