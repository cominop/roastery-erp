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
 * GET /api/nav/tree/counts — live record counts for nav tree targets
 *
 * Returns a map of target_name → estimated row_count for all
 * table/form/report nodes in the nav_tree. Uses pg_stat_user_tables
 * for fast approximate counts (no full table scans).
 *
 * Response: { "customers": 4007, "orders": 38929, ... }
 *
 * NOTE: Must be defined BEFORE /api/nav/tree/:id so Express matches
 * the literal "counts" path before treating it as a parameter.
 */
app.get("/api/nav/tree/counts", async (req, res) => {
  try {
    const companyId = parseInt(req.query.company_id || "1", 10);
    const { rows } = await pool.query(
      `SELECT * FROM shared.fn_nav_tree_counts($1)`,
      [companyId]
    );
    // Return as a flat map for O(1) lookup on the frontend
    const counts = {};
    for (const row of rows) {
      counts[row.target_name] = Number(row.row_count);
    }
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/nav/tree/status-badges — conditional status counts
 *
 * Returns a grouped map of target_name → status badge array for all
 * table targets that have meaningful status conditions (unfilled orders,
 * open work orders, inactive customers, etc).
 *
 * Response:
 *   {
 *     "orders": [
 *       { "key": "unfilled", "label": "Unfilled", "count": 33751, "severity": "warning" }
 *     ],
 *     "workorders": [
 *       { "key": "open", "label": "Open", "count": 15, "severity": "info" },
 *       ...
 *     ]
 *   }
 *
 * NOTE: Must be defined BEFORE /api/nav/tree/:id so Express matches
 * the literal "status-badges" path before treating it as a parameter.
 */
app.get("/api/nav/tree/status-badges", async (req, res) => {
  try {
    const companyId = parseInt(req.query.company_id || "1", 10);
    const { rows } = await pool.query(
      `SELECT * FROM shared.fn_nav_tree_status_badges($1)`,
      [companyId]
    );
    // Group by target_name into arrays of status badge objects
    const badges = {};
    for (const row of rows) {
      if (!badges[row.target_name]) badges[row.target_name] = [];
      badges[row.target_name].push({
        key: row.status_key,
        label: row.status_label,
        count: Number(row.row_count),
        severity: row.severity,
      });
    }
    res.json(badges);
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
 * POST /api/nav/tree/regenerate — auto-generate tree from DB schema
 *
 * Calls shared.fn_regenerate_nav_tree() which scans pg_tables +
 * shared.objects and builds a categorized navigation tree.
 *
 * Body: { company_id?, keep_existing? }
 *   - company_id (int, default 1): company scope
 *   - keep_existing (bool, default false): if true, only adds new nodes
 *     without clearing existing ones
 *
 * Response: { ok: true, groups: N, tables: N, forms: N, reports: N, admin: N }
 */
app.post("/api/nav/tree/regenerate", async (req, res) => {
  try {
    const companyId = parseInt(req.body.company_id || "1", 10);
    const keepExisting = req.body.keep_existing === true;

    const { rows } = await pool.query(
      `SELECT shared.fn_regenerate_nav_tree($1, $2) AS result`,
      [companyId, keepExisting]
    );

    res.json(rows[0].result);
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

// ─── Visual Forms (visual editor) ──────────────────────

/**
 * GET /api/visual-forms — list all visual form definitions
 *
 * Returns metadata for all forms created in the visual editor.
 * Does NOT include the full sections JSONB — use GET /api/visual-forms/:name for that.
 *
 * Query params:
 *   ?company_id=1  — company scope (default: 1)
 */
app.get("/api/visual-forms", async (req, res) => {
  try {
    const companyId = parseInt(req.query.company_id || "1", 10);
    const { rows } = await pool.query(
      `SELECT * FROM shared.fn_visual_forms($1)`,
      [companyId]
    );
    // Convert to camelCase for the frontend
    const result = rows.map((r) => ({
      id: r.id,
      name: r.name,
      caption: r.caption,
      recordSource: r.record_source,
      version: r.version,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/visual-forms/:name — get a single visual form definition
 *
 * Returns the full form definition (sections, controls, editor settings, etc.)
 * with camelCase keys for the frontend.
 */
app.get("/api/visual-forms/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const companyId = parseInt(req.query.company_id || "1", 10);
    const { rows } = await pool.query(
      `SELECT * FROM shared.fn_get_visual_form($1, $2)`,
      [name, companyId]
    );
    if (!rows || rows.length === 0 || !rows[0].fn_get_visual_form) {
      return res.status(404).json({ error: "Visual form not found" });
    }
    res.json(rows[0].fn_get_visual_form);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/visual-forms — create a new visual form
 *
 * Body:
 *   { name: string, caption?: string, recordSource?: string }
 *
 * The form is created with default empty sections (header, detail, footer).
 */
app.post("/api/visual-forms", async (req, res) => {
  try {
    const { name, caption, recordSource } = req.body;
    const companyId = parseInt(req.query.company_id || "1", 10);

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    // Create default empty sections
    const defaultSections = JSON.stringify({
      header: { controls: [] },
      detail: { controls: [] },
      footer: { controls: [] },
    });

    const { rows } = await pool.query(
      `SELECT * FROM shared.fn_save_visual_form(
        $1, $2, $3,
        true, true, true, true, false, false,
        NULL, NULL, $4::jsonb,
        NULL, NULL, NULL,
        NULL, $5, $6
      )`,
      [
        name.trim(),
        caption || name.trim(),
        recordSource || null,
        defaultSections,
        companyId,
        req.headers["x-user-name"] || null,
      ]
    );

    if (!rows || rows.length === 0) {
      return res.status(500).json({ error: "Failed to create visual form" });
    }

    res.status(201).json({ name: name.trim(), ...rows[0].fn_save_visual_form });
  } catch (err) {
    // Check for unique constraint violation
    if (err.code === "23505") {
      return res.status(409).json({ error: "A form with this name already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/visual-forms/:name — update a visual form definition
 *
 * Body:
 *   {
 *     definition: { ... full form definition ... },
 *     version: number
 *   }
 *
 * The `version` field is used for optimistic concurrency control.
 * If the version doesn't match the current DB version, the update is rejected
 * with a 409 Conflict.
 */
app.put("/api/visual-forms/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { definition, version } = req.body;
    const companyId = parseInt(req.query.company_id || "1", 10);

    if (!definition) {
      return res.status(400).json({ error: "definition is required" });
    }

    // Build sections JSON from the form definition
    const sections = JSON.stringify({
      header: definition.header || { controls: [] },
      detail: definition.detail || { controls: [] },
      footer: definition.footer || { controls: [] },
    });

    const editorSettings = definition.editorSettings
      ? JSON.stringify(definition.editorSettings)
      : null;
    const events = definition.events ? JSON.stringify(definition.events) : null;

    const { rows } = await pool.query(
      `SELECT * FROM shared.fn_save_visual_form(
        $1, $2, $3,
        $4, $5, $6, $7, $8, $9,
        $10, $11, $12::jsonb,
        $13::jsonb, $14::jsonb, $15,
        $16, $17, $18
      )`,
      [
        name,
        definition.caption || null,
        definition.recordSource || null,
        definition.allowEdits !== false,
        definition.allowAdditions !== false,
        definition.allowDeletions !== false,
        definition.navigationButtons !== false,
        !!definition.modal,
        !!definition.popup,
        definition.filter || null,
        definition.orderBy || null,
        sections,
        editorSettings,
        events,
        definition.module || null,
        version || null,
        companyId,
        req.headers["x-user-name"] || null,
      ]
    );

    if (!rows || rows.length === 0) {
      return res.status(500).json({ error: "Failed to update visual form" });
    }

    const result = rows[0].fn_save_visual_form;
    if (result.error) {
      return res.status(409).json({ error: result.error });
    }

    res.json({ name, ...result });
  } catch (err) {
    // Check for version conflict error
    if (err.message && err.message.includes("Version conflict")) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/visual-forms/:name — delete a visual form
 */
app.delete("/api/visual-forms/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const companyId = parseInt(req.query.company_id || "1", 10);

    const { rows } = await pool.query(
      `SELECT * FROM shared.fn_delete_visual_form($1, $2)`,
      [name, companyId]
    );

    const deleted = rows && rows[0] && rows[0].fn_delete_visual_form;
    if (!deleted) {
      return res.status(404).json({ error: "Visual form not found" });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Event Engine — hierarchical dispatch chain ──────

const { mountEventEngine } = require("./event-engine.cjs");
mountEventEngine(app);

// ─── Metadata Export/Import API ─────────────────────────

/**
 * POST /api/metadata/export — run export + package pipeline
 *
 * Body (optional):
 *   { "description": "Release notes", "source": "staging" }
 *
 * Runs the metadata-exporter.cjs then metadata-packager.cjs in sequence,
 * returning the path to the generated .zip archive.
 */
app.post("/api/metadata/export", async (req, res) => {
  const { execSync } = require("child_process");
  const path = require("path");
  const fs = require("fs");

  const description = req.body?.description || "UI export";
  const source = req.body?.source || "development";

  const serverDir = __dirname;
  const projectDir = path.resolve(serverDir, "..");
  const exporterScript = path.join(serverDir, "metadata-exporter.cjs");
  const packagerScript = path.join(serverDir, "metadata-packager.cjs");

  try {
    // 1. Run exporter
    execSync(`node "${exporterScript}"`, {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    });

    // 2. Run packager
    const result = execSync(
      `node "${packagerScript}" --description "${description}" --source "${source}"`,
      {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60000,
        encoding: "utf-8",
      }
    );

    const stdout = typeof result === "string" ? result : result.stdout?.toString() || "";
    // Parse the archive path from packager output
    const archiveMatch = stdout.match(/Archive:\s+(.+\.zip)/i);
    const archivePath = archiveMatch ? archiveMatch[1].trim() : null;

    if (archivePath && fs.existsSync(archivePath)) {
      const stats = fs.statSync(archivePath);
      res.status(201).json({
        success: true,
        archive: {
          path: archivePath,
          name: path.basename(archivePath),
          size_bytes: stats.size,
          created_at: new Date().toISOString(),
        },
      });
    } else {
      res.status(500).json({
        error: "Export completed but archive was not found",
        stdout: stdout.slice(0, 2000),
      });
    }
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    res.status(500).json({
      error: `Export failed: ${err.message}`,
      stderr: stderr.slice(0, 2000),
    });
  }
});

/**
 * GET /api/metadata/archives — list available export archives
 *
 * Scans the deploy/ directory for .zip archives matching the
 * erp_metadata_ pattern. Returns sorted newest first.
 */
app.get("/api/metadata/archives", async (req, res) => {
  const path = require("path");
  const fs = require("fs");

  const deployDir = path.resolve(__dirname, "..", "deploy");
  if (!fs.existsSync(deployDir)) {
    return res.json([]);
  }

  try {
    const files = fs.readdirSync(deployDir);
    const archives = files
      .filter((f) => f.endsWith(".zip") && (f.startsWith("erp_metadata") || f.startsWith("auto-backup")))
      .map((f) => {
        const fullPath = path.join(deployDir, f);
        const stats = fs.statSync(fullPath);
        return {
          name: f,
          path: fullPath,
          size_bytes: stats.size,
          created_at: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json(archives);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/metadata/import/validate — validate an archive before importing
 *
 * Body:
 *   { "archivePath": "/path/to/archive.zip" }
 *
 * Runs the metadata-importer.cjs with --archive, returning validation
 * results. Does NOT modify any data.
 */
app.post("/api/metadata/import/validate", async (req, res) => {
  const { execSync } = require("child_process");
  const path = require("path");
  const fs = require("fs");

  const archivePath = req.body?.archivePath;
  if (!archivePath) {
    return res.status(400).json({ error: "archivePath is required" });
  }

  if (!fs.existsSync(archivePath)) {
    return res.status(404).json({ error: `Archive not found: ${archivePath}` });
  }

  const serverDir = __dirname;
  const projectDir = path.resolve(serverDir, "..");
  const importerScript = path.join(serverDir, "metadata-importer.cjs");

  try {
    const result = execSync(
      `node "${importerScript}" --archive "${archivePath}" --verbose 2>&1 || true`,
      {
        cwd: projectDir,
        timeout: 60000,
        encoding: "utf-8",
      }
    );

    const stdout = typeof result === "string" ? result : result.stdout?.toString() || "";
    const hasErrors = stdout.includes("✗") && (
      stdout.includes("VALIDATION FAILED") || stdout.includes("error")
    );
    const hasWarnings = stdout.includes("⚠") && !hasErrors;

    res.json({
      success: !hasErrors,
      hasWarnings,
      output: stdout,
      archivePath,
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    res.status(500).json({
      error: `Validation failed: ${err.message}`,
      stderr: stderr.slice(0, 2000),
    });
  }
});

/**
 * POST /api/metadata/import — run full import pipeline: backup + validate + upsert
 *
 * Body:
 *   { "archivePath": "/path/to/archive.zip", "skipValidation": false }
 *
 * First creates a backup, then validates, then upserts the archive data.
 */
app.post("/api/metadata/import", async (req, res) => {
  const { execSync } = require("child_process");
  const path = require("path");
  const fs = require("fs");

  const archivePath = req.body?.archivePath;
  if (!archivePath) {
    return res.status(400).json({ error: "archivePath is required" });
  }

  if (!fs.existsSync(archivePath)) {
    return res.status(404).json({ error: `Archive not found: ${archivePath}` });
  }

  const skipValidation = req.body?.skipValidation === true;
  const serverDir = __dirname;
  const projectDir = path.resolve(serverDir, "..");
  const backupScript = path.join(serverDir, "metadata-backup.cjs");
  const upsertScript = path.join(serverDir, "metadata-importer-upsert.cjs");

  try {
    // 1. Create a backup first
    let backupResult = null;
    try {
      const backupStdout = execSync(
        `node "${backupScript}" --reason "pre_import" --json`,
        {
          cwd: projectDir,
          timeout: 120000,
          encoding: "utf-8",
        }
      );
      const backupData = JSON.parse(
        (typeof backupStdout === "string" ? backupStdout : backupStdout.stdout?.toString() || "")
      );
      if (backupData.success) {
        backupResult = backupData.backup;
      }
    } catch (backupErr) {
      // Non-fatal — warn but proceed
    }

    // 2. Run upsert with optional skip-validation
    const upsertArgs = [`--archive "${archivePath}"`, "--json"];
    if (skipValidation) upsertArgs.push("--skip-validation");

    const upsertResult = execSync(
      `node "${upsertScript}" ${upsertArgs.join(" ")} 2>&1 || true`,
      {
        cwd: projectDir,
        timeout: 180000,
        encoding: "utf-8",
      }
    );

    const stdout = typeof upsertResult === "string" ? upsertResult : upsertResult.stdout?.toString() || "";
    const hasErrors = stdout.includes("✗") && stdout.includes("IMPORT COMPLETE") === false;
    const success = !hasErrors;

    // 3. Log the import to metadata_imports table
    try {
      const filename = path.basename(archivePath);
      const checksum = (() => {
        try {
          const crypto = require("crypto");
          const content = fs.readFileSync(archivePath);
          return "sha256:" + crypto.createHash("sha256").update(content).digest("hex");
        } catch { return "unknown"; }
      })();
      await pool.query(
        `INSERT INTO shared.metadata_imports (filename, checksum, status, backup_path, import_log)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          filename,
          checksum,
          success ? "completed" : "failed",
          backupResult?.path || null,
          stdout.slice(0, 5000),
        ]
      );
    } catch (logErr) {
      // Non-fatal — log failure shouldn't block the response
    }

    res.json({
      success,
      backupCreated: !!backupResult,
      backup: backupResult,
      output: stdout,
      archivePath,
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    res.status(500).json({
      error: `Import failed: ${err.message}`,
      stderr: stderr.slice(0, 2000),
    });
  }
});

/**
 * GET /api/metadata/imports — list import history
 *
 * Returns records from shared.metadata_imports, newest first.
 * Query params:
 *   ?limit=20     — max records to return (default: 20)
 *   ?status=      — filter by status (optional)
 */
app.get("/api/metadata/imports", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "20", 10);
    const statusFilter = req.query.status;

    let sql = `SELECT * FROM shared.metadata_imports`;
    const params = [];

    if (statusFilter) {
      sql += ` WHERE status = $1`;
      params.push(statusFilter);
    }

    sql += ` ORDER BY imported_at DESC LIMIT $${params.length + 1}`;
    params.push(Math.min(limit, 100));

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/metadata/download — download an archive file
 *
 * Query params:
 *   ?file=<path-to-archive>  — absolute path to the archive file
 *
 * Streams the file as a download attachment.
 */
app.get("/api/metadata/download", async (req, res) => {
  const path = require("path");
  const fs = require("fs");

  const filePath = req.query.file;
  if (!filePath || typeof filePath !== "string") {
    return res.status(400).json({ error: "file query parameter is required" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `File not found: ${filePath}` });
  }

  const name = path.basename(filePath);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Content-Length", fs.statSync(filePath).size);
  fs.createReadStream(filePath).pipe(res);
});

// ─── Metadata Diff API ─────────────────────────────────

/**
 * GET /api/metadata/diff — compute before/after diff of metadata
 *
 * Queries:
 *   ?archive=<path-to-archive>  — path to the .zip archive being imported
 *
 * Returns the structured diff JSON from python3 server/differ.py.
 */
app.get("/api/metadata/diff", async (req, res) => {
  const { execSync } = require("child_process");
  const path = require("path");
  const fs = require("fs");
  const os = require("os");

  const archivePath = req.query.archive;
  if (!archivePath) {
    return res.status(400).json({ error: "archive query parameter is required" });
  }

  if (!fs.existsSync(archivePath)) {
    return res.status(404).json({ error: `Archive not found: ${archivePath}` });
  }

  const serverDir = __dirname;
  const projectDir = path.resolve(serverDir, "..");
  const exporterScript = path.join(serverDir, "metadata-exporter.cjs");
  const differScript = path.join(serverDir, "differ.py");
  const exportDefsDir = path.resolve(projectDir, "src", "metadata", "export", "definitions");

  const currentDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-diff-current-"));
  const incomingDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-diff-incoming-"));

  try {
    // 1. Export current metadata
    execSync(`node "${exporterScript}"`, {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
    });

    // Copy export definitions to temp dir
    const currentDefsDir = path.join(currentDir, "definitions");
    fs.mkdirSync(currentDefsDir, { recursive: true });
    if (fs.existsSync(exportDefsDir)) {
      const files = fs.readdirSync(exportDefsDir);
      for (const file of files) {
        const src = path.join(exportDefsDir, file);
        const dst = path.join(currentDefsDir, file);
        fs.copyFileSync(src, dst);
      }
    }

    // 2. Extract incoming archive
    execSync(`unzip -o "${archivePath}" -d "${incomingDir}"`, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    });

    // 3. Run the diff
    const result = execSync(
      `python3 "${differScript}" --current "${currentDir}" --incoming "${incomingDir}"`,
      {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60000,
        encoding: "utf-8",
      }
    );

    const diffData = JSON.parse(result.stdout);
    res.json(diffData);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    res.status(500).json({
      error: `Diff computation failed: ${err.message}`,
      stderr: stderr.slice(0, 2000),
    });
  } finally {
    // Cleanup temp dirs
    try {
      fs.rmSync(currentDir, { recursive: true, force: true });
    } catch {}
    try {
      fs.rmSync(incomingDir, { recursive: true, force: true });
    } catch {}
  }
});

// ─── Metadata Rollback API ──────────────────────────────

/**
 * POST /api/metadata/rollback/:backupId — rollback metadata from a backup
 *
 * Restores metadata from the backup archive identified by backupId.
 * The backup record is looked up from shared.metadata_backups.
 * Returns the rollback result.
 */
app.post("/api/metadata/rollback/:backupId", async (req, res) => {
  const { execSync } = require("child_process");
  const path = require("path");
  const fs = require("fs");

  const backupId = req.params.backupId;
  if (!backupId) {
    return res.status(400).json({ error: "Missing backupId parameter" });
  }

  const serverDir = __dirname;
  const projectDir = path.resolve(serverDir, "..");
  const rollbackScript = path.join(serverDir, "metadata-rollback.cjs");

  try {
    // First verify the backup exists in the DB
    const { rows } = await pool.query(
      "SELECT * FROM shared.metadata_backups WHERE id = $1",
      [backupId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: `Backup not found: ${backupId}` });
    }

    const backup = rows[0];

    // Check the backup file exists on disk
    if (!fs.existsSync(backup.path)) {
      return res.status(400).json({
        error: `Backup archive not found on disk: ${backup.path}`,
        backup,
      });
    }

    // Run the rollback script
    const result = execSync(
      `node "${rollbackScript}" --backup-id "${backupId}" --json`,
      {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 180000,
        encoding: "utf-8",
      }
    );

    const stdout = typeof result === "string" ? result : result.stdout?.toString() || "";
    const rollbackData = JSON.parse(stdout);

    if (rollbackData.success) {
      res.json({
        success: true,
        message: "Rollback completed successfully",
        backup: backup,
      });
    } else {
      res.status(500).json({ error: rollbackData.error });
    }
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    res.status(500).json({
      error: `Rollback failed: ${err.message}`,
      stderr: stderr.slice(0, 2000),
    });
  }
});

/**
 * POST /api/metadata/rollback/preview/:backupId — dry-run rollback
 *
 * Validates the backup archive without applying changes.
 * Returns the manifest info and validation result.
 */
app.post("/api/metadata/rollback/preview/:backupId", async (req, res) => {
  const { execSync } = require("child_process");
  const path = require("path");
  const fs = require("fs");

  const backupId = req.params.backupId;
  if (!backupId) {
    return res.status(400).json({ error: "Missing backupId parameter" });
  }

  const serverDir = __dirname;
  const projectDir = path.resolve(serverDir, "..");
  const rollbackScript = path.join(serverDir, "metadata-rollback.cjs");

  try {
    const { rows } = await pool.query(
      "SELECT * FROM shared.metadata_backups WHERE id = $1",
      [backupId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: `Backup not found: ${backupId}` });
    }

    const backup = rows[0];

    if (!fs.existsSync(backup.path)) {
      return res.status(400).json({
        error: `Backup archive not found on disk: ${backup.path}`,
        backup,
      });
    }

    // Run dry-run validation
    const result = execSync(
      `node "${rollbackScript}" --backup-id "${backupId}" --dry-run --json`,
      {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60000,
        encoding: "utf-8",
      }
    );

    const stdout = typeof result === "string" ? result : result.stdout?.toString() || "";
    const previewData = JSON.parse(stdout);

    if (previewData.success) {
      res.json({
        success: true,
        dryRun: true,
        backup,
        manifest: previewData.manifest,
      });
    } else {
      res.status(500).json({ error: previewData.error });
    }
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    res.status(500).json({
      error: `Rollback preview failed: ${err.message}`,
      stderr: stderr.slice(0, 2000),
    });
  }
});

// ─── Metadata Backup API ────────────────────────────────

/**
 * POST /api/metadata/backup — create a metadata backup
 *
 * Body (optional JSON):
 *   { "reason": "manual" }   — reason for the backup (default: "manual")
 *
 * Runs the full export + package pipeline, then records the backup
 * in shared.metadata_backups. Returns the backup record.
 */
app.post("/api/metadata/backup", async (req, res) => {
  const { execSync } = require("child_process");
  const path = require("path");
  const fs = require("fs");

  const reason = req.body?.reason || "manual";

  const serverDir = __dirname;
  const projectDir = path.resolve(serverDir, "..");
  const backupScript = path.join(serverDir, "metadata-backup.cjs");

  try {
    const result = execSync(
      `node "${backupScript}" --reason "${reason}" --json`,
      {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120000,
        encoding: "utf-8",
      }
    );

    // execSync with encoding returns stdout as string directly
    const stdout = typeof result === "string" ? result : result.stdout?.toString() || "";
    const backupData = JSON.parse(stdout);
    if (backupData.success) {
      res.status(201).json(backupData.backup);
    } else {
      res.status(500).json({ error: backupData.error });
    }
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    res.status(500).json({
      error: `Backup failed: ${err.message}`,
      stderr: stderr.slice(0, 2000),
    });
  }
});

/**
 * GET /api/metadata/backups — list all metadata backups
 *
 * Query params:
 *   ?limit=20     — max records to return (default: 20)
 *   ?reason=pre_import — filter by reason
 *
 * Returns an array of backup records, newest first.
 */
app.get("/api/metadata/backups", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "20", 10);
    let sql = "SELECT * FROM shared.metadata_backups";
    const params = [];

    if (req.query.reason) {
      sql += " WHERE reason = $1";
      params.push(req.query.reason);
    }

    sql += " ORDER BY created_at DESC LIMIT " + limit;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Report Definitions API ──────────────────────────────

/**
 * GET /api/reports/categories — list distinct categories
 */
app.get("/api/reports/categories", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT category FROM shared.report_definitions
       WHERE enabled = true
       ORDER BY category`
    );
    res.json(rows.map((r) => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports — list accessible report definitions
 *
 * Filters by visible_to_roles (user must have at least one matching role),
 * plus optional query params: category, format, enabled, search.
 */
app.get("/api/reports", async (req, res) => {
  try {
    const { extractUser, getUserRoleIds } = require("./permission-middleware.cjs");
    const { userId, companyId } = extractUser(req);
    const { roleNames, isAdmin } = await getUserRoleIds(userId, companyId);

    const { category, format, enabled, search } = req.query;
    const conditions = ["company_id = $1"];
    const params = [companyId];
    let idx = 2;

    // Admin sees all; others filtered by visible_to_roles overlap
    if (!isAdmin && roleNames.length > 0) {
      conditions.push(`(visible_to_roles = '{}' OR visible_to_roles && $${idx}::text[])`);
      params.push(roleNames);
      idx++;
    } else if (!isAdmin) {
      // No roles = no reports visible
      return res.json([]);
    }

    if (category) {
      conditions.push(`category = $${idx}`);
      params.push(category);
      idx++;
    }
    if (format) {
      conditions.push(`$${idx}::text = ANY(output_formats)`);
      params.push(format);
      idx++;
    }
    if (enabled !== undefined) {
      conditions.push(`enabled = $${idx}`);
      params.push(enabled === "true");
      idx++;
    }
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR caption ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const sql = `SELECT * FROM shared.report_definitions
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY category, name`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Report Schedule / Auto-Generation API ─────────────────
// NOTE: These routes MUST be defined BEFORE /api/reports/:id so Express
// matches literal paths (schedules, schedule-log) before the UUID param.

/**
 * GET /api/reports/schedules — list all reports with schedule info
 *
 * Returns each report that has auto_generate configured, along with
 * its last-run info from the schedule_log table.
 */
app.get("/api/reports/schedules", async (req, res) => {
  try {
    const { extractUser, getUserRoleIds } = require("./permission-middleware.cjs");
    const { userId, companyId } = extractUser(req);
    const { roleNames, isAdmin } = await getUserRoleIds(userId, companyId);

    const { rows } = await pool.query(
      `SELECT rd.id, rd.name, rd.caption, rd.category, rd.auto_generate,
              rd.enabled, rd.output_formats,
              sl.last_run_at, sl.last_status, sl.last_output,
              sl.last_format, sl.last_error,
              sl.total_runs, sl.success_runs, sl.error_runs
       FROM shared.report_definitions rd
       LEFT JOIN LATERAL shared.fn_get_report_last_run(rd.id) sl ON true
       WHERE rd.company_id = $1
         AND rd.auto_generate IS NOT NULL
         ${isAdmin ? "" : "AND (rd.visible_to_roles = '{}' OR rd.visible_to_roles && $2::text[])"}
       ORDER BY rd.category, rd.name`,
      isAdmin ? [companyId] : [companyId, roleNames]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/schedule-log — view recent generation log entries
 *
 * Query params:
 *   ?limit=20        — max entries (default 20, max 100)
 *   ?status=error    — filter by status
 *   ?report_id=...   — filter by report
 */
app.get("/api/reports/schedule-log", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.query.status) {
      conditions.push(`sl.status = $${idx++}`);
      params.push(req.query.status);
    }
    if (req.query.report_id) {
      conditions.push(`sl.report_id = $${idx++}`);
      params.push(req.query.report_id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT sl.*, rd.caption, rd.category
       FROM shared.report_schedule_log sl
       LEFT JOIN shared.report_definitions rd ON sl.report_id = rd.id
       ${where}
       ORDER BY sl.created_at DESC
       LIMIT $${idx}`,
      [...params, limit]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/:id/schedule-log — per-report generation log entries
 */
app.get("/api/reports/:id/schedule-log", async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

    const { rows } = await pool.query(
      `SELECT * FROM shared.report_schedule_log
       WHERE report_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, limit]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/reports/:id/schedule — update auto_generate schedule config
 *
 * Body: { cron: "daily"|"weekly"|"monthly", format: "pdf"|"csv"|"xlsx",
 *         recipients: string[], subject?: string }
 * Pass empty object {} to clear the schedule.
 */
app.put("/api/reports/:id/schedule", async (req, res) => {
  try {
    const { extractUser, getUserRoleIds } = require("./permission-middleware.cjs");
    const { userId, companyId } = extractUser(req);
    const { isAdmin } = await getUserRoleIds(userId, companyId);

    if (!isAdmin) {
      return res.status(403).json({ error: "Admin role required to update report schedules" });
    }

    const { id } = req.params;
    const { cron, format, recipients, subject } = req.body;

    // Determine if we're setting or clearing the schedule
    let autoGenerateValue;
    if (!cron && !format && !recipients && !subject) {
      // Clear the schedule (pass null)
      autoGenerateValue = null;
    } else {
      // Validate cron expression
      const validCron = ["daily", "weekly", "monthly"];
      if (cron && !validCron.includes(cron) && !/^(\d+|\*)\s+(\d+|\*)\s+(\d+|\*)\s+(\d+|\*)\s+(\d+|\*)$/.test(cron)) {
        return res.status(400).json({
          error: `Invalid cron expression. Use one of: ${validCron.join(", ")} or a standard 5-field cron expression`,
        });
      }

      const schedule = {
        cron: cron || "daily",
        format: format || "pdf",
        recipients: recipients || [],
      };
      if (subject) schedule.subject = subject;
      autoGenerateValue = JSON.stringify(schedule);
    }

    const { rows } = await pool.query(
      `UPDATE shared.report_definitions
       SET auto_generate = $1::jsonb,
           updated_by = $3,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [autoGenerateValue, id, req.headers["x-user-name"] || null]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Report definition not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/reports/:id/schedule — remove the auto_generate schedule
 */
app.delete("/api/reports/:id/schedule", async (req, res) => {
  try {
    const { extractUser, getUserRoleIds } = require("./permission-middleware.cjs");
    const { userId, companyId } = extractUser(req);
    const { isAdmin } = await getUserRoleIds(userId, companyId);

    if (!isAdmin) {
      return res.status(403).json({ error: "Admin role required to remove report schedules" });
    }

    const { id } = req.params;

    const { rows } = await pool.query(
      `UPDATE shared.report_definitions
       SET auto_generate = NULL,
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, req.headers["x-user-name"] || null]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Report definition not found" });
    }

    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/reports/:id/generate — manually trigger report generation
 *
 * Triggers the full render pipeline for a report, using the same
 * logic as the cron script. Also logs the run to report_schedule_log.
 *
 * Body: { format?: string, parameters?: Record<string, unknown> }
 * If no parameters are provided, uses empty defaults.
 */
app.post("/api/reports/:id/generate", async (req, res) => {
  try {
    const { id } = req.params;
    const { format, parameters = {} } = req.body;

    // Fetch the report definition
    const { rows } = await pool.query(
      `SELECT * FROM shared.report_definitions WHERE id = $1 AND enabled = true`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Report definition not found or disabled" });
    }

    const report = rows[0];
    const outputFormat = format || (report.auto_generate && report.auto_generate.format) || report.output_formats[0] || "pdf";

    // Validate format
    if (!report.output_formats.includes(outputFormat)) {
      return res.status(400).json({
        error: `Format '${outputFormat}' not allowed. Allowed: ${report.output_formats.join(", ")}`,
      });
    }

    // Log the run start
    const logResult = await pool.query(
      `INSERT INTO shared.report_schedule_log
       (report_id, report_name, caption, triggered_by, format, status, parameters)
       VALUES ($1, $2, $3, 'manual', $4, 'running', $5::jsonb)
       RETURNING id`,
      [report.id, report.name, report.caption, outputFormat, JSON.stringify(parameters)]
    );
    const logId = logResult.rows[0].id;

    // Use the same generation logic as the cron script
    const { spawn } = require("child_process");
    const path = require("path");
    const fs = require("fs");

    const serverDir = __dirname;
    const templateDir = path.resolve(serverDir, "templates");
    const outputDir = path.resolve(serverDir, "output");
    const dataFetcher = path.resolve(serverDir, "reports/data_fetcher.py");
    const rendererScript = path.resolve(serverDir, "reports/renderer.py");

    // Prefer the project venv Python
    const pythonBin = path.resolve(serverDir, "..", ".venv", "bin", "python3");
    const pythonExists = fs.existsSync(pythonBin);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Strip "templates/" prefix
    let templateFile = report.template_file;
    if (templateFile.startsWith("templates/")) {
      templateFile = templateFile.slice("templates/".length);
    }

    const templatePath = path.resolve(templateDir, templateFile);
    if (!fs.existsSync(templatePath)) {
      await pool.query(
        `UPDATE shared.report_schedule_log SET status = 'error', error_message = $2, finished_at = NOW() WHERE id = $1`,
        [logId, `Template file not found: ${templatePath}`]
      );
      return res.status(500).json({ error: `Template file not found: ${templatePath}` });
    }

    const reportName = report.name;
    const paramsJson = JSON.stringify(parameters);

    // Step 1: Call data_fetcher.py
    const dataResult = await new Promise((resolve, reject) => {
      const child = spawn(pythonExists ? pythonBin : "python3", [dataFetcher, reportName, paramsJson], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
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

    let reportData;
    try {
      reportData = JSON.parse(dataResult);
    } catch {
      const errMsg = "Failed to parse data_fetcher output";
      await pool.query(
        `UPDATE shared.report_schedule_log SET status = 'error', error_message = $2, finished_at = NOW() WHERE id = $1`,
        [logId, errMsg]
      );
      return res.status(500).json({ error: errMsg, details: dataResult });
    }

    // Write data to temp file
    const dataFilePath = path.resolve(outputDir, `${reportName}_data_${Date.now()}.json`);
    fs.writeFileSync(dataFilePath, JSON.stringify(reportData, null, 2), "utf-8");

    // Step 2: Call renderer.py
    const outputFileName = `${reportName}_${Date.now()}.${outputFormat}`;
    const outputPath = path.resolve(outputDir, outputFileName);

    const renderArgs = [
      "--template", templatePath,
      "--data", dataFilePath,
      "--output", outputPath,
      "--format", outputFormat,
    ];

    if (report.bands && Object.keys(report.bands).length > 0) {
      const bandConfigPath = path.resolve(outputDir, `${reportName}_bands_${Date.now()}.json`);
      fs.writeFileSync(bandConfigPath, JSON.stringify(report.bands, null, 2), "utf-8");
      renderArgs.push("--band-config", bandConfigPath);
    }

    const renderResult = await new Promise((resolve, reject) => {
      const child = spawn(pythonExists ? pythonBin : "python3", [rendererScript, ...renderArgs], {
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

    // Clean up temp files
    try {
      if (fs.existsSync(dataFilePath)) fs.unlinkSync(dataFilePath);
      const bandConfigPath = path.resolve(outputDir, `${reportName}_bands_${Date.now()}.json`);
      if (fs.existsSync(bandConfigPath)) fs.unlinkSync(bandConfigPath);
    } catch { /* ignore */ }

    // Verify output
    let finalPath = outputPath;
    if (!fs.existsSync(outputPath)) {
      const base = path.basename(templatePath, ".ods");
      const altPath = path.resolve(outputDir, `${base}.${outputFormat}`);
      if (fs.existsSync(altPath)) {
        finalPath = altPath;
      } else {
        await pool.query(
          `UPDATE shared.report_schedule_log SET status = 'error', error_message = $2, finished_at = NOW() WHERE id = $1`,
          [logId, "Renderer did not produce output file"]
        );
        return res.status(500).json({ error: "Renderer did not produce output file", details: renderResult });
      }
    }

    const stats = fs.statSync(finalPath);

    // Log success
    await pool.query(
      `UPDATE shared.report_schedule_log
       SET status = 'success', output_file = $2, output_size = $3, finished_at = NOW()
       WHERE id = $1`,
      [logId, finalPath, stats.size]
    );

    res.json({
      success: true,
      output: finalPath,
      outputFileName: path.basename(finalPath),
      outputSize: stats.size,
      url: `/api/reports/output/${path.basename(finalPath)}`,
      logId: logId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/:id — get single report definition by UUID
 */
app.get("/api/reports/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM shared.report_definitions WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Report definition not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/reports — create a new report definition (admin only)
 */
app.post("/api/reports", async (req, res) => {
  try {
    const { extractUser, getUserRoleIds } = require("./permission-middleware.cjs");
    const { userId, companyId } = extractUser(req);
    const { isAdmin } = await getUserRoleIds(userId, companyId);

    if (!isAdmin) {
      return res.status(403).json({ error: "Admin role required to create report definitions" });
    }

    const {
      name, caption, description, category, template_file,
      output_formats, source_table, filterable, parameters,
      bands, visible_to_roles, auto_generate, enabled,
    } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!caption || typeof caption !== "string" || !caption.trim()) {
      return res.status(400).json({ error: "caption is required" });
    }
    if (!template_file || typeof template_file !== "string" || !template_file.trim()) {
      return res.status(400).json({ error: "template_file is required" });
    }

    const { rows } = await pool.query(
      `INSERT INTO shared.report_definitions
       (name, caption, description, category, template_file,
        output_formats, source_table, filterable, parameters,
        bands, visible_to_roles, auto_generate, enabled,
        company_id, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        name.trim(),
        caption.trim(),
        description || null,
        category || "Other",
        template_file.trim(),
        output_formats || ["pdf"],
        source_table || null,
        filterable !== undefined ? filterable : false,
        parameters ? JSON.stringify(parameters) : "[]",
        bands ? JSON.stringify(bands) : "{}",
        visible_to_roles || [],
        auto_generate ? JSON.stringify(auto_generate) : null,
        enabled !== undefined ? enabled : true,
        companyId,
        req.headers["x-user-name"] || null,
        req.headers["x-user-name"] || null,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A report definition with this name already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/reports/:id — update a report definition (admin only)
 */
app.put("/api/reports/:id", async (req, res) => {
  try {
    const { extractUser, getUserRoleIds } = require("./permission-middleware.cjs");
    const { userId, companyId } = extractUser(req);
    const { isAdmin } = await getUserRoleIds(userId, companyId);

    if (!isAdmin) {
      return res.status(403).json({ error: "Admin role required to update report definitions" });
    }

    const { id } = req.params;
    const {
      name, caption, description, category, template_file,
      output_formats, source_table, filterable, parameters,
      bands, visible_to_roles, auto_generate, enabled,
    } = req.body;

    // Build dynamic SET clause
    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name.trim()); }
    if (caption !== undefined) { sets.push(`caption = $${idx++}`); params.push(caption.trim()); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description || null); }
    if (category !== undefined) { sets.push(`category = $${idx++}`); params.push(category); }
    if (template_file !== undefined) { sets.push(`template_file = $${idx++}`); params.push(template_file.trim()); }
    if (output_formats !== undefined) { sets.push(`output_formats = $${idx++}`); params.push(output_formats); }
    if (source_table !== undefined) { sets.push(`source_table = $${idx++}`); params.push(source_table || null); }
    if (filterable !== undefined) { sets.push(`filterable = $${idx++}`); params.push(filterable); }
    if (parameters !== undefined) { sets.push(`parameters = $${idx++}::jsonb`); params.push(JSON.stringify(parameters)); }
    if (bands !== undefined) { sets.push(`bands = $${idx++}::jsonb`); params.push(JSON.stringify(bands)); }
    if (visible_to_roles !== undefined) { sets.push(`visible_to_roles = $${idx++}`); params.push(visible_to_roles); }
    if (auto_generate !== undefined) { sets.push(`auto_generate = $${idx++}::jsonb`); params.push(auto_generate ? JSON.stringify(auto_generate) : null); }
    if (enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(enabled); }

    sets.push(`updated_by = $${idx++}`);
    params.push(req.headers["x-user-name"] || null);

    if (sets.length === 1) {
      return res.status(400).json({ error: "No fields to update" });
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE shared.report_definitions
       SET ${sets.join(", ")}
       WHERE id = $${idx}
       RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Report definition not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A report definition with this name already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/reports/:id — soft-delete (set enabled=false, admin only)
 */
app.delete("/api/reports/:id", async (req, res) => {
  try {
    const { extractUser, getUserRoleIds } = require("./permission-middleware.cjs");
    const { userId, companyId } = extractUser(req);
    const { isAdmin } = await getUserRoleIds(userId, companyId);

    if (!isAdmin) {
      return res.status(403).json({ error: "Admin role required to delete report definitions" });
    }

    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE shared.report_definitions
       SET enabled = false, updated_by = $2, updated_at = NOW()
       WHERE id = $1 AND enabled = true
       RETURNING *`,
      [id, req.headers["x-user-name"] || null]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Report definition not found or already disabled" });
    }
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Report Render & Lookup API ─────────────────────────

/**
 * POST /api/reports/lookup/:table — fetch id + name rows for a lookup dropdown
 *
 * Used by the parameter form when a ReportParameter has type="lookup".
 * Returns { value, label }[] where value = the PK column, label = the name column.
 * Supports optional search query param for filtering.
 */
app.post("/api/reports/lookup/:table", async (req, res) => {
  try {
    const { table } = req.params;
    const { search, idColumn, labelColumn } = req.body || {};

    // Sanitise: alphanumeric + underscore only — prevents SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      return res.status(400).json({ error: "Invalid table name" });
    }

    // Detect common PK and label columns
    const idCol = idColumn || "id";
    const labelCol = labelColumn || "name";

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(idCol) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(labelCol)) {
      return res.status(400).json({ error: "Invalid column names" });
    }

    let sql = `SELECT DISTINCT "${idCol}" AS value, "${labelCol}" AS label
               FROM db_fcc_erp.${table}`;
    const params = [];

    if (search && typeof search === "string" && search.trim()) {
      sql += ` WHERE "${labelCol}" ILIKE $1`;
      params.push(`%${search.trim()}%`);
    }

    sql += ` ORDER BY "${labelCol}" LIMIT 500`;

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/reports/:id/render — render a report with parameters
 *
 * Fetches the report definition, queries data via data_fetcher.py, then
 * shells out to the Python rendering engine (server/reports/renderer.py).
 * Returns a download URL for the generated file.
 *
 * Body: { parameters: Record<string, unknown>, format?: string }
 */
app.post("/api/reports/:id/render", async (req, res) => {
  try {
    const { id } = req.params;
    const { parameters = {}, format = "pdf" } = req.body;

    // Fetch the report definition
    const { rows } = await pool.query(
      `SELECT * FROM shared.report_definitions WHERE id = $1 AND enabled = true`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Report definition not found or disabled" });
    }

    const report = rows[0];

    // Validate format is in allowed list
    if (!report.output_formats.includes(format)) {
      return res.status(400).json({
        error: `Format '${format}' not allowed. Allowed: ${report.output_formats.join(", ")}`,
      });
    }

    // Validate required parameters
    const params = report.parameters || [];
    const missing = [];
    for (const p of params) {
      if (p.required && (parameters[p.name] === undefined || parameters[p.name] === null || parameters[p.name] === "")) {
        missing.push(p.label || p.name);
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required parameters: ${missing.join(", ")}`,
      });
    }

    const { spawn } = require("child_process");
    const path = require("path");
    const fs = require("fs");

    const serverDir = __dirname;
    const templateDir = path.resolve(serverDir, "templates");
    const outputDir = path.resolve(serverDir, "output");
    const dataFetcher = path.resolve(serverDir, "reports/data_fetcher.py");
    const rendererScript = path.resolve(serverDir, "reports/renderer.py");

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Strip "templates/" prefix from template_file if present (seed data stores it)
    let templateFile = report.template_file;
    if (templateFile.startsWith("templates/")) {
      templateFile = templateFile.slice("templates/".length);
    }

    const templatePath = path.resolve(templateDir, templateFile);
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({
        error: `Template file not found: ${templatePath}`,
      });
    }

    // Step 1: Call data_fetcher.py to get report data
    const reportName = report.name;
    const paramsJson = JSON.stringify(parameters);

    // Use the project venv Python if available (has odfpy + psycopg2)
    const pythonBin = path.resolve(serverDir, "..", ".venv", "bin", "python3");
    const pythonExists = fs.existsSync(pythonBin);

    const dataResult = await new Promise((resolve, reject) => {
      const child = spawn(pythonExists ? pythonBin : "python3", [dataFetcher, reportName, paramsJson], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
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

    // Parse the data JSON
    let reportData;
    try {
      reportData = JSON.parse(dataResult);
    } catch {
      return res.status(500).json({
        error: "Failed to parse data_fetcher output",
        details: dataResult,
      });
    }

    // Write data to a temp JSON file for the renderer
    const dataFilePath = path.resolve(outputDir, `${reportName}_data.json`);
    fs.writeFileSync(dataFilePath, JSON.stringify(reportData, null, 2), "utf-8");

    // Step 2: Call renderer.py with the data and band config
    const outputFileName = `${reportName}_${Date.now()}.${format}`;
    const outputPath = path.resolve(outputDir, outputFileName);

    const renderArgs = [
      rendererScript,
      "--template", templatePath,
      "--data", dataFilePath,
      "--output", outputPath,
      "--format", format,
    ];

    // Pass band config if the report has one
    if (report.bands && Object.keys(report.bands).length > 0) {
      const bandConfigPath = path.resolve(outputDir, `${reportName}_bands.json`);
      fs.writeFileSync(bandConfigPath, JSON.stringify(report.bands, null, 2), "utf-8");
      renderArgs.push("--band-config", bandConfigPath);
    }

    const renderResult = await new Promise((resolve, reject) => {
      const child = spawn(pythonExists ? pythonBin : "python3", renderArgs, {
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

    // Clean up temp files
    try {
      if (fs.existsSync(dataFilePath)) fs.unlinkSync(dataFilePath);
      const bandConfigPath = path.resolve(outputDir, `${reportName}_bands.json`);
      if (fs.existsSync(bandConfigPath)) fs.unlinkSync(bandConfigPath);
    } catch { /* ignore cleanup errors */ }

    // Verify output exists
    if (!fs.existsSync(outputPath)) {
      // Try alternate output — renderer may have used its own naming
      const base = path.basename(templatePath, ".ods");
      const altPath = path.resolve(outputDir, `${base}.${format}`);
      if (fs.existsSync(altPath)) {
        return res.json({
          success: true,
          output: altPath,
          url: `/api/reports/output/${path.basename(altPath)}`,
        });
      }
      return res.status(500).json({
        error: "Renderer did not produce output file",
        details: renderResult,
      });
    }

    res.json({
      success: true,
      output: outputPath,
      url: `/api/reports/output/${path.basename(outputPath)}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/output/:file — serve a rendered report file
 */
app.get("/api/reports/output/:file", async (req, res) => {
  const path = require("path");
  const fs = require("fs");

  const fileName = req.params.file;
  // Sanitize: only allow alphanumeric, dash, dot, underscore
  if (!/^[\w.-]+$/.test(fileName)) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  const outputDir = path.resolve(__dirname, "output");
  const filePath = path.resolve(outputDir, fileName);

  // Ensure the resolved path is within outputDir (path traversal protection)
  if (!filePath.startsWith(outputDir)) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `File not found: ${fileName}` });
  }

  // Determine content type based on extension
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes = {
    ".pdf": "application/pdf",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".html": "text/html",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  };
  const contentType = contentTypes[ext] || "application/octet-stream";

  // Determine disposition: inline for PDF/HTML, attachment for downloads
  const disposition = ext === ".pdf" || ext === ".html" ? "inline" : "attachment";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `${disposition}; filename="${fileName}"`);
  res.setHeader("Content-Length", fs.statSync(filePath).size);
  fs.createReadStream(filePath).pipe(res);
});

// ─── Start ────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Roastery API running on http://localhost:${PORT}`);
});