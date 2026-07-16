/**
 * Roastery UI — Express API Server
 * Serves form definitions from shared.objects and CRUD on db_fcc_erp tables
 *
 * Routes:
 *   GET  /api/companies             — list tenants
 *   GET  /api/forms                 — list available forms
 *   GET  /api/forms/:name           — form definition JSON
 *   GET  /api/data/:table           — paginated records
 *   GET  /api/data/:table/:id       — single record
 *   POST /api/data/:table           — insert record
 *   PUT  /api/data/:table/:id       — update record
 *   DELETE /api/data/:table/:id     — delete record
 *   POST /api/lookup                — run row-source SQL
 *   GET  /api/schema/:table         — column metadata
 */

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Database ─────────────────────────────────────────

const pool = new Pool({
  database: "polyaccess",
  // defaults to local socket — override with env vars for production
});

// ─── Middleware ───────────────────────────────────────

app.use(cors());
app.use(express.json());

// ─── Companies ────────────────────────────────────────

app.get("/api/companies", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, slug FROM public.companies WHERE is_active = true ORDER BY id"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Navigation (grouped: tables, forms, reports) ──────

app.get("/api/nav", async (_req, res) => {
  try {
    // Tables — from db_fcc_erp schema, sorted by name
    const { rows: tables } = await pool.query(
      `SELECT tablename as name, tablename as label
       FROM pg_tables 
       WHERE schemaname = 'db_fcc_erp' 
         AND LEFT(tablename, 1) != '_'
       ORDER BY tablename`
    );

    // Forms — from shared.objects, deduplicated
    const { rows: forms } = await pool.query(
      `SELECT DISTINCT ON (name) name, 
              COALESCE(NULLIF(definition->>'caption', ''), name) as label
       FROM shared.objects 
       WHERE type = 'form' AND definition IS NOT NULL
         AND (hidden IS NULL OR hidden = false)
       ORDER BY name, id DESC`
    );

    // Reports — from shared.objects, deduplicated
    const { rows: reports } = await pool.query(
      `SELECT DISTINCT ON (name) name,
              COALESCE(NULLIF(definition->>'caption', ''), name) as label
       FROM shared.objects 
       WHERE type = 'report' AND definition IS NOT NULL
         AND (hidden IS NULL OR hidden = false)
       ORDER BY name, id DESC`
    );

    res.json({ tables, forms, reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Forms ────────────────────────────────────────────

app.get("/api/forms", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (name) name, 
              definition->>'caption' as caption
       FROM shared.objects 
       WHERE type = 'form' 
         AND definition IS NOT NULL
         AND (hidden IS NULL OR hidden = false)
       ORDER BY name, id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/forms/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { rows } = await pool.query(
      `SELECT definition FROM shared.objects 
       WHERE type = 'form' AND name ILIKE $1 AND definition IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
      [name]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Form not found" });
    }
    // definition is already JSONB — return as-is
    res.json(rows[0].definition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Data CRUD ────────────────────────────────────────

// Get all registered tables in db_fcc_erp
const VALID_TABLES = new Set();

async function loadValidTables() {
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'db_fcc_erp'`
  );
  rows.forEach((r) => VALID_TABLES.add(r.tablename));
}
loadValidTables();

function validateTable(table, res) {
  if (!VALID_TABLES.has(table)) {
    res.status(400).json({ error: `Unknown table: ${table}` });
    return false;
  }
  return true;
}

// Helper: get primary key column for a table
async function getPkColumn(table) {
  const { rows } = await pool.query(
    `SELECT a.attname
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = 'db_fcc_erp.${table}'::regclass
       AND i.indisprimary
     LIMIT 1`
  );
  return rows[0]?.attname || "id";
}

// GET /api/data/:table — paginated records
app.get("/api/data/:table", async (req, res) => {
  const { table } = req.params;
  if (!validateTable(table, res)) return;

  // Translate Access SQL filter syntax to PostgreSQL
  // Examples:
  //   [Orders by Customer].[CompanyName] Like "*Hunt*" → companyname ILIKE '%Hunt%'
  //   [Customers.Active ] = True → active = true
  //   [Customers.Active ] = False → active = false
  function translateAccessFilter(filter) {
    if (!filter || typeof filter !== "string") return filter;
    let sql = filter;
    // Strip JSON backslash-escaped quotes: " → "
    sql = sql.replace(/\\"/g, '"');
    // Strip Access form references: [FormName].[Field] → field (lowercased)
    sql = sql.replace(/\[[^\]]*\]\.\[([^\]]*)\]/g, (_, field) => field.trim().replace(/\s+/g, "_").toLowerCase());
    sql = sql.replace(/\[([^\]]*)\]/g, (_, field) => field.trim().replace(/\s+/g, "_").toLowerCase());
    // Convert Access LIKE "*x*" → ILIKE '%x%'
    sql = sql.replace(/Like\s+"?\*(.+?)\*\*?"?/gi, "ILIKE '%$1%'");
    sql = sql.replace(/Like\s+"?\*(.+?)"\*/gi, "ILIKE '%$1%'");
    sql = sql.replace(/Like\s+"?(.+?)"?\*/gi, "ILIKE '$1%'");
    // Convert = True / = False (Access)
    sql = sql.replace(/=\s*True/gi, "= true");
    sql = sql.replace(/=\s*False/gi, "= false");
    // Convert Access OR/AND to PostgreSQL
    sql = sql.replace(/\bOR\b/gi, "OR");
    sql = sql.replace(/\bAND\b/gi, "AND");
    return sql;
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1;
    const rawFilter = req.query.filter || null;
    const filter = rawFilter ? translateAccessFilter(rawFilter) : null;
    const orderBy = req.query.orderBy || null;
    const companyId = req.query.company_id || 1;
    const offset = (page - 1) * limit;

    let where = `WHERE company_id = ${companyId}`;
    if (filter) where += ` AND (${filter})`;

    let order = "";
    if (orderBy) {
      // Split into column and direction (e.g., "orderdate DESC")
      const parts = orderBy.split(" ");
      const column = parts[0];
      const direction = parts[1] ? parts[1].toUpperCase() : "ASC";
      order = `ORDER BY "${column}" ${["ASC", "DESC"].includes(direction) ? direction : "ASC"}`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM db_fcc_erp."${table}" ${where}`
    );
    const total = parseInt(countResult.rows[0].count);

    const { rows } = await pool.query(
      `SELECT * FROM db_fcc_erp."${table}" ${where} ${order} LIMIT ${limit} OFFSET ${offset}`
    );

    res.json({ rows, total, page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/:table/:id — single record
app.get("/api/data/:table/:id", async (req, res) => {
  const { table, id } = req.params;
  if (!validateTable(table, res)) return;

  try {
    const pk = await getPkColumn(table);
    const { rows } = await pool.query(
      `SELECT * FROM db_fcc_erp."${table}" WHERE "${pk}" = $1 AND company_id = 1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data/:table
app.post("/api/data/:table", async (req, res) => {
  const { table } = req.params;
  if (!validateTable(table, res)) return;

  try {
    const data = { ...req.body, company_id: 1 };
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const { rows } = await pool.query(
      `INSERT INTO db_fcc_erp."${table}" (${columns.map((c) => `"${c}"`).join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING *`,
      values
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/data/:table/:id
app.put("/api/data/:table/:id", async (req, res) => {
  const { table, id } = req.params;
  if (!validateTable(table, res)) return;

  try {
    const pk = await getPkColumn(table);
    const data = req.body;
    const columns = Object.keys(data);
    const sets = columns.map((c, i) => `"${c}" = $${i + 1}`);
    const values = [...Object.values(data), id];

    const { rows } = await pool.query(
      `UPDATE db_fcc_erp."${table}" 
       SET ${sets.join(", ")} 
       WHERE "${pk}" = $${values.length} AND company_id = 1
       RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/data/:table/:id
app.delete("/api/data/:table/:id", async (req, res) => {
  const { table, id } = req.params;
  if (!validateTable(table, res)) return;

  try {
    const pk = await getPkColumn(table);
    await pool.query(
      `DELETE FROM db_fcc_erp."${table}" WHERE "${pk}" = $1 AND company_id = 1`,
      [id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Lookups (combo-box row sources) ──────────────────

app.post("/api/lookup", async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || typeof sql !== "string") {
      return res.status(400).json({ error: "sql required" });
    }
    // Safety: only allow SELECT
    if (!sql.trim().toUpperCase().startsWith("SELECT")) {
      return res.status(400).json({ error: "Only SELECT allowed" });
    }

    const { rows, fields } = await pool.query(sql);
    res.json({
      rows,
      fields: fields.map((f) => f.name),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Table Schema ─────────────────────────────────────

app.get("/api/schema/:table", async (req, res) => {
  const { table } = req.params;
  if (!validateTable(table, res)) return;

  try {
    const { rows } = await pool.query(
      `SELECT column_name as name, data_type as type, 
              is_nullable = 'YES' as nullable
       FROM information_schema.columns 
       WHERE table_schema = 'db_fcc_erp' 
         AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Roastery API running on http://localhost:${PORT}`);
});