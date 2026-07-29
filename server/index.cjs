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
 *   GET  /api/nav/tree             — navigation tree (hierarchical, flat ordered list)
 *   GET  /api/nav/tree/:id         — single nav tree node
 *   POST /api/nav/tree             — create nav tree node
 *   PUT  /api/nav/tree/reorder     — batch reorder siblings
 *   PUT  /api/nav/tree/:id         — update nav tree node
 *   DELETE /api/nav/tree/:id       — delete nav tree node (cascade children)
 *   GET  /api/audit-log            — list audit log entries (filtered, paginated)
 *   GET  /api/audit-log/:id         — single audit log entry
 */

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const { filtersToWhereClause, validateFilter } = require("./filters-to-where.cjs");
const { permissionGuard, parseTableNamesFromSql, permCache } = require("./permission-middleware.cjs");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Database ─────────────────────────────────────────

const pool = new Pool({
  database: "polyaccess",
  // defaults to local socket — override with env vars for production
});

// ─── Audit-aware query helper ──────────────────────────
// Wraps a write query with session context so the DB trigger
// captures who made the change. Uses a dedicated client from
// the pool so SET LOCAL and the DML execute on the same connection.
async function queryWithAudit(sql, params, user) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (user && user.userId) {
      await client.query(
        `SELECT set_config('app.changed_by_id', $1, true)`,
        [String(user.userId)]
      );
      if (user.isAdmin) {
        await client.query(
          `SELECT set_config('app.changed_by_name', $1, true)`,
          ["admin"]
        );
      }
    } else {
      await client.query(
        `SELECT set_config('app.changed_by_name', $1, true)`,
        ["system"]
      );
    }
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

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

// ─── Navigation Tree (nav_tree table) ───────────────────

/**
 * GET /api/nav/tree — return the full navigation tree
 *
 * Returns a flat ordered list with depth and path arrays
 * for client-side hierarchy reconstruction.
 *
 * Role-based visibility: if the user has roles, only nodes
 * whose role_visibility is NULL/empty or overlaps with the
 * user's roles are returned.
 *
 * Query params:
 *   ?visible_only=true  — filter to visible nodes only (default: true)
 *   ?company_id=1       — company scope (default: 1)
 */
