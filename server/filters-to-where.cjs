/**
 * filters-to-where.cjs — Filter → SQL WHERE clause translation
 *
 * Translates structured filter definitions into parameterized SQL WHERE
 * clauses, with proper type handling for each filter type (text ILIKE,
 * number range, date range, boolean, lookup equality).
 *
 * Primary entry:
 *   filtersToWhereClause(filters, { columnTypes? })
 *     → { whereClause: string, params: any[] }
 *
 * Accepts both:
 *   1. Array of structured filter objects (preferred)
 *   2. A raw SQL expression string (backward compat)
 *
 * Structured filter format:
 *   { field: string, operator: string, value?: any, min?: any, max?: any,
 *     type?: "text"|"number"|"date"|"boolean"|"lookup" }
 *
 * Operators by type:
 *   text       → ILIKE, NOT_ILIKE, EQ, NEQ
 *   number     → RANGE (=, <>, >, >=, <, <=, EQ, NEQ, RANGE)
 *   date       → RANGE (=, <>, >, >=, <, <=, EQ, NEQ, RANGE)
 *   boolean    → EQ (= only)
 *   lookup     → EQ, NEQ
 */

// ─── Parameter counter (per-call) ─────────────────────

let _nextParamIndex = 1;

function resetParamIndex() {
  _nextParamIndex = 1;
}

function nextParam() {
  return `$${_nextParamIndex++}`;
}

// ─── Operator normalization ────────────────────────────

const OPERATOR_ALIASES = {
  eq: "EQ",
  ne: "NEQ",
  neq: "NEQ",
  not_equal: "NEQ",
  not_equals: "NEQ",
  "<>": "NEQ",
  "!=": "NEQ",
  gt: "GT",
  ">": "GT",
  gte: "GTE",
  ">=": "GTE",
  ">=": "GTE",
  lt: "LT",
  "<": "LT",
  lte: "LTE",
  "<=": "LTE",
  ilike: "ILIKE",
  like: "ILIKE",
  not_ilike: "NOT_ILIKE",
  not_like: "NOT_ILIKE",
  contains: "ILIKE",
  not_contains: "NOT_ILIKE",
  starts_with: "STARTS_WITH",
  ends_with: "ENDS_WITH",
  range: "RANGE",
  between: "RANGE",
  "=": "EQ",
  "==": "EQ",
};

function normalizeOperator(op) {
  if (!op) return "EQ";
  const normalized = String(op).toLowerCase().trim();
  return OPERATOR_ALIASES[normalized] || normalized.toUpperCase();
}

// ─── Type-specific clause builders ─────────────────────

