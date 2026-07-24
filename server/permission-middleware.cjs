/**
 * permission-middleware.cjs — RBAC permission enforcement for Express
 *
 * Exports:
 *   checkPermission(tableName, action, userRoleIds, companyId)
 *   applyRowFilter(tableName, userRoleIds, companyId)
 *   permissionGuard(tableNameExtractor, actionMap)
 *   extractUser(req)
 *   getUserRoleIds(userId, companyId)
 *   parseTableNamesFromSql(sql)
 *
 * Placeholder auth: reads X-User-Id / X-Company-Id headers (defaults 1).
 * Admin role (name = 'admin') bypasses all permission checks.
 */

const { Pool } = require("pg");
const { PermissionCache } = require("./permission-cache.cjs");

const pool = new Pool({ database: "polyaccess" });

// ─── Permission cache (shared singleton) ──────────────────
// Exported so server/index.cjs can invalidate on writes.
const permCache = new PermissionCache();

// ─── Permission check —────────────────────────────────────

/**
 * Check whether a set of roles has a given action on a table.
 * @param {string} tableName
 * @param {string} action — 'select' | 'insert' | 'update' | 'delete'
 * @param {number[]} userRoleIds
 * @param {number} companyId
 * @returns {Promise<boolean>}
 */
async function checkPermission(tableName, action, userRoleIds, companyId) {
  if (!userRoleIds || userRoleIds.length === 0) return false;

  // Check cache first
  const cacheKey = permCache.permKey(tableName, action, userRoleIds, companyId);
  const cached = permCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { rows } = await pool.query(
    `SELECT bool_or(can_select) AS can_select,
            bool_or(can_insert) AS can_insert,
            bool_or(can_update) AS can_update,
            bool_or(can_delete) AS can_delete
     FROM shared.table_permissions
     WHERE role_id = ANY($1::int[])
       AND table_name = $2
       AND company_id = $3`,
    [userRoleIds, tableName, companyId]
  );

  if (rows.length === 0) {
    permCache.set(cacheKey, false);
    return false;
  }
  const result = !!rows[0][`can_${action}`];
  permCache.set(cacheKey, result);
  return result;
}

// ─── Row-level filter —────────────────────────────────────

/**
 * Fetch row-level SQL filter fragments for a user's roles on a table.
 * Returns a combined SQL WHERE fragment (without WHERE keyword), or null.
 * @param {string} tableName
 * @param {number[]} userRoleIds
 * @param {number} companyId
 * @returns {Promise<string|null>}
 */
async function applyRowFilter(tableName, userRoleIds, companyId) {
  if (!userRoleIds || userRoleIds.length === 0) return null;

  // Check cache first
  const cacheKey = permCache.filterKey(tableName, userRoleIds, companyId);
  const cached = permCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { rows } = await pool.query(
    `SELECT filter_sql FROM shared.row_filters
     WHERE role_id = ANY($1::int[])
       AND table_name = $2
       AND company_id = $3
       AND enabled = true
     ORDER BY id`,
    [userRoleIds, tableName, companyId]
  );

  const fragments = rows.filter((r) => r.filter_sql).map((r) => r.filter_sql);
  if (fragments.length === 0) {
    permCache.set(cacheKey, null);
    return null;
  }
  const result = fragments.join(" AND ");
  permCache.set(cacheKey, result);
  return result;
}

// ─── Placeholder auth —────────────────────────────────────

/**
 * Extract user identity from request headers.
 * Falls back to user_id=1, company_id=1.
 * @returns {{ userId: number, companyId: number }}
 */
function extractUser(req) {
  const userId = parseInt(req.headers["x-user-id"], 10) || 1;
  const companyId = parseInt(req.headers["x-company-id"], 10) || 1;
  return { userId, companyId };
}

/**
 * Look up a user's role IDs and check for admin status.
 * @returns {Promise<{ roleIds: number[], roleNames: string[], isAdmin: boolean }>}
 */
async function getUserRoleIds(userId, companyId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.name
     FROM shared.user_roles ur
     JOIN shared.roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
       AND ur.company_id = $2
       AND r.is_active = true
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
    [userId, companyId]
  );

  return {
    roleIds: rows.map((r) => r.id),
    roleNames: rows.map((r) => r.name),
    isAdmin: rows.some((r) => r.name === "admin"),
  };
}