app.get("/api/nav/tree", async (req, res) => {
  try {
    const visibleOnly = req.query.visible_only !== "false";
    const companyId = parseInt(req.query.company_id || "1", 10);

    // Look up user's roles for role-based visibility filtering
    const { extractUser, getUserRoleIds } = require("./permission-middleware.cjs");
    const { userId } = extractUser(req);
    const { roleNames } = await getUserRoleIds(userId, companyId);

    const { rows } = await pool.query(
      `SELECT * FROM shared.fn_nav_tree($1, $2, $3)`,
      [companyId, visibleOnly, roleNames.length > 0 ? roleNames : null]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/nav/tree/:id — get a single nav tree node
 */
app.get("/api/nav/tree/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM shared.nav_tree WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Nav tree node not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/nav/tree — create a nav tree node
 *
 * Body: { parent_id?, label, icon?, target_type, target_name?,
 *         target_params?, sort_order?, is_visible?, is_expanded?,
 *         color?, badge? }
 */
app.post("/api/nav/tree", async (req, res) => {
  try {
    const {
      parent_id, label, icon, target_type, target_name,
      target_params, sort_order, is_visible, is_expanded,
      color, badge,
    } = req.body;

    if (!label || typeof label !== "string" || !label.trim()) {
      return res.status(400).json({ error: "label is required" });
    }

    // Validate target_type
    const validTypes = ["group", "table", "form", "report", "link", "divider"];
    const resolvedType = target_type || "group";
    if (!validTypes.includes(resolvedType)) {
      return res.status(400).json({
        error: `Invalid target_type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Auto-compute sort_order: append to end of siblings
    let resolvedSort = sort_order;
    if (resolvedSort === undefined || resolvedSort === null) {
      const { rows: lastSibling } = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_sort
         FROM shared.nav_tree
         WHERE parent_id IS NOT DISTINCT FROM $1 AND company_id = 1`,
        [parent_id || null]
      );
      resolvedSort = lastSibling[0].next_sort;
    }

    const { rows } = await pool.query(
      `INSERT INTO shared.nav_tree
       (parent_id, label, icon, target_type, target_name, target_params,
        sort_order, is_visible, is_expanded, color, badge, company_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)
       RETURNING *`,
      [
        parent_id || null,
        label.trim(),
        icon || null,
        resolvedType,
        target_name || null,
        target_params ? JSON.stringify(target_params) : null,
        resolvedSort,
        is_visible !== undefined ? is_visible : true,
        is_expanded !== undefined ? is_expanded : true,
        color || null,
        badge || null,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/nav/tree/reorder — batch reorder siblings
 *
 * Body: { siblings: [{ id: number, sort_order: number }] }
 *
 * NOTE: Must be defined BEFORE the :id parameterized routes so Express
 * matches the literal "reorder" path before treating it as a parameter.
 */
app.put("/api/nav/tree/reorder", async (req, res) => {
  try {
    const { siblings } = req.body;

    if (!Array.isArray(siblings) || siblings.length === 0) {
      return res.status(400).json({ error: "siblings array is required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const sib of siblings) {
        if (sib.id == null || sib.sort_order === undefined) continue;
        await client.query(
          `UPDATE shared.nav_tree SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
          [sib.sort_order, sib.id]
        );
      }

      await client.query("COMMIT");
      res.json({ ok: true, count: siblings.length });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/nav/tree/:id — update a nav tree node (partial)
 */
app.put("/api/nav/tree/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [
      "parent_id", "label", "icon", "target_type", "target_name",
      "target_params", "sort_order", "is_visible", "is_expanded",
      "color", "badge",
    ];

    const sets = [];
    const params = [];
    let idx = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        let val = req.body[field];
        if (field === "target_params" && val !== null && typeof val === "object") {
          val = JSON.stringify(val);
        }
        sets.push(`${field} = $${idx++}`);
        params.push(val);
      }
    }

    // Validate target_type if changing
    if (req.body.target_type !== undefined) {
      const validTypes = ["group", "table", "form", "report", "link", "divider"];
      if (!validTypes.includes(req.body.target_type)) {
        return res.status(400).json({
          error: `Invalid target_type. Must be one of: ${validTypes.join(", ")}`,
        });
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    sets.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE shared.nav_tree SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Nav tree node not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/nav/tree/:id — delete a nav tree node (cascade deletes children)
 */
app.delete("/api/nav/tree/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(
      `DELETE FROM shared.nav_tree WHERE id = $1`,
      [id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Nav tree node not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Forms ────────────────────────────────────────────

app.get("/api/forms", permissionGuard(() => "shared.objects"), async (_req, res) => {
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
app.get("/api/data/:table", permissionGuard((req) => req.params.table), async (req, res) => {
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
    // Strip JSON backslash-escaped quotes: \" → "
    sql = sql.replace(/\\"/g, '"');
    // Strip Access form references: [FormName].[Field] → field (lowercased)
    sql = sql.replace(/\[[^\]]*\]\.\[([^\]]*)\]/g, (_, field) => field.trim().replace(/\s+/g, "_").toLowerCase());
    sql = sql.replace(/\[([^\]]*)\]/g, (_, field) => field.trim().replace(/\s+/g, "_").toLowerCase());
    // Convert Access LIKE "*x*" → ILIKE '%x%'
    sql = sql.replace(/Like\s+\"?\*(.+?)\*\*?\"/gi, "ILIKE '%$1%'");
    sql = sql.replace(/Like\s+\"?\*(.+?)\"\*/gi, "ILIKE '%$1%'");
    sql = sql.replace(/Like\s+\"?(.+?)\"?\*/gi, "ILIKE '$1%'");
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
    const orderBy = req.query.orderBy || null;
    const companyId = req.query.company_id || 1;
    const offset = (page - 1) * limit;

    // ─── Build WHERE clause ──────────────────────────────
    // Two modes:
    //   1. `filters` query param — structured JSON array (preferred)
    //   2. `filter` query param — raw SQL string (backward compat)

    let whereClause = "";
    const queryParams = [];

    // Check for structured filters first
    const rawFilters = req.query.filters;
    if (rawFilters && typeof rawFilters === "string") {
      try {
        const parsed = JSON.parse(rawFilters);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Validate each filter
          const valid = parsed.filter((f) => {
            const err = validateFilter(f);
            if (err) {
              console.warn(`Skipping invalid filter: ${err}`, JSON.stringify(f));
            }
            return !err;
          });
          if (valid.length > 0) {
            const result = filtersToWhereClause(valid);
            if (result.whereClause) {
              whereClause = result.whereClause;
              queryParams.push(...result.params);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to parse structured filters JSON:", e.message);
      }
    }

    // Fall back to raw filter string if no structured filters were provided
    if (!whereClause) {
      const rawFilter = req.query.filter || null;
      const filter = rawFilter ? translateAccessFilter(rawFilter) : null;
      if (filter) {
        whereClause = `(${filter})`;
      }
    }

    // Build the final WHERE clause
    let where = `WHERE company_id = ${companyId}`;
    if (whereClause) where += ` AND ${whereClause}`;

    // ─── Row-level filter ────────────────────────────────
    // Apply per-role row filters for non-admin users
    if (req.user && !req.user.isAdmin && req.user.roleIds && req.user.roleIds.length > 0) {
      const rowFilterSql = await applyRowFilter(table, req.user.roleIds, req.user.companyId);
      if (rowFilterSql) {
        where += ` AND (${rowFilterSql})`;
      }
    }

    // ─── Order clause ─────────────────────────────────
    let order = "";
    if (orderBy) {
      // Split into column and direction (e.g., "orderdate DESC")
      const parts = orderBy.split(" ");
      const column = parts[0];
      const direction = parts[1] ? parts[1].toUpperCase() : "ASC";
      order = `ORDER BY "${column}" ${["ASC", "DESC"].includes(direction) ? direction : "ASC"}`;
    }

    // ─── Execute queries ──────────────────────────────
    let countResult, rows;

    if (queryParams.length > 0) {
      // Parameterized query for structured filters
      countResult = await pool.query(
        `SELECT COUNT(*) FROM db_fcc_erp."${table}" ${where}`,
        queryParams
      );
      rows = (await pool.query(
        `SELECT * FROM db_fcc_erp."${table}" ${where} ${order} LIMIT ${limit} OFFSET ${offset}`,
        queryParams
      )).rows;
    } else {
      // Non-parameterized query (backward compat)
      countResult = await pool.query(
        `SELECT COUNT(*) FROM db_fcc_erp."${table}" ${where}`
      );
      rows = (await pool.query(
        `SELECT * FROM db_fcc_erp."${table}" ${where} ${order} LIMIT ${limit} OFFSET ${offset}`
      )).rows;
    }

    const total = parseInt(countResult.rows[0].count);

    res.json({ rows, total, page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/:table/:id — single record
app.get("/api/data/:table/:id", permissionGuard((req) => req.params.table), async (req, res) => {
  const { table, id } = req.params;
  if (!validateTable(table, res)) return;

  try {
    const pk = await getPkColumn(table);
    let whereCondition = `"${pk}" = $1 AND company_id = 1`;

    // Apply row-level filter for non-admin users
    if (req.user && !req.user.isAdmin && req.user.roleIds && req.user.roleIds.length > 0) {
      const rowFilterSql = await applyRowFilter(table, req.user.roleIds, req.user.companyId);
      if (rowFilterSql) {
        whereCondition += ` AND (${rowFilterSql})`;
      }
    }

    const { rows } = await pool.query(
      `SELECT * FROM db_fcc_erp."${table}" WHERE ${whereCondition}`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data/:table
app.post("/api/data/:table", permissionGuard((req) => req.params.table), async (req, res) => {
  const { table } = req.params;
  if (!validateTable(table, res)) return;

  try {
    const data = { ...req.body, company_id: 1 };
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const { rows } = await queryWithAudit(
      `INSERT INTO db_fcc_erp."${table}" (${columns.map((c) => `"${c}"`).join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING *`,
      values,
      req.user
    );
    const saved = rows[0];

    // Auto-compute stored calculated fields after insert (fire-and-forget)
    try {
      const pkCol = await getPkColumn(table);
      const recordId = saved[pkCol];
      if (recordId != null) {
        const { rows: storedDefs } = await pool.query(
          'SELECT id FROM shared.calculated_fields WHERE table_name = $1 AND calc_type = $$stored$$ AND visible = true LIMIT 1',
          [table]
        );
        if (storedDefs.length > 0) {
          const triggerUrl = `http://localhost:${PORT}/api/calculated-fields/compute-stored`;
          fetch(triggerUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table_name: table, record_id: recordId }),
          }).catch(() => {});
        }
      }
    } catch {
      // Stored calc computation is best-effort; don't fail the save
    }

    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/data/:table/:id
app.put("/api/data/:table/:id", permissionGuard((req) => req.params.table), async (req, res) => {
  const { table, id } = req.params;
  if (!validateTable(table, res)) return;

  try {
    const pk = await getPkColumn(table);
    const data = req.body;
    const columns = Object.keys(data);
    const sets = columns.map((c, i) => `"${c}" = $${i + 1}`);
    const values = [...Object.values(data), id];

    const { rows } = await queryWithAudit(
      `UPDATE db_fcc_erp."${table}" 
       SET ${sets.join(", ")} 
       WHERE "${pk}" = $${values.length} AND company_id = 1
       RETURNING *`,
      values,
      req.user
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    const saved = rows[0];

    // Auto-compute stored calculated fields after update (fire-and-forget)
    try {
      const recordId = saved[pk] || saved.id;
      if (recordId != null) {
        const { rows: storedDefs } = await pool.query(
          'SELECT id FROM shared.calculated_fields WHERE table_name = $1 AND calc_type = $$stored$$ AND visible = true LIMIT 1',
          [table]
        );
        if (storedDefs.length > 0) {
          const triggerUrl = `http://localhost:${PORT}/api/calculated-fields/compute-stored`;
          fetch(triggerUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table_name: table, record_id: recordId }),
          }).catch(() => {});
        }
      }
    } catch {
      // Stored calc computation is best-effort; don't fail the save
    }

    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/data/:table/:id
app.delete("/api/data/:table/:id", permissionGuard((req) => req.params.table), async (req, res) => {
  const { table, id } = req.params;
  if (!validateTable(table, res)) return;

  try {
    const pk = await getPkColumn(table);

    await queryWithAudit(
      `DELETE FROM db_fcc_erp."${table}" WHERE "${pk}" = $1 AND company_id = 1`,
      [id],
      req.user
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Lookups (combo-box row sources) ──────────────────

app.post("/api/lookup", permissionGuard((req) => {
  const sql = req.body?.sql;
  if (!sql) return [];
  return parseTableNamesFromSql(sql);
}, { POST: "select" }), async (req, res) => {
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

app.get("/api/schema/:table", permissionGuard((req) => req.params.table), async (req, res) => {
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

// ─── Settings ──────────────────────────────────────────

// GET /api/settings/appearance — load saved appearance settings
app.get("/api/settings/appearance", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT definition FROM shared.objects WHERE type = 'appearance' LIMIT 1`
    );
    if (rows.length === 0) return res.json({});
    res.json(rows[0].definition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/appearance — save appearance settings
app.put("/api/settings/appearance", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM shared.objects WHERE type = 'appearance' LIMIT 1`
    );
    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO shared.objects (type, name, definition, database_id, version, is_current, hidden)
         VALUES ('appearance', 'appearance', $1, 'fcc_erp', 1, true, false)`,
        [JSON.stringify(req.body)]
      );
    } else {
      await pool.query(
        `UPDATE shared.objects SET definition = $1 WHERE id = $2`,
        [JSON.stringify(req.body), rows[0].id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Form Size Persistence ───────────────────────────

// GET /api/settings/form-size/:name
app.get("/api/settings/form-size/:name", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT definition FROM shared.objects WHERE type = 'form-size' AND name = $1 LIMIT 1`,
      [req.params.name]
    );
    if (rows.length === 0) return res.json({});
    res.json(rows[0].definition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/form-size/:name
app.put("/api/settings/form-size/:name", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM shared.objects WHERE type = 'form-size' AND name = $1 LIMIT 1`,
      [req.params.name]
    );
    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO shared.objects (type, name, definition, database_id, version, is_current, hidden)
         VALUES ('form-size', $1, $2, 'fcc_erp', 1, true, false)`,
        [req.params.name, JSON.stringify(req.body)]
      );
    } else {
      await pool.query(
        `UPDATE shared.objects SET definition = $1 WHERE id = $2`,
        [JSON.stringify(req.body), rows[0].id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Field permissions ────────────────────────────────────

/**
 * GET /api/permissions/fields/:table — return field-level permissions
 * (hidden/readonly) for the current user's roles on the given table.
 *
 * Returns a map: { fieldName: { hidden: boolean, readonly: boolean } }
 *   - hidden   = true when no role grants can_read on the field
 *   - readonly = true when can_read is granted but can_write is not
 *   - Admin bypass: always returns empty object (all fields visible/writable)
 *   - Fields with no explicit permission entries are NOT returned (implicitly
 *     visible and writable from the caller's perspective).
 */
app.get("/api/permissions/fields/:table", async (req, res) => {
  try {
    const { table } = req.params;
    const { extractUser, getUserRoleIds } = require("./permission-middleware.cjs");
    const { userId, companyId } = extractUser(req);
    const { roleIds, isAdmin } = await getUserRoleIds(userId, companyId);

    // Admin bypass — no field restrictions
    if (isAdmin) {
      return res.json({});
    }

    if (!roleIds || roleIds.length === 0) {
      return res.json({});
    }

    const { rows } = await pool.query(
      `SELECT field_name,
              bool_or(can_read)  AS can_read,
              bool_or(can_write) AS can_write
       FROM shared.field_permissions
       WHERE role_id = ANY($1::int[])
         AND table_name = $2
         AND company_id = $3
       GROUP BY field_name`,
      [roleIds, table, companyId]
    );

    const result = {};
    for (const row of rows) {
      const canRead = !!row.can_read;
      const canWrite = !!row.can_write;
      result[row.field_name] = {
        hidden: !canRead,
        readonly: canRead && !canWrite,
      };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Permissions API ────────────────────────────────────

/**
 * GET /api/permissions/user — return current user identity and roles.
 * Reads X-User-Id / X-Company-Id headers, defaults to 1.
 */
app.get("/api/permissions/user", async (req, res) => {
  try {
    const { userId, companyId } = require("./permission-middleware.cjs").extractUser(req);
    const { roleIds, roleNames, isAdmin } = await require("./permission-middleware.cjs").getUserRoleIds(userId, companyId);
    res.json({ userId, companyId, roleIds, roleNames, isAdmin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/permissions/check — check a table permission.
 * Body: { table: string, action?: 'select'|'insert'|'update'|'delete' }
 * If action is provided, returns { permitted: boolean }.
 * If no action, returns { canSelect, canInsert, canUpdate, canDelete }.
 */
app.post("/api/permissions/check", async (req, res) => {
  try {
    const { table, action } = req.body;
    if (!table || typeof table !== "string") {
      return res.status(400).json({ error: "table is required" });
    }

    const { extractUser, getUserRoleIds, checkPermission } = require("./permission-middleware.cjs");
    const { userId, companyId } = extractUser(req);
    const { roleIds, isAdmin } = await getUserRoleIds(userId, companyId);

    // Admin bypass — all permissions granted
    if (isAdmin) {
      if (action) {
        return res.json({ permitted: true });
      }
      return res.json({ canSelect: true, canInsert: true, canUpdate: true, canDelete: true });
    }

    if (roleIds.length === 0) {
      if (action) {
        return res.json({ permitted: false });
      }
      return res.json({ canSelect: false, canInsert: false, canUpdate: false, canDelete: false });
    }

    if (action) {
      const permitted = await checkPermission(table, action, roleIds, companyId);
      return res.json({ permitted });
    }

    // Return all four actions
    const [canSelect, canInsert, canUpdate, canDelete] = await Promise.all([
      checkPermission(table, "select", roleIds, companyId),
      checkPermission(table, "insert", roleIds, companyId),
      checkPermission(table, "update", roleIds, companyId),
      checkPermission(table, "delete", roleIds, companyId),
    ]);
    res.json({ canSelect, canInsert, canUpdate, canDelete });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Role Management API ─────────────────────────────────

/**
 * GET /api/roles — list all roles for company_id=1
 * Returns: [{id, name, caption, is_system, created_at, user_count}]
 */
app.get("/api/roles", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.name, COALESCE(r.description, r.name) AS caption,
              r.is_system, r.created_at,
              COUNT(ur.id)::int AS user_count
       FROM shared.roles r
       LEFT JOIN shared.user_roles ur ON ur.role_id = r.id AND ur.company_id = 1
       WHERE r.company_id = 1
       GROUP BY r.id
       ORDER BY r.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/roles — create a new role
 * Body: {name, caption?, copy_from_role_id?}
 */
app.post("/api/roles", async (req, res) => {
  try {
    const { name, caption, copy_from_role_id } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    // Check uniqueness
    const existing = await pool.query(
      `SELECT id FROM shared.roles WHERE company_id = 1 AND name = $1`,
      [name.trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `Role '${name}' already exists` });
    }

    const description = caption || null;
    const { rows } = await pool.query(
      `INSERT INTO shared.roles (name, description, company_id)
       VALUES ($1, $2, 1)
       RETURNING id, name, COALESCE(description, name) AS caption, is_system, created_at`,
      [name.trim(), description]
    );

    const newRole = rows[0];

    // Clone permissions from another role if requested
    if (copy_from_role_id) {
      const srcId = parseInt(copy_from_role_id, 10);
      if (!isNaN(srcId)) {
        // Clone table_permissions
        await pool.query(
          `INSERT INTO shared.table_permissions (role_id, table_name, company_id, can_select, can_insert, can_update, can_delete)
           SELECT $1, table_name, company_id, can_select, can_insert, can_update, can_delete
           FROM shared.table_permissions
           WHERE role_id = $2 AND company_id = 1`,
          [newRole.id, srcId]
        );
        // Clone field_permissions
        await pool.query(
          `INSERT INTO shared.field_permissions (role_id, table_name, field_name, company_id, can_read, can_write)
           SELECT $1, table_name, field_name, company_id, can_read, can_write
           FROM shared.field_permissions
           WHERE role_id = $2 AND company_id = 1`,
          [newRole.id, srcId]
        );
        // Clone row_filters
        await pool.query(
          `INSERT INTO shared.row_filters (role_id, table_name, company_id, filter_condition, filter_sql, description, enabled)
           SELECT $1, table_name, company_id, filter_condition, filter_sql, description, enabled
           FROM shared.row_filters
           WHERE role_id = $2 AND company_id = 1`,
          [newRole.id, srcId]
        );
      }
    }

    // Re-fetch with user_count for consistency
    const { rows: full } = await pool.query(
      `SELECT r.id, r.name, COALESCE(r.description, r.name) AS caption,
              r.is_system, r.created_at,
              COUNT(ur.id)::int AS user_count
       FROM shared.roles r
       LEFT JOIN shared.user_roles ur ON ur.role_id = r.id AND ur.company_id = 1
       WHERE r.id = $1
       GROUP BY r.id`,
      [newRole.id]
    );

    // Invalidate cache — role creation affects all permission lookups
    permCache.invalidateAll();
    res.status(201).json(full[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/roles/:id — update role caption/name
 * Body: {name?, caption?}
 * is_system roles: only caption can be changed, not name
 */
app.put("/api/roles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, caption } = req.body;

    // Check if role exists and is_system status
    const { rows: existing } = await pool.query(
      `SELECT id, name, is_system FROM shared.roles WHERE id = $1 AND company_id = 1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }

    const role = existing.rows[0];

    // is_system roles: can't change name
    if (role.is_system && name && name !== role.name) {
      return res.status(403).json({ error: "Cannot rename system roles" });
    }

    // Check name uniqueness if name is being changed
    if (name && name !== role.name) {
      const dup = await pool.query(
        `SELECT id FROM shared.roles WHERE company_id = 1 AND name = $1 AND id != $2`,
        [name, id]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: `Role '${name}' already exists` });
      }
    }

    const updates = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      params.push(name);
    }
    if (caption !== undefined) {
      updates.push(`description = $${idx++}`);
      params.push(caption);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE shared.roles SET ${updates.join(", ")} WHERE id = $${idx}
       RETURNING id, name, COALESCE(description, name) AS caption, is_system, created_at`,
      params
    );

    res.json(rows[0]);
    // Invalidate cache — role metadata changed (name/caption affects display)
    permCache.invalidateAll();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/roles/:id — delete a role (cascade)
 * Rejects is_system roles with 403
 */
app.delete("/api/roles/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT id, is_system FROM shared.roles WHERE id = $1 AND company_id = 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }

    if (rows[0].is_system) {
      return res.status(403).json({ error: "Cannot delete system roles" });
    }

    await pool.query(`DELETE FROM shared.roles WHERE id = $1`, [id]);
    // Invalidate cache — role deletion affects all permission lookups
    permCache.invalidateAll();
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/roles/:id/users — list users assigned to a role
 * Returns: [{user_id, employee_name, email, assigned_at}]
 */
app.get("/api/roles/:id/users", async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT ur.user_id,
              COALESCE(e.firstname || ' ' || e.lastname, 'Unknown') AS employee_name,
              COALESCE(e.emailname, '') AS email,
              ur.created_at AS assigned_at
       FROM shared.user_roles ur
       LEFT JOIN db_fcc_erp.employees e ON e.employeeid = ur.user_id
       WHERE ur.role_id = $1 AND ur.company_id = 1
       ORDER BY e.firstname, e.lastname`,
      [id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/roles/:id/users — assign users to a role (upsert)
 * Body: {user_ids: [uuid, ...]}
 * Adds new assignments, removes any not in the list
 */
app.post("/api/roles/:id/users", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_ids } = req.body;

    if (!Array.isArray(user_ids)) {
      return res.status(400).json({ error: "user_ids array required" });
    }

    // Verify role exists
    const { rows: roleRows } = await pool.query(
      `SELECT id FROM shared.roles WHERE id = $1 AND company_id = 1`,
      [id]
    );
    if (roleRows.rows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }

    // Get current assignments
    const { rows: current } = await pool.query(
      `SELECT user_id FROM shared.user_roles WHERE role_id = $1 AND company_id = 1`,
      [id]
    );
    const currentIds = new Set(current.map((r) => r.user_id));
    const newIds = new Set(user_ids.map((uid) => parseInt(uid, 10)).filter((n) => !isNaN(n)));

    // Remove assignments not in new set
    const toRemove = [...currentIds].filter((uid) => !newIds.has(uid));
    for (const uid of toRemove) {
      await pool.query(
        `DELETE FROM shared.user_roles WHERE role_id = $1 AND user_id = $2 AND company_id = 1`,
        [id, uid]
      );
    }

    // Add new assignments
    const toAdd = [...newIds].filter((uid) => !currentIds.has(uid));
    for (const uid of toAdd) {
      await pool.query(
        `INSERT INTO shared.user_roles (user_id, role_id, company_id) VALUES ($1, $2, 1)
         ON CONFLICT (user_id, role_id, company_id) DO NOTHING`,
        [uid, id]
      );
    }

    // Return updated list
    const { rows: updated } = await pool.query(
      `SELECT ur.user_id,
              COALESCE(e.firstname || ' ' || e.lastname, 'Unknown') AS employee_name,
              COALESCE(e.emailname, '') AS email,
              ur.created_at AS assigned_at
       FROM shared.user_roles ur
       LEFT JOIN db_fcc_erp.employees e ON e.employeeid = ur.user_id
       WHERE ur.role_id = $1 AND ur.company_id = 1
       ORDER BY e.firstname, e.lastname`,
      [id]
    );

    // Invalidate cache — user-role assignments changed
    permCache.invalidateAll();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Permission Matrix ────────────────────────────────

/**
 * GET /api/permissions/matrix — return the full permission matrix.
 * Returns:
 *   {
 *     roles:    [{id, name, caption, is_system}],
 *     tables:   [{name, label, fields: [{name, type}]}],
 *     permissions: [{role_id, table_name, field_name, can_read, can_write}]
 *   }
 */
app.get("/api/permissions/matrix", async (_req, res) => {
  try {
    // 1. Roles (company_id=1, active)
    const { rows: roles } = await pool.query(
      `SELECT id, name, COALESCE(description, name) AS caption, is_system
       FROM shared.roles
       WHERE company_id = 1 AND is_active = true
       ORDER BY name`
    );

    // 2. Tables + columns from information_schema
    const { rows: tablesRaw } = await pool.query(
      `SELECT t.tablename AS name,
              t.tablename AS label
       FROM pg_tables t
       WHERE t.schemaname = 'db_fcc_erp'
         AND LEFT(t.tablename, 1) != '_'
       ORDER BY t.tablename`
    );

    const tables = [];
    for (const t of tablesRaw) {
      const { rows: fields } = await pool.query(
        `SELECT column_name AS name, data_type AS type
         FROM information_schema.columns
         WHERE table_schema = 'db_fcc_erp' AND table_name = $1
         ORDER BY ordinal_position`,
        [t.name]
      );
      tables.push({ name: t.name, label: t.label, fields });
    }

    // 3. All field_permissions for company_id=1
    const { rows: permissions } = await pool.query(
      `SELECT role_id, table_name, field_name, can_read, can_write
       FROM shared.field_permissions
       WHERE company_id = 1
       ORDER BY role_id, table_name, field_name`
    );

    res.json({ roles, tables, permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/permissions/matrix — batch upsert field permissions.
 * Body: { entries: [{role_id, table_name, field_name, can_read, can_write}] }
 * Uses ON CONFLICT upsert.
 */
app.post("/api/permissions/matrix", async (req, res) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "entries array is required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const entry of entries) {
        const { role_id, table_name, field_name, can_read, can_write } = entry;
        if (!role_id || !table_name || !field_name) {
          continue; // Skip invalid entries
        }
        await client.query(
          `INSERT INTO shared.field_permissions (role_id, table_name, field_name, company_id, can_read, can_write)
           VALUES ($1, $2, $3, 1, $4, $5)
           ON CONFLICT (role_id, table_name, field_name, company_id)
           DO UPDATE SET can_read = EXCLUDED.can_read,
                         can_write = EXCLUDED.can_write,
                         updated_at = NOW()`,
          [role_id, table_name, field_name, !!can_read, !!can_write]
        );
      }

      await client.query("COMMIT");
      // Invalidate permission cache — field-level permissions changed
      permCache.invalidateAll();
      res.json({ ok: true, count: entries.length });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Row Filter CRUD API ─────────────────────────────────

/**
 * GET /api/permissions/row-filters/:table — list row filters for a table.
 * Returns an array of row filter objects.
 */
app.get("/api/permissions/row-filters/:table", async (req, res) => {
  try {
    const { table } = req.params;
    const { rows } = await pool.query(
      `SELECT rf.id, rf.role_id, rf.table_name, rf.filter_condition,
              rf.filter_sql, rf.description, rf.enabled, rf.created_at, rf.updated_at,
              COALESCE(r.description, r.name) AS role_name
       FROM shared.row_filters rf
       LEFT JOIN shared.roles r ON r.id = rf.role_id
       WHERE rf.table_name = $1 AND rf.company_id = 1
       ORDER BY rf.role_id, rf.id`,
      [table]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/permissions/row-filters — create or update a row filter.
 * Body: { role_id, table_name, filter_condition, filter_sql?, description?, enabled? }
 * If an id is provided, updates the existing filter.
 * filter_condition is JSONB (structured filter expression).
 * filter_sql is optional; if omitted, it is auto-generated from filter_condition.
 */
app.post("/api/permissions/row-filters", async (req, res) => {
  try {
    const { id, role_id, table_name, filter_condition, filter_sql, description, enabled } = req.body;

    if (!role_id || !table_name || !filter_condition) {
      return res.status(400).json({ error: "role_id, table_name, and filter_condition are required" });
    }

    // Auto-generate filter_sql from filter_condition if not provided
    let finalFilterSql = filter_sql || null;
    if (!finalFilterSql && filter_condition) {
      const { filtersToWhereClause } = require("./filters-to-where.cjs");
      // Accept both single filter object and array
      const conditions = Array.isArray(filter_condition) ? filter_condition : [filter_condition];
      const result = filtersToWhereClause(conditions);
      finalFilterSql = result.whereClause || null;
    }

    if (id) {
      // Update existing
      const { rows } = await pool.query(
        `UPDATE shared.row_filters
         SET filter_condition = $1,
             filter_sql = $2,
             description = COALESCE($3, description),
             enabled = COALESCE($4, enabled),
             updated_at = NOW()
         WHERE id = $5 AND company_id = 1
         RETURNING *`,
        [JSON.stringify(filter_condition), finalFilterSql, description || null, enabled !== undefined ? enabled : true, id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "Row filter not found" });
      // Invalidate row-filter cache for this table
      permCache.invalidateTable(table_name);
      res.json(rows[0]);
    } else {
      // Create new
      const { rows } = await pool.query(
        `INSERT INTO shared.row_filters (role_id, table_name, company_id, filter_condition, filter_sql, description, enabled)
         VALUES ($1, $2, 1, $3, $4, $5, $6)
         RETURNING *`,
        [role_id, table_name, JSON.stringify(filter_condition), finalFilterSql, description || null, enabled !== undefined ? enabled : true]
      );
      // Invalidate row-filter cache for this table
      permCache.invalidateTable(table_name);
      res.status(201).json(rows[0]);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/permissions/row-filters/:id — delete a row filter.
 */
app.delete("/api/permissions/row-filters/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // Fetch table_name before deleting so we can invalidate the right cache entries
    const { rows: before } = await pool.query(
      `SELECT table_name FROM shared.row_filters WHERE id = $1 AND company_id = 1`,
      [id]
    );
    const { rowCount } = await pool.query(
      `DELETE FROM shared.row_filters WHERE id = $1 AND company_id = 1`,
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Row filter not found" });
    if (before.length > 0) {
      permCache.invalidateTable(before[0].table_name);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/employees — list employees for user picker
 * Supports ?search= query param for filtering by name or email
 */
app.get("/api/employees", async (req, res) => {
  try {
    const search = req.query.search;
    let query = `SELECT employeeid AS id, firstname, lastname, emailname AS email
                 FROM db_fcc_erp.employees`;
    const params = [];

    if (search && typeof search === "string" && search.trim()) {
      query += ` WHERE firstname ILIKE $1 OR lastname ILIKE $1 OR emailname ILIKE $1`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY lastname, firstname LIMIT 100`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Event Handlers ─────────────────────────────────────

// GET /api/events — list event handlers (optional ?scope= filter)
app.get("/api/events", async (req, res) => {
  try {
    let query = "SELECT * FROM shared.event_handlers";
    const params = [];
    if (req.query.scope) {
      query += " WHERE scope ILIKE $1";
      params.push(req.query.scope);
    }
    query += " ORDER BY sort_order, created_at";
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/by-form/:formName — events scoped to a specific form
app.get("/api/events/by-form/:formName", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM shared.event_handlers 
       WHERE scope ILIKE $1 AND level = 'item'
       ORDER BY event_name, sort_order`,
      [req.params.formName]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events — create a new event handler
app.post("/api/events", async (req, res) => {
  try {
    const { level, scope, event_name, handler, vba_module, vba_control, language, description } = req.body;
    if (!level || !scope || !event_name || !handler) {
      return res.status(400).json({ error: "level, scope, event_name, and handler are required" });
    }
    const { rows } = await pool.query(
      `INSERT INTO shared.event_handlers (level, scope, event_name, handler, vba_module, vba_control, language, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [level, scope, event_name, handler, vba_module || null, vba_control || null, language || 'vba', description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/events/:id — update an event handler
app.put("/api/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { level, scope, event_name, handler, enabled, description } = req.body;
    const { rows } = await pool.query(
      `UPDATE shared.event_handlers 
       SET level = COALESCE($1, level),
           scope = COALESCE($2, scope),
           event_name = COALESCE($3, event_name),
           handler = COALESCE($4, handler),
           enabled = COALESCE($5, enabled),
           description = COALESCE($6, description),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [level, scope, event_name, handler, enabled, description, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Event not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:id — delete an event handler
app.delete("/api/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(
      "DELETE FROM shared.event_handlers WHERE id = $1",
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Event not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Calculated Fields CRUD ─────────────────────────────

/**
 * GET /api/calculated-fields — list all calculated field definitions.
 * Supports optional ?table_name= filter to scope to a specific table.
 */
app.get("/api/calculated-fields", async (req, res) => {
  try {
    let query = "SELECT * FROM shared.calculated_fields";
    const params = [];
    if (req.query.table_name) {
      query += " WHERE table_name = $1";
      params.push(req.query.table_name);
    }
    query += " ORDER BY table_name, name";
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/calculated-fields/:id — get a single calculated field definition.
 */
app.get("/api/calculated-fields/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM shared.calculated_fields WHERE id = $1",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Calculated field not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/calculated-fields — create a new calculated field definition.
 * Body: { name, caption, table_name, calc_type, expression, data_type, ... }
 */
app.post("/api/calculated-fields", async (req, res) => {
  try {
    const {
      name, caption, table_name, calc_type, expression, data_type,
      depends_on, depends_on_tables, read_only, refresh_on, null_when_empty,
      format, decimals, prefix, suffix,
      visible, sortable, filterable,
    } = req.body;

    if (!name || !caption || !table_name || !calc_type || !expression || !data_type) {
      return res.status(400).json({
        error: "name, caption, table_name, calc_type, expression, and data_type are required",
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO shared.calculated_fields
       (name, caption, table_name, calc_type, expression, data_type,
        depends_on, depends_on_tables, read_only, refresh_on, null_when_empty,
        format, decimals, prefix, suffix, visible, sortable, filterable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        name, caption, table_name, calc_type, expression, data_type,
        depends_on || [], depends_on_tables || [],
        read_only !== undefined ? read_only : true,
        refresh_on || "read",
        null_when_empty || false,
        format || null, decimals || null, prefix || null, suffix || null,
        visible !== undefined ? visible : true,
        sortable !== undefined ? sortable : true,
        filterable || false,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/calculated-fields/:id — update a calculated field definition.
 * Body: partial fields to update.
 */
app.put("/api/calculated-fields/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, caption, table_name, calc_type, expression, data_type,
      depends_on, depends_on_tables, read_only, refresh_on, null_when_empty,
      format, decimals, prefix, suffix, visible, sortable, filterable,
    } = req.body;

    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
    if (caption !== undefined) { sets.push(`caption = $${idx++}`); params.push(caption); }
    if (table_name !== undefined) { sets.push(`table_name = $${idx++}`); params.push(table_name); }
    if (calc_type !== undefined) { sets.push(`calc_type = $${idx++}`); params.push(calc_type); }
    if (expression !== undefined) { sets.push(`expression = $${idx++}`); params.push(expression); }
    if (data_type !== undefined) { sets.push(`data_type = $${idx++}`); params.push(data_type); }
    if (depends_on !== undefined) { sets.push(`depends_on = $${idx++}`); params.push(depends_on); }
    if (depends_on_tables !== undefined) { sets.push(`depends_on_tables = $${idx++}`); params.push(depends_on_tables); }
    if (read_only !== undefined) { sets.push(`read_only = $${idx++}`); params.push(read_only); }
    if (refresh_on !== undefined) { sets.push(`refresh_on = $${idx++}`); params.push(refresh_on); }
    if (null_when_empty !== undefined) { sets.push(`null_when_empty = $${idx++}`); params.push(null_when_empty); }
    if (format !== undefined) { sets.push(`format = $${idx++}`); params.push(format); }
    if (decimals !== undefined) { sets.push(`decimals = $${idx++}`); params.push(decimals); }
    if (prefix !== undefined) { sets.push(`prefix = $${idx++}`); params.push(prefix); }
    if (suffix !== undefined) { sets.push(`suffix = $${idx++}`); params.push(suffix); }
    if (visible !== undefined) { sets.push(`visible = $${idx++}`); params.push(visible); }
    if (sortable !== undefined) { sets.push(`sortable = $${idx++}`); params.push(sortable); }
    if (filterable !== undefined) { sets.push(`filterable = $${idx++}`); params.push(filterable); }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    sets.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE shared.calculated_fields SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING *`,
      params
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Calculated field not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/calculated-fields/:id — delete a calculated field definition.
 */
app.delete("/api/calculated-fields/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query(
      "DELETE FROM shared.calculated_fields WHERE id = $1",
      [id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Calculated field not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Dependency Detection ────────────────────────────

const { execFile } = require("child_process");
const path = require("path");

// Path to the CLI wrapper that calls the Python dependency detector
const DEPS_CLI = path.resolve(
  __dirname,
  "calculated_fields",
  "detect_deps_cli.py",
);

/**
 * POST /api/calculated-fields/detect-dependencies
 * Body: { expression: string }
 *
 * Parses the given expression and returns the field references and table
 * qualifiers that the expression depends on. Uses the Python expression
 * parser to build an AST, then walks it to extract FieldRef nodes.
 *
 * Returns: { depends_on: string[], depends_on_tables: string[] }
 */
app.post("/api/calculated-fields/detect-dependencies", async (req, res) => {
  try {
    const { expression } = req.body;
    if (typeof expression !== "string") {
      return res.status(400).json({ error: "expression is required" });
    }

    // Find Python — same logic as sandbox.cjs
    const candidates = ["python3", "python"];
    let pythonCmd = "python3";
    for (const cmd of candidates) {
      try {
        require("child_process").execSync(`${cmd} --version`, {
          stdio: "ignore",
        });
        pythonCmd = cmd;
        break;
      } catch {
        continue;
      }
    }

    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        pythonCmd,
        [DEPS_CLI, "--expression", expression],
        {
          cwd: path.dirname(DEPS_CLI),
          timeout: 5000,
          maxBuffer: 1024 * 64,
          env: {
            PATH: process.env.PATH || "",
            PYTHONIOENCODING: "utf-8",
            PYTHONUNBUFFERED: "1",
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            // Try to parse any JSON from stderr/stdout
            const msg = stderr.trim() || stdout.trim() || error.message;
            reject(new Error(msg));
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch {
            reject(new Error(`Invalid JSON from detector: ${stdout.trim()}`));
          }
        },
      );
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Expression Testing ─────────────────────────────

const EVAL_CLI = path.resolve(
  __dirname,
  "calculated_fields",
  "evaluate_cli.py",
);

/**
 * POST /api/calculated-fields/test-expression
 * Body: { expression: string, values: Record<string, any> }
 *
 * Evaluates an expression with the given sample field values and returns
 * the computed result. Uses the Python expression evaluator.
 *
 * Returns: { result: any } or { error: string }
 */
app.post("/api/calculated-fields/test-expression", async (req, res) => {
  try {
    const { expression, values } = req.body;
    if (typeof expression !== "string") {
      return res.status(400).json({ error: "expression is required" });
    }

    // Find Python — same logic as detect-dependencies
    const candidates = ["python3", "python"];
    let pythonCmd = "python3";
    for (const cmd of candidates) {
      try {
        require("child_process").execSync(`${cmd} --version`, {
          stdio: "ignore",
        });
        pythonCmd = cmd;
        break;
      } catch {
        continue;
      }
    }

    // Build args: --expression and optional --values
    const cliArgs = [EVAL_CLI, "--expression", expression];
    if (values !== undefined && values !== null) {
      cliArgs.push("--values", JSON.stringify(values));
    }

    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        pythonCmd,
        cliArgs,
        {
          cwd: path.dirname(EVAL_CLI),
          timeout: 10000,
          maxBuffer: 1024 * 64,
          env: {
            PATH: process.env.PATH || "",
            PYTHONIOENCODING: "utf-8",
            PYTHONUNBUFFERED: "1",
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            const msg = stderr.trim() || stdout.trim() || error.message;
            reject(new Error(msg));
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch {
            reject(new Error(`Invalid JSON from evaluator: ${stdout.trim()}`));
          }
        },
      );
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Aggregate Evaluation ────────────────────────────

/**
 * POST /api/calculated-fields/evaluate-aggregate
 * Body: { table_name, expression, record_id, parent_field_name }
 *
 * Parses an aggregate expression (e.g., SUM(order_details.{quantity}))
 * using the Python aggregate CLI, builds a SQL query, executes it against
 * PostgreSQL, caches the result with 30s TTL, and returns it.
 *
 * The Python CLI returns the parsed components; the server builds and
 * executes the actual SQL query for persistence across calls.
 *
 * Returns: { result: number | null, cached: boolean }
 */
const AGGREGATE_CLI = path.resolve(
  __dirname,
  "calculated_fields",
  "aggregate_eval_cli.py",
);

// In-memory LRU cache with 30s TTL for aggregate results
const aggregateCache = new Map();
const AGGREGATE_CACHE_TTL = 30_000; // 30 seconds

function getAggregateFromCache(key) {
  const entry = aggregateCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    aggregateCache.delete(key);
    return undefined;
  }
  // Move to end (LRU — delete & re-set)
  aggregateCache.delete(key);
  aggregateCache.set(key, entry);
  return entry.value;
}

function setAggregateCache(key, value) {
  // Evict LRU if at capacity (500)
  if (!aggregateCache.has(key) && aggregateCache.size >= 500) {
    const firstKey = aggregateCache.keys().next().value;
    aggregateCache.delete(firstKey);
  }
  aggregateCache.set(key, { value, expiresAt: Date.now() + AGGREGATE_CACHE_TTL });
}

/**
 * Build a SQL query for an aggregate expression.
 *
 * @param {{ fn: string, related_table: string, sql_field: string, is_count_star: boolean }} parsed
 * @param {string} foreignKey — inferred FK column name
 * @returns {string}
 */
function buildAggregateSQL(parsed, foreignKey) {
  const { fn, related_table, sql_field, is_count_star } = parsed;
  if (is_count_star || sql_field === "*") {
    return `SELECT COUNT(*) AS result FROM ${related_table} WHERE ${foreignKey} = $1`;
  }
  return `SELECT ${fn}(${sql_field}) AS result FROM ${related_table} WHERE ${foreignKey} = $1`;
}

/**
 * Infer the foreign key column name from the parent table name.
 * @param {string} parentTable
 * @returns {string}
 */
function inferForeignKey(parentTable) {
  let name = parentTable.toLowerCase();
  // Simple singularization
  if (name.endsWith("ies")) name = name.slice(0, -3) + "y";
  else if (name.endsWith("ses")) name = name.slice(0, -2);
  else if (name.endsWith("shes")) name = name.slice(0, -2);
  else if (name.endsWith("ches")) name = name.slice(0, -2);
  else if (name.endsWith("xes")) name = name.slice(0, -2);
  else if (name.endsWith("s") && !name.endsWith("ss")) name = name.slice(0, -1);
  return `${name}_id`;
}

app.post("/api/calculated-fields/evaluate-aggregate", async (req, res) => {
  try {
    const { table_name, expression, record_id, parent_field_name } = req.body;

    if (!table_name || !expression || record_id === undefined) {
      return res.status(400).json({
        error: "table_name, expression, and record_id are required",
      });
    }

    // Build cache key
    const fieldName = parent_field_name || "aggregate";
    const cacheKey = `${table_name}:${fieldName}:${record_id}`;

    // Check in-memory cache first
    const cached = getAggregateFromCache(cacheKey);
    if (cached !== undefined) {
      return res.json({ result: cached, cached: true });
    }

    // Find Python — same logic as detect-dependencies
    const candidates = ["python3", "python"];
    let pythonCmd = "python3";
    for (const cmd of candidates) {
      try {
        require("child_process").execSync(`${cmd} --version`, {
          stdio: "ignore",
        });
        pythonCmd = cmd;
        break;
      } catch {
        continue;
      }
    }

    // Parse the expression using the Python CLI
    const cliArgs = [
      AGGREGATE_CLI,
      "--expression",
      expression,
      "--parent",
      table_name,
    ];
    if (record_id != null) {
      cliArgs.push("--record-id", String(record_id));
    }

    const parsed = await new Promise((resolve, reject) => {
      execFile(
        pythonCmd,
        cliArgs,
        {
          cwd: path.dirname(AGGREGATE_CLI),
          timeout: 5000,
          maxBuffer: 1024 * 64,
          env: {
            PATH: process.env.PATH || "",
            PYTHONIOENCODING: "utf-8",
            PYTHONUNBUFFERED: "1",
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            const msg = stderr.trim() || stdout.trim() || error.message;
            reject(new Error(msg));
            return;
          }
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch {
            reject(new Error(`Invalid JSON from aggregate CLI: ${stdout.trim()}`));
          }
        },
      );
    });

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    // Build and execute the SQL query
    const foreignKey = parsed.foreign_key || inferForeignKey(table_name);
    const sql = buildAggregateSQL(parsed, foreignKey);

    const { rows } = await pool.query(sql, [record_id]);
    const result = rows[0]?.result ?? null;

    // Cache the result
    setAggregateCache(cacheKey, result);

    res.json({ result, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stored Calculation (compute on save, store in DB) ───

/**
 * POST /api/calculated-fields/compute-stored
 * Body: { table_name: string, record_id: number }
 *
 * Fetches all stored-type calculated field definitions for the given table,
 * evaluates each expression against the current record data, and upserts
 * the results into shared.calculated_field_values.
 *
 * Returns: { stored_values: Record<string, any>, computed_at: string }
 */
app.post("/api/calculated-fields/compute-stored", async (req, res) => {
  try {
    const { table_name, record_id } = req.body;
    if (!table_name || record_id === undefined) {
      return res.status(400).json({
        error: "table_name and record_id are required",
      });
    }

    // 1. Fetch stored-type calculated fields for this table
    const { rows: definitions } = await pool.query(
      `SELECT * FROM shared.calculated_fields
       WHERE table_name = $1 AND calc_type = 'stored' AND visible = true
       ORDER BY name`,
      [table_name]
    );

    if (definitions.length === 0) {
      return res.json({ stored_values: {}, computed_at: new Date().toISOString() });
    }

    // 2. Fetch the actual record data from the ERP table
    const pkCol = await getPkColumn(table_name);
    const { rows: records } = await pool.query(
      `SELECT * FROM db_fcc_erp."${table_name}" WHERE "${pkCol}" = $1 AND company_id = 1`,
      [record_id]
    );
    if (records.length === 0) {
      return res.status(404).json({ error: `Record not found in ${table_name}` });
    }
    const record = records[0];

    // 3. Evaluate each stored expression via Python CLI
    const candidates = ["python3", "python"];
    let pythonCmd = "python3";
    for (const cmd of candidates) {
      try {
        require("child_process").execSync(`${cmd} --version`, { stdio: "ignore" });
        pythonCmd = cmd;
        break;
      } catch { continue; }
    }

    const EVAL_CLI = path.resolve(__dirname, "calculated_fields", "evaluate_cli.py");
    const stored_values = {};
    const now = new Date().toISOString();

    for (const def of definitions) {
      try {
        const valuesJson = JSON.stringify(record);
        const result = await new Promise((resolve, reject) => {
          const child = require("child_process").execFile(
            pythonCmd,
            [EVAL_CLI, "--expression", def.expression, "--values", valuesJson],
            {
              cwd: path.dirname(EVAL_CLI),
              timeout: 10000,
              maxBuffer: 1024 * 64,
              env: { PATH: process.env.PATH || "", PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1" },
            },
            (error, stdout, stderr) => {
              if (error) {
                const msg = stderr.trim() || stdout.trim() || error.message;
                reject(new Error(msg));
                return;
              }
              try { resolve(JSON.parse(stdout.trim())); }
              catch { reject(new Error(`Invalid JSON: ${stdout.trim()}`)); }
            }
          );
        });
        const value = result?.result !== undefined ? String(result.result) : null;

        // 4. Upsert into shared.calculated_field_values
        await pool.query(
          `INSERT INTO shared.calculated_field_values
           (table_name, record_id, field_name, value, expression, computed_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (table_name, record_id, field_name)
           DO UPDATE SET value = EXCLUDED.value,
                         expression = EXCLUDED.expression,
                         computed_at = EXCLUDED.computed_at,
                         updated_at = EXCLUDED.updated_at`,
          [table_name, record_id, def.name, value, def.expression, now]
        );

        stored_values[def.name] = result?.result ?? null;
      } catch (evalErr) {
        // Store error marker
        stored_values[def.name] = "#Error";
        // Also upsert the error marker so subsequent reads get it
        await pool.query(
          `INSERT INTO shared.calculated_field_values
           (table_name, record_id, field_name, value, expression, computed_at, updated_at)
           VALUES ($1, $2, $3, '#Error', $4, $5, $5)
           ON CONFLICT (table_name, record_id, field_name)
           DO UPDATE SET value = '#Error',
                         expression = EXCLUDED.expression,
                         computed_at = EXCLUDED.computed_at,
                         updated_at = EXCLUDED.updated_at`,
          [table_name, record_id, def.name, def.expression, now]
        );
      }
    }

    res.json({ stored_values, computed_at: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/calculated-fields/stored-values/:table/:recordId
 *
 * Retrieves all pre-computed stored calculation values for a given
 * table + record. Returns what's in the shared.calculated_field_values
 * table — no recomputation happens here.
 *
 * Returns: { stored_values: Record<string, any> }
 */
app.get("/api/calculated-fields/stored-values/:table/:recordId", async (req, res) => {
  try {
    const { table, recordId } = req.params;
    if (!table || !recordId) {
      return res.status(400).json({ error: "table and recordId are required" });
    }

    const { rows } = await pool.query(
      `SELECT field_name, value FROM shared.calculated_field_values
       WHERE table_name = $1 AND record_id = $2`,
      [table, Number(recordId)]
    );

    const stored_values = {};
    for (const row of rows) {
      // Try to parse the value as a number if it looks numeric
      const val = row.value;
      if (val === "#Error") {
        stored_values[row.field_name] = "#Error";
      } else if (val === null || val === undefined) {
        stored_values[row.field_name] = null;
      } else if (!isNaN(Number(val)) && val.trim() !== "") {
        stored_values[row.field_name] = Number(val);
      } else {
        stored_values[row.field_name] = val;
      }
    }

    res.json({ stored_values });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Audit Log ─────────────────────────────────────────

/**
 * GET /api/audit-log — list audit log entries with filtering
 *
 * Query params:
 *   ?table_name=   — filter by table
 *   ?record_id=    — filter by record ID
 *   ?action=       — filter by action (INSERT|UPDATE|DELETE)
 *   ?changed_by=   — filter by user ID
 *   ?from=         — start date (ISO or YYYY-MM-DD)
 *   ?to=           — end date
 *   ?page=1        — page number
 *   ?limit=50      — page size
 *
 * Returns: { rows, total, page, limit, pages }
 */
app.get("/api/audit-log", async (req, res) => {
  try {
    const {
      table_name,
      record_id,
      action,
      changed_by,
      from,
      to,
      page = "1",
      limit = "50",
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (table_name) {
      conditions.push(`table_name = $${idx++}`);
      params.push(table_name);
    }
    if (record_id) {
      conditions.push(`record_id = $${idx++}`);
      params.push(Number(record_id));
    }
    if (action) {
      conditions.push(`action = $${idx++}`);
      params.push(action);
    }
    if (changed_by) {
      conditions.push(`changed_by = $${idx++}`);
      params.push(Number(changed_by));
    }
    if (from) {
      conditions.push(`changed_at >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`changed_at <= $${idx++}`);
      params.push(to);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Total count for pagination
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM shared.audit_log ${where}`,
      params
    );
    const total = parseInt(countRows[0].total, 10);

    // Fetch page
    const { rows } = await pool.query(
      `SELECT * FROM shared.audit_log ${where} ORDER BY changed_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limitNum, offset]
    );

    res.json({
      rows,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit-log/:id — single audit log entry
 */
app.get("/api/audit-log/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM shared.audit_log WHERE id = $1",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Audit entry not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/audit-log/:id/undo — revert a single audit entry
 *
 * For UPDATE: sets the record back to old_data values
 * For INSERT: deletes the record
 * For DELETE: re-inserts the record from old_data
 */
app.post("/api/audit-log/:id/undo", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the audit entry
    const { rows: auditRows } = await pool.query(
      "SELECT * FROM shared.audit_log WHERE id = $1",
      [id]
    );
    if (auditRows.length === 0) {
      return res.status(404).json({ error: "Audit entry not found" });
    }
    const entry = auditRows[0];
    const { table_name, record_id, action, old_data, new_data } = entry;

    if (action === "INSERT") {
      // ── Undo INSERT → DELETE the record ──────────────────
      const pk = await getPkColumn(table_name);
      await queryWithAudit(
        `DELETE FROM db_fcc_erp."${table_name}" WHERE "${pk}" = $1 AND company_id = 1`,
        [record_id],
        req.user
      );
      return res.json({
        ok: true,
        message: `Deleted record #${record_id} from ${table_name}`,
        action: "DELETE",
      });
    }

    if (action === "UPDATE") {
      // ── Undo UPDATE → revert changed fields to old_data ──
      if (!old_data || !new_data) {
        return res.status(400).json({ error: "No data snapshots available for this entry" });
      }

      // Compute only the fields that actually changed in this entry
      const changedFields = {};
      const oldKeys = Object.keys(old_data);
      const newKeys = Object.keys(new_data);
      const allKeys = new Set([...oldKeys, ...newKeys]);

      for (const key of allKeys) {
        // Skip primary key and internal fields
        if (key === "id") continue;
        const ov = old_data[key];
        const nv = new_data[key];
        if (JSON.stringify(ov) !== JSON.stringify(nv)) {
          changedFields[key] = ov;
        }
      }

      const revertKeys = Object.keys(changedFields);
      if (revertKeys.length === 0) {
        return res.status(400).json({ error: "No changed fields to revert" });
      }

      const pk = await getPkColumn(table_name);
      const sets = revertKeys.map((c, i) => `"${c}" = $${i + 1}`);
      const values = [...Object.values(changedFields), record_id];

      await queryWithAudit(
        `UPDATE db_fcc_erp."${table_name}" SET ${sets.join(", ")} WHERE "${pk}" = $${values.length} AND company_id = 1`,
        values,
        req.user
      );

      return res.json({
        ok: true,
        message: `Reverted ${revertKeys.length} field(s) on ${table_name} #${record_id}`,
        action: "UPDATE",
        fields: revertKeys,
      });
    }

    if (action === "DELETE") {
      // ── Undo DELETE → re-insert the record ───────────────
      if (!old_data) {
        return res.status(400).json({ error: "No data snapshot available to restore" });
      }

      // Remove any keys that would conflict (auto PK, etc.)
      const insertData = { ...old_data, company_id: 1 };

      const columns = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = values.map((_, i) => `$${i + 1}`);

      const result = await queryWithAudit(
        `INSERT INTO db_fcc_erp."${table_name}" (${columns.map((c) => `"${c}"`).join(", ")})
         VALUES (${placeholders.join(", ")})
         RETURNING *`,
        values,
        req.user
      );

      return res.json({
        ok: true,
        message: `Restored record in ${table_name}`,
        action: "INSERT",
        record: result.rows[0],
      });
    }

    return res.status(400).json({ error: `Cannot undo action: ${action}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/audit-log/restore — point-in-time restore
 *
 * Restores a record to the state it had at a given timestamp
 * by replaying audit entries in chronological order up to that point.
 *
 * Body: { table_name, record_id, timestamp }
 */
app.post("/api/audit-log/restore", async (req, res) => {
  try {
    const { table_name, record_id, timestamp } = req.body;

    if (!table_name || record_id == null || !timestamp) {
      return res.status(400).json({ error: "table_name, record_id, and timestamp are required" });
    }

    const pk = await getPkColumn(table_name);

    // Collect current state of the record (may not exist if deleted)
    let currentRecord = null;
    try {
      const { rows } = await pool.query(
        `SELECT * FROM db_fcc_erp."${table_name}" WHERE "${pk}" = $1 AND company_id = 1`,
        [record_id]
      );
      if (rows.length > 0) currentRecord = rows[0];
    } catch {
      // Table might not have company_id — try without
      const { rows } = await pool.query(
        `SELECT * FROM db_fcc_erp."${table_name}" WHERE "${pk}" = $1`,
        [record_id]
      );
      if (rows.length > 0) currentRecord = rows[0];
    }

    // Fetch all audit entries for this record up to the timestamp, chronological order
    const { rows: auditEntries } = await pool.query(
      `SELECT * FROM shared.audit_log
       WHERE table_name = $1 AND record_id = $2 AND changed_at <= $3
       ORDER BY changed_at ASC`,
      [table_name, record_id, timestamp]
    );

    if (auditEntries.length === 0) {
      return res.status(404).json({
        error: "No audit entries found for this record before the given timestamp",
      });
    }

    // Replay audit entries chronologically to determine state at the timestamp
    let targetState = null;
    let lastAction = null;

    for (const entry of auditEntries) {
      if (entry.action === "INSERT") {
        targetState = entry.new_data;
        lastAction = "INSERT";
      } else if (entry.action === "UPDATE") {
        targetState = entry.new_data;
        lastAction = "UPDATE";
      } else if (entry.action === "DELETE") {
        targetState = null;
        lastAction = "DELETE";
      }
    }

    if (targetState === null) {
      // Record was deleted before the timestamp — can't restore state
      if (currentRecord !== null) {
        // Record currently exists but was deleted by the target time — delete it
        await queryWithAudit(
          `DELETE FROM db_fcc_erp."${table_name}" WHERE "${pk}" = $1 AND company_id = 1`,
          [record_id],
          req.user
        );
        return res.json({
          ok: true,
          message: `Deleted ${table_name} #${record_id} — it did not exist at the given timestamp`,
          action: "DELETE",
        });
      }
      return res.json({
        ok: true,
        message: `Record ${table_name} #${record_id} did not exist at the given timestamp`,
        action: "NONE",
      });
    }

    // Remove company_id from target — we'll set it explicitly
    const targetData = { ...targetState };
    delete targetData.company_id;

    if (currentRecord === null) {
      // Record doesn't exist now but did at the target time — INSERT it
      targetData.company_id = 1;
      const columns = Object.keys(targetData);
      const values = Object.values(targetData);
      const placeholders = values.map((_, i) => `$${i + 1}`);

      await queryWithAudit(
        `INSERT INTO db_fcc_erp."${table_name}" (${columns.map((c) => `"${c}"`).join(", ")})
         VALUES (${placeholders.join(", ")})`,
        values,
        req.user
      );

      return res.json({
        ok: true,
        message: `Restored deleted record ${table_name} #${record_id} to state at ${timestamp}`,
        action: "INSERT",
      });
    }

    // Record exists — compute diff and UPDATE changed fields
    const changedFields = {};
    const currentKeys = Object.keys(currentRecord);
    const targetKeys = Object.keys(targetData);
    const allKeys = new Set([...currentKeys, ...targetKeys]);

    for (const key of allKeys) {
      if (key === "id" || key === pk || key === "company_id") continue;
      const cv = currentRecord[key];
      const tv = targetData[key];
      if (JSON.stringify(cv) !== JSON.stringify(tv)) {
        changedFields[key] = tv;
      }
    }

    const changeKeys = Object.keys(changedFields);
    if (changeKeys.length === 0) {
      return res.json({
        ok: true,
        message: `Record ${table_name} #${record_id} already matches state at ${timestamp}`,
        action: "NONE",
      });
    }

    const sets = changeKeys.map((c, i) => `"${c}" = $${i + 1}`);
    const values = [...Object.values(changedFields), record_id];

    await queryWithAudit(
      `UPDATE db_fcc_erp."${table_name}" SET ${sets.join(", ")} WHERE "${pk}" = $${values.length} AND company_id = 1`,
      values,
      req.user
    );

    return res.json({
      ok: true,
      message: `Restored ${table_name} #${record_id} to state at ${timestamp} (${changeKeys.length} field(s) changed)`,
      action: "UPDATE",
      fields: changeKeys,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit/retention — get audit retention config
 */
app.get("/api/audit/retention", async (_req, res) => {
  try {
    // Get the default config
    const { rows: defaults } = await pool.query(
      `SELECT retention_days, last_pruned_at, created_at, updated_at
       FROM shared.audit_retention_config
       WHERE table_name IS NULL AND active = true`
    );

    // Get per-table overrides
    const { rows: overrides } = await pool.query(
      `SELECT id, table_name, retention_days, last_pruned_at, active, created_at, updated_at
       FROM shared.audit_retention_config
       WHERE table_name IS NOT NULL AND active = true
       ORDER BY table_name`
    );

    // Get global stats
    const { rows: stats } = await pool.query(
      `SELECT
         COUNT(*)::INT AS total_entries,
         COALESCE(MIN(changed_at)::TEXT, 'N/A') AS oldest_entry,
         COALESCE(MAX(changed_at)::TEXT, 'N/A') AS newest_entry
       FROM shared.audit_log`
    );

    // Count distinct tables with audit entries
    const { rows: tables } = await pool.query(
      `SELECT COUNT(DISTINCT table_name)::INT AS table_count FROM shared.audit_log`
    );

    res.json({
      default_retention_days: defaults.length > 0 ? defaults[0].retention_days : 365,
      default_last_pruned_at: defaults.length > 0 ? defaults[0].last_pruned_at : null,
      overrides,
      stats: {
        total_entries: stats[0].total_entries,
        oldest_entry: stats[0].oldest_entry,
        newest_entry: stats[0].newest_entry,
        table_count: tables[0].table_count,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/audit/retention — update retention config
 *
 * Body:
 *   { default_retention_days: 365 }                            — update global default
 *   { overrides: [{ table_name: 'products', retention_days: 90 }] }  — set per-table overrides
 *   { overrides: [{ id: 1, retention_days: 180 }] }            — update existing override by id
 *   { overrides: [{ id: 1, _delete: true }] }                  — remove an override
 */
app.put("/api/audit/retention", async (req, res) => {
  try {
    const { default_retention_days, overrides } = req.body;

    // Update global default
    if (default_retention_days != null) {
      const days = parseInt(default_retention_days, 10);
      if (isNaN(days) || days < 1) {
        return res.status(400).json({ error: "default_retention_days must be >= 1" });
      }
      await pool.query(
        `UPDATE shared.audit_retention_config SET retention_days = $1, updated_at = NOW() WHERE table_name IS NULL`,
        [days]
      );
      // Ensure default row exists
      await pool.query(
        `INSERT INTO shared.audit_retention_config (table_name, retention_days)
         SELECT NULL, $1
         WHERE NOT EXISTS (SELECT 1 FROM shared.audit_retention_config WHERE table_name IS NULL)`,
        [days]
      );
    }

    // Process per-table overrides
    if (overrides && Array.isArray(overrides)) {
      for (const ov of overrides) {
        if (ov._delete && ov.id) {
          await pool.query(
            `DELETE FROM shared.audit_retention_config WHERE id = $1 AND table_name IS NOT NULL`,
            [ov.id]
          );
          continue;
        }
        if (ov._delete && ov.table_name) {
          await pool.query(
            `DELETE FROM shared.audit_retention_config WHERE table_name = $1 AND table_name IS NOT NULL`,
            [ov.table_name]
          );
          continue;
        }
        if (ov.retention_days != null && ov.table_name) {
          const days = parseInt(ov.retention_days, 10);
          if (isNaN(days) || days < 1) {
            return res.status(400).json({ error: `Invalid retention_days for ${ov.table_name}` });
          }
          await pool.query(
            `INSERT INTO shared.audit_retention_config (table_name, retention_days)
             VALUES ($1, $2)
             ON CONFLICT (table_name) DO UPDATE SET retention_days = $2, updated_at = NOW()`,
            [ov.table_name, days]
          );
        } else if (ov.retention_days != null && ov.id) {
          const days = parseInt(ov.retention_days, 10);
          if (isNaN(days) || days < 1) {
            return res.status(400).json({ error: `Invalid retention_days for override id ${ov.id}` });
          }
          await pool.query(
            `UPDATE shared.audit_retention_config SET retention_days = $1, updated_at = NOW() WHERE id = $2`,
            [days, ov.id]
          );
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/audit/prune — manually trigger pruning
 *
 * Body:
 *   {}                          — prune all tables using config
 *   { table_name: 'products' }  — prune a specific table
 *   { dry_run: true }           — preview without deleting
 *
 * Returns: array of { table_name, retention_days, entries_before, entries_pruned, oldest_kept, cutoff_date }
 */
app.post("/api/audit/prune", async (req, res) => {
  try {
    const { table_name, dry_run } = req.body;

    if (table_name) {
      const { rows } = await pool.query(
        `SELECT * FROM shared.prune_audit_log($1, $2)`,
        [table_name, !!dry_run]
      );
      return res.json({ pruned: rows });
    }

    const { rows } = await pool.query(
      `SELECT * FROM shared.prune_audit_log(NULL, $1)`,
      [!!dry_run]
    );
    res.json({ pruned: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit/prune/stats — preview prune stats via the retention_status view
 */
app.get("/api/audit/prune/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM shared.audit_retention_status ORDER BY entry_count DESC`
    );

    const total_entries = rows.reduce((s, r) => s + parseInt(r.entry_count), 0);
    const total_prunable = rows.reduce((s, r) => s + parseInt(r.prunable_count), 0);

    res.json({
      tables: rows,
      summary: {
        total_entries,
        total_prunable,
        table_count: rows.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit/triggers — trigger coverage report
 * Returns total ERP tables, tables with triggers, tables missing triggers
 */
app.get("/api/audit/triggers", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH table_list AS (
        SELECT tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'db_fcc_erp'
      ),
      trigger_list AS (
        SELECT DISTINCT c.relname AS tablename
        FROM pg_trigger tg
        JOIN pg_class c ON c.oid = tg.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'db_fcc_erp'
          AND tg.tgname LIKE 'trg_audit_%'
          AND NOT tg.tgisinternal
      )
      SELECT
        (SELECT COUNT(*) FROM table_list)::INT AS total_tables,
        (SELECT COUNT(*) FROM trigger_list)::INT AS triggered_tables,
        (SELECT COUNT(*) FROM table_list WHERE tablename NOT IN (SELECT tablename FROM trigger_list))::INT AS missing_triggers,
        COALESCE(
          (SELECT json_agg(tablename) FROM table_list WHERE tablename NOT IN (SELECT tablename FROM trigger_list)),
          '[]'::json
        ) AS missing_table_names
    `);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Event Engine — hierarchical dispatch chain ──────

const { mountEventEngine } = require("./event-engine.cjs");
mountEventEngine(app);

// ─── Start ────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Roastery API running on http://localhost:${PORT}`);
});