function textClause(filter, params) {
  const field = `"${filter.field}"`;
  // Default to ILIKE when no operator is specified (contains search)
  const rawOp = filter.operator;
  const op = rawOp ? normalizeOperator(rawOp) : "ILIKE";
  const value = filter.value != null ? String(filter.value) : "";

  // Escape single quotes in the value itself for ILIKE patterns
  const escaped = value.replace(/'/g, "''");

  // For the ILIKE pattern we need to inline the pattern because pg
  // doesn't accept % as a parameter value — it treats it literally.
  // We build the pattern string with proper escaping.
  switch (op) {
    case "ILIKE":
    case "CONTAINS": {
      const p = nextParam();
      params.push(`%${escaped}%`);
      return `${field} ILIKE ${p}`;
    }
    case "NOT_ILIKE":
    case "NOT_CONTAINS": {
      const p = nextParam();
      params.push(`%${escaped}%`);
      return `${field} NOT ILIKE ${p}`;
    }
    case "STARTS_WITH": {
      const p = nextParam();
      params.push(`${escaped}%`);
      return `${field} ILIKE ${p}`;
    }
    case "ENDS_WITH": {
      const p = nextParam();
      params.push(`%${escaped}`);
      return `${field} ILIKE ${p}`;
    }
    case "EQ": {
      const p = nextParam();
      params.push(value);
      return `${field} = ${p}`;
    }
    case "NEQ": {
      const p = nextParam();
      params.push(value);
      return `${field} != ${p}`;
    }
    default: {
      const p = nextParam();
      params.push(`%${escaped}%`);
      return `${field} ILIKE ${p}`;
    }
  }
}

function numberClause(filter, params) {
  const field = `"${filter.field}"`;
  const op = normalizeOperator(filter.operator);

  switch (op) {
    case "EQ": {
      if (filter.value == null) return null;
      const p = nextParam();
      params.push(Number(filter.value));
      return `${field} = ${p}`;
    }
    case "NEQ": {
      if (filter.value == null) return null;
      const p = nextParam();
      params.push(Number(filter.value));
      return `${field} != ${p}`;
    }
    case "GT": {
      if (filter.value == null) return null;
      const p = nextParam();
      params.push(Number(filter.value));
      return `${field} > ${p}`;
    }
    case "GTE": {
      if (filter.value == null) return null;
      const p = nextParam();
      params.push(Number(filter.value));
      return `${field} >= ${p}`;
    }
    case "LT": {
      if (filter.value == null) return null;
      const p = nextParam();
      params.push(Number(filter.value));
      return `${field} < ${p}`;
    }
    case "LTE": {
      if (filter.value == null) return null;
      const p = nextParam();
      params.push(Number(filter.value));
      return `${field} <= ${p}`;
    }
    case "RANGE":
    case "BETWEEN": {
      const parts = [];
      if (filter.min != null && filter.min !== "") {
        const p = nextParam();
        params.push(Number(filter.min));
        parts.push(`${field} >= ${p}`);
      }
      if (filter.max != null && filter.max !== "") {
        const p = nextParam();
        params.push(Number(filter.max));
        parts.push(`${field} <= ${p}`);
      }
      return parts.length > 0 ? parts.join(" AND ") : null;
    }
    default: {
      // Fallback: treat as EQ
      if (filter.value == null) return null;
      const p = nextParam();
      params.push(Number(filter.value));
      return `${field} = ${p}`;
    }
  }
}

function dateClause(filter, params) {
  const field = `"${filter.field}"`;
  const op = normalizeOperator(filter.operator);

  // Validate date strings are non-empty
  function isValidDate(d) {
    return d != null && d !== "" && !isNaN(Date.parse(d));
  }

  switch (op) {
    case "EQ": {
      if (!isValidDate(filter.value)) return null;
      const p = nextParam();
      params.push(filter.value);
      return `${field} = ${p}::date`;
    }
    case "NEQ": {
      if (!isValidDate(filter.value)) return null;
      const p = nextParam();
      params.push(filter.value);
      return `${field} != ${p}::date`;
    }
    case "GT": {
      if (!isValidDate(filter.value)) return null;
      const p = nextParam();
      params.push(filter.value);
      return `${field} > ${p}::date`;
    }
    case "GTE": {
      if (!isValidDate(filter.value)) return null;
      const p = nextParam();
      params.push(filter.value);
      return `${field} >= ${p}::date`;
    }
    case "LT": {
      if (!isValidDate(filter.value)) return null;
      const p = nextParam();
      params.push(filter.value);
      return `${field} < ${p}::date`;
    }
    case "LTE": {
      if (!isValidDate(filter.value)) return null;
      const p = nextParam();
      params.push(filter.value);
      return `${field} <= ${p}::date`;
    }
    case "RANGE":
    case "BETWEEN": {
      const parts = [];
      if (isValidDate(filter.min)) {
        const p = nextParam();
        params.push(filter.min);
        parts.push(`${field} >= ${p}::date`);
      }
      if (isValidDate(filter.max)) {
        const p = nextParam();
        params.push(filter.max);
        parts.push(`${field} <= ${p}::date`);
      }
      return parts.length > 0 ? parts.join(" AND ") : null;
    }
    default: {
      if (!isValidDate(filter.value)) return null;
      const p = nextParam();
      params.push(filter.value);
      return `${field} = ${p}::date`;
    }
  }
}

function booleanClause(filter, params) {
  const field = `"${filter.field}"`;
  const op = normalizeOperator(filter.operator);

  if (op === "EQ" || op === "=") {
    if (filter.value == null) return null;
    const boolVal = filter.value === true || filter.value === "true" || filter.value === 1;
    const p = nextParam();
    params.push(boolVal);
    return `${field} = ${p}`;
  }

  if (op === "NEQ" || op === "!=") {
    if (filter.value == null) return null;
    const boolVal = filter.value === true || filter.value === "true" || filter.value === 1;
    const p = nextParam();
    params.push(!boolVal);
    return `${field} = ${p}`;
  }

  // Default: EQ true
  const p = nextParam();
  params.push(true);
  return `${field} = ${p}`;
}

function lookupClause(filter, params) {
  const field = `"${filter.field}"`;
  const op = normalizeOperator(filter.operator);
  const value = filter.value != null ? String(filter.value) : "";

  if (op === "EQ" || !op || op === "=") {
    if (value === "") return null;
    const p = nextParam();
    params.push(value);
    return `${field} = ${p}`;
  }

  if (op === "NEQ" || op === "!=") {
    if (value === "") return null;
    const p = nextParam();
    params.push(value);
    return `${field} != ${p}`;
  }

  // Fallback: EQ
  if (value === "") return null;
  const p = nextParam();
  params.push(value);
  return `${field} = ${p}`;
}

// ─── Type dispatch ─────────────────────────────────────

const TYPE_BUILDERS = {
  text: textClause,
  number: numberClause,
  date: dateClause,
  boolean: booleanClause,
  bool: booleanClause,
  lookup: lookupClause,
};

/**
 * Infer filter type from operator and value shape when type is not provided.
 */
function inferType(filter) {
  if (filter.type) {
    const lower = filter.type.toLowerCase();
    if (lower in TYPE_BUILDERS) return lower;
  }

  // If both min and max are present, it's likely a range
  if ("min" in filter || "max" in filter) {
    const v = filter.min ?? filter.max ?? filter.value;
    if (typeof v === "number") return "number";
    // Check if it looks like a date
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return "date";
    return "number";
  }

  const op = normalizeOperator(filter.operator);
  const textOps = ["ILIKE", "NOT_ILIKE", "CONTAINS", "NOT_CONTAINS", "STARTS_WITH", "ENDS_WITH"];
  if (textOps.includes(op)) return "text";

  // Infer from value type
  const v = filter.value;
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return "date";

  return "text"; // safest default
}

// ─── Main entry point ──────────────────────────────────

/**
 * Convert structured filter definitions to a parameterized SQL WHERE clause.
 *
 * @param {Array|string} filters - Array of structured filter objects, or a raw SQL string
 * @param {Object} [options]
 * @param {Object} [options.columnTypes] - Optional map of field → type hint
 *        (e.g. { "order_total": "number", "order_date": "date" })
 * @returns {{ whereClause: string, params: any[] }}
 *   whereClause: SQL fragment (without "WHERE" keyword), or empty string
 *   params: Parameterized values for the clause
 */
function filtersToWhereClause(filters, options = {}) {
  resetParamIndex();

  // Handle raw SQL string (backward compatibility)
  if (typeof filters === "string") {
    return { whereClause: filters.trim(), params: [] };
  }

  // Handle null/undefined/empty
  if (!filters || !Array.isArray(filters) || filters.length === 0) {
    return { whereClause: "", params: [] };
  }

  const params = [];
  const clauses = [];
  const columnTypes = options.columnTypes || {};

  for (const filter of filters) {
    if (!filter.field) continue;

    // Resolve type: explicit > columnTypes hint > inference
    const type = (filter.type || columnTypes[filter.field] || inferType(filter)).toLowerCase();
    const builder = TYPE_BUILDERS[type];

    if (!builder) {
      // Unknown type — fall back to text
      const clause = textClause({ ...filter, type: "text" }, params);
      if (clause) clauses.push(clause);
      continue;
    }

    const clause = builder(filter, params);
    if (clause) clauses.push(clause);
  }

  return {
    whereClause: clauses.length > 0 ? clauses.join(" AND ") : "",
    params,
  };
}

// ─── Validation helper ─────────────────────────────────

/**
 * Validate a structured filter object.
 * Returns null if valid, or an error message string if invalid.
 */
function validateFilter(filter) {
  if (!filter || typeof filter !== "object") {
    return "Filter must be an object";
  }
  if (!filter.field || typeof filter.field !== "string") {
    return "Filter must have a 'field' property (string)";
  }
  if (filter.field.includes("'") || filter.field.includes("--")) {
    return "Invalid field name";
  }

  const type = filter.type ? filter.type.toLowerCase() : inferType(filter);
  const rangeTypes = ["number", "date"];

  if (rangeTypes.includes(type)) {
    if (filter.operator && normalizeOperator(filter.operator) === "RANGE") {
      // min/max range: at least one is required
      if (
        (filter.min == null || filter.min === "") &&
        (filter.max == null || filter.max === "")
      ) {
        return "Range filter requires at least 'min' or 'max'";
      }
    } else {
      // Non-range operator: value is required
      if (filter.value == null || filter.value === "") {
        return `Filter on '${filter.field}' requires a value`;
      }
    }
  } else if (type === "boolean") {
    if (filter.value == null) {
      return "Boolean filter requires a value (true/false)";
    }
  } else {
    // text or lookup: value is required for non-range operators
    if (filter.value == null || filter.value === "") {
      return `Filter on '${filter.field}' requires a value`;
    }
  }

  return null; // valid
}

module.exports = {
  filtersToWhereClause,
  validateFilter,
  // Exposed for testing
  _resetParamIndex: resetParamIndex,
  _normalizeOperator: normalizeOperator,
  _inferType: inferType,
  _textClause: textClause,
  _numberClause: numberClause,
  _dateClause: dateClause,
  _booleanClause: booleanClause,
  _lookupClause: lookupClause,
};