// ─── SQL table-name extraction (for /api/lookup) ──────────

/**
 * Crude SQL parser to extract table names from the FROM clause.
 * Handles: FROM table, FROM schema.table, FROM "schema"."table",
 * FROM table alias, JOIN table, and multi-table FROM clauses.
 * @param {string} sql
 * @returns {string[]}
 */
function parseTableNamesFromSql(sql) {
  if (!sql || typeof sql !== "string") return [];

  const names = [];
  // Strip string literals to avoid false matches
  let cleaned = sql.replace(/'[^']*'/g, "");
  cleaned = cleaned.replace(/"[^"]*"/g, "");

  // Match FROM / JOIN clauses
  const re = /(?:FROM|JOIN)\s+([^\s,()]+)/gi;
  let match;
  while ((match = re.exec(cleaned)) !== null) {
    let name = match[1].replace(/"/g, "").trim();
    // Strip alias if present — alias is a bare word that follows the table name
    // but isn't a keyword. We take the first part before any space.
    name = name.split(/\s+/)[0];
    // Remove schema prefix if present (e.g., db_fcc_erp.orders -> orders)
    // but keep shared schema prefix (shared.objects -> shared.objects)
    if (name.includes(".") && !name.startsWith("shared.")) {
      name = name.split(".")[1];
    }
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

// ─── Express middleware factory —───────────────────────────

const DEFAULT_ACTION_MAP = {
  GET: "select",
  POST: "insert",
  PUT: "update",
  DELETE: "delete",
};

/**
 * Create an Express middleware that enforces table-level permissions.
 *
 * @param {Function} tableNameExtractor - (req) => string | string[]
 *   Extracts the table name(s) from the request.
 * @param {Object} [actionMap] - Custom HTTP method → action mapping.
 *   Merged over the default { GET: 'select', POST: 'insert', PUT: 'update', DELETE: 'delete' }.
 * @returns {Function} Express middleware (req, res, next)
 */
function permissionGuard(tableNameExtractor, actionMap = {}) {
  const resolvedActionMap = { ...DEFAULT_ACTION_MAP, ...actionMap };

  return async (req, res, next) => {
    try {
      const { userId, companyId } = extractUser(req);
      const { roleIds, roleNames, isAdmin } = await getUserRoleIds(userId, companyId);

      // Admin bypass — all permissions granted
      if (isAdmin) {
        req.user = { userId, companyId, roleIds, roleNames, isAdmin: true };
        return next();
      }

      // No roles = no access
      if (roleIds.length === 0) {
        return res.status(403).json({
          error: "Access denied — no roles assigned to this user",
        });
      }

      // Resolve the table name(s) from the request
      const tableNames = tableNameExtractor(req);
      const names = Array.isArray(tableNames) ? tableNames : [tableNames];

      if (names.length === 0 || (names.length === 1 && !names[0])) {
        // No table to check — let it through
        req.user = { userId, companyId, roleIds, roleNames, isAdmin: false };
        return next();
      }

      // Map HTTP method to action
      const method = req.method.toUpperCase();
      const action = resolvedActionMap[method];

      if (!action) {
        // Unknown method — pass through (shouldn't happen with standard verbs)
        req.user = { userId, companyId, roleIds, roleNames, isAdmin: false };
        return next();
      }

      // Check each table
      for (const tableName of names) {
        const permitted = await checkPermission(tableName, action, roleIds, companyId);
        if (!permitted) {
          return res.status(403).json({
            error: `Permission denied: cannot ${action} on ${tableName}`,
          });
        }
      }

      // Store user context on request for downstream handlers
      req.user = { userId, companyId, roleIds, roleNames, isAdmin: false };
      next();
    } catch (err) {
      console.error("Permission middleware error:", err.message);
      // Fail secure — deny on error
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}

module.exports = {
  checkPermission,
  applyRowFilter,
  permissionGuard,
  extractUser,
  getUserRoleIds,
  parseTableNamesFromSql,
  permCache,
};