/**
 * Tests for filters-to-where.cjs — Filter → SQL WHERE clause translation
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  filtersToWhereClause,
  validateFilter,
  _resetParamIndex,
  _normalizeOperator,
  _inferType,
} = require("../filters-to-where.cjs");

beforeEach(() => {
  _resetParamIndex();
});

// ─── Raw SQL string (backward compat) ────────────────────

describe("raw SQL string (backward compat)", () => {
  it("returns the string as-is with empty params", () => {
    const result = filtersToWhereClause("status = 'Active'");
    expect(result.whereClause).toBe("status = 'Active'");
    expect(result.params).toEqual([]);
  });

  it("handles empty string", () => {
    const result = filtersToWhereClause("");
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });

  it("handles null", () => {
    const result = filtersToWhereClause(null);
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });
});

// ─── Empty / no filters ──────────────────────────────────

describe("empty / no filters", () => {
  it("returns empty clause for undefined", () => {
    const result = filtersToWhereClause();
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });

  it("returns empty clause for empty array", () => {
    const result = filtersToWhereClause([]);
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });

  it("skips filters with no field", () => {
    const result = filtersToWhereClause([
      { operator: "ILIKE", value: "test" },
    ]);
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });
});

// ─── Text filters ────────────────────────────────────────

describe("text filters (ILIKE)", () => {
  it("generates ILIKE clause with % wrapping", () => {
    const result = filtersToWhereClause([
      { field: "customer_name", operator: "ILIKE", value: "Hunt", type: "text" },
    ]);
    expect(result.whereClause).toBe('"customer_name" ILIKE $1');
    expect(result.params).toEqual(["%Hunt%"]);
  });

  it("defaults to ILIKE when no operator given", () => {
    const result = filtersToWhereClause([
      { field: "customer_name", value: "test", type: "text" },
    ]);
    expect(result.whereClause).toBe('"customer_name" ILIKE $1');
    expect(result.params).toEqual(["%test%"]);
  });

  it("generates NOT_ILIKE clause", () => {
    const result = filtersToWhereClause([
      { field: "name", operator: "NOT_ILIKE", value: "test", type: "text" },
    ]);
    expect(result.whereClause).toBe('"name" NOT ILIKE $1');
    expect(result.params).toEqual(["%test%"]);
  });

  it("generates EQ clause for text", () => {
    const result = filtersToWhereClause([
      { field: "email", operator: "EQ", value: "test@example.com", type: "text" },
    ]);
    expect(result.whereClause).toBe('"email" = $1');
    expect(result.params).toEqual(["test@example.com"]);
  });

  it("generates STARTS_WITH clause", () => {
    const result = filtersToWhereClause([
      { field: "code", operator: "STARTS_WITH", value: "ABC", type: "text" },
    ]);
    expect(result.whereClause).toBe('"code" ILIKE $1');
    expect(result.params).toEqual(["ABC%"]);
  });

  it("generates ENDS_WITH clause", () => {
    const result = filtersToWhereClause([
      { field: "code", operator: "ENDS_WITH", value: "XYZ", type: "text" },
    ]);
    expect(result.whereClause).toBe('"code" ILIKE $1');
    expect(result.params).toEqual(["%XYZ"]);
  });

  it("increments parameter indices across multiple filters", () => {
    const result = filtersToWhereClause([
      { field: "name", operator: "ILIKE", value: "John", type: "text" },
      { field: "email", operator: "ILIKE", value: "gmail", type: "text" },
    ]);
    expect(result.whereClause).toBe('"name" ILIKE $1 AND "email" ILIKE $2');
    expect(result.params).toEqual(["%John%", "%gmail%"]);
  });

  it("handles contains alias", () => {
    const result = filtersToWhereClause([
      { field: "desc", operator: "contains", value: "keyword", type: "text" },
    ]);
    expect(result.whereClause).toBe('"desc" ILIKE $1');
    expect(result.params).toEqual(["%keyword%"]);
  });
});

// ─── Number range filters ────────────────────────────────

describe("number range filters", () => {
  it("generates range with min and max", () => {
    const result = filtersToWhereClause([
      { field: "order_total", operator: "RANGE", min: 100, max: 500, type: "number" },
    ]);
    expect(result.whereClause).toBe('"order_total" >= $1 AND "order_total" <= $2');
    expect(result.params).toEqual([100, 500]);
  });

  it("generates range with min only", () => {
    const result = filtersToWhereClause([
      { field: "order_total", operator: "RANGE", min: 100, type: "number" },
    ]);
    expect(result.whereClause).toBe('"order_total" >= $1');
    expect(result.params).toEqual([100]);
  });

  it("generates range with max only", () => {
    const result = filtersToWhereClause([
      { field: "order_total", operator: "RANGE", max: 500, type: "number" },
    ]);
    expect(result.whereClause).toBe('"order_total" <= $1');
    expect(result.params).toEqual([500]);
  });

  it("returns null clause when both min and max are empty", () => {
    const result = filtersToWhereClause([
      { field: "order_total", operator: "RANGE", min: "", max: "", type: "number" },
    ]);
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });

  it("generates EQ clause for number", () => {
    const result = filtersToWhereClause([
      { field: "quantity", operator: "EQ", value: 42, type: "number" },
    ]);
    expect(result.whereClause).toBe('"quantity" = $1');
    expect(result.params).toEqual([42]);
  });

  it("generates GT clause", () => {
    const result = filtersToWhereClause([
      { field: "amount", operator: "GT", value: 100, type: "number" },
    ]);
    expect(result.whereClause).toBe('"amount" > $1');
    expect(result.params).toEqual([100]);
  });

  it("generates GTE clause", () => {
    const result = filtersToWhereClause([
      { field: "amount", operator: "GTE", value: 50, type: "number" },
    ]);
    expect(result.whereClause).toBe('"amount" >= $1');
    expect(result.params).toEqual([50]);
  });

  it("generates LT clause", () => {
    const result = filtersToWhereClause([
      { field: "amount", operator: "LT", value: 200, type: "number" },
    ]);
    expect(result.whereClause).toBe('"amount" < $1');
    expect(result.params).toEqual([200]);
  });

  it("generates LTE clause", () => {
    const result = filtersToWhereClause([
      { field: "amount", operator: "LTE", value: 200, type: "number" },
    ]);
    expect(result.whereClause).toBe('"amount" <= $1');
    expect(result.params).toEqual([200]);
  });

  it("generates NEQ clause", () => {
    const result = filtersToWhereClause([
      { field: "count", operator: "NEQ", value: 0, type: "number" },
    ]);
    expect(result.whereClause).toBe('"count" != $1');
    expect(result.params).toEqual([0]);
  });

  it("handles string values by converting to number", () => {
    const result = filtersToWhereClause([
      { field: "price", operator: "EQ", value: "99.99", type: "number" },
    ]);
    expect(result.whereClause).toBe('"price" = $1');
    expect(result.params).toEqual([99.99]);
  });
});

// ─── Date range filters ──────────────────────────────────

describe("date range filters", () => {
  it("generates range with from and to", () => {
    const result = filtersToWhereClause([
      { field: "order_date", operator: "RANGE", min: "2024-01-01", max: "2024-12-31", type: "date" },
    ]);
    expect(result.whereClause).toBe('"order_date" >= $1::date AND "order_date" <= $2::date');
    expect(result.params).toEqual(["2024-01-01", "2024-12-31"]);
  });

  it("generates range with from only", () => {
    const result = filtersToWhereClause([
      { field: "order_date", operator: "RANGE", min: "2024-06-01", type: "date" },
    ]);
    expect(result.whereClause).toBe('"order_date" >= $1::date');
    expect(result.params).toEqual(["2024-06-01"]);
  });

  it("generates EQ clause for exact date", () => {
    const result = filtersToWhereClause([
      { field: "ship_date", operator: "EQ", value: "2024-07-15", type: "date" },
    ]);
    expect(result.whereClause).toBe('"ship_date" = $1::date');
    expect(result.params).toEqual(["2024-07-15"]);
  });

  it("generates GT clause for date", () => {
    const result = filtersToWhereClause([
      { field: "order_date", operator: "GT", value: "2024-01-01", type: "date" },
    ]);
    expect(result.whereClause).toBe('"order_date" > $1::date');
    expect(result.params).toEqual(["2024-01-01"]);
  });

  it("skips filter with invalid date value", () => {
    const result = filtersToWhereClause([
      { field: "order_date", operator: "EQ", value: "", type: "date" },
    ]);
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });

  it("skips range with invalid min/max", () => {
    const result = filtersToWhereClause([
      { field: "order_date", operator: "RANGE", min: "", max: "", type: "date" },
    ]);
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });

  it("handles between alias", () => {
    const result = filtersToWhereClause([
      { field: "order_date", operator: "between", min: "2024-01-01", max: "2024-12-31", type: "date" },
    ]);
    expect(result.whereClause).toBe('"order_date" >= $1::date AND "order_date" <= $2::date');
  });
});

// ─── Boolean filters ─────────────────────────────────────

describe("boolean filters", () => {
  it("generates EQ true clause", () => {
    const result = filtersToWhereClause([
      { field: "active", operator: "EQ", value: true, type: "boolean" },
    ]);
    expect(result.whereClause).toBe('"active" = $1');
    expect(result.params).toEqual([true]);
  });

  it("generates EQ false clause", () => {
    const result = filtersToWhereClause([
      { field: "active", operator: "EQ", value: false, type: "boolean" },
    ]);
    expect(result.whereClause).toBe('"active" = $1');
    expect(result.params).toEqual([false]);
  });

  it("handles string 'true' value", () => {
    const result = filtersToWhereClause([
      { field: "active", value: "true", type: "boolean" },
    ]);
    expect(result.whereClause).toBe('"active" = $1');
    expect(result.params).toEqual([true]);
  });

  it("handles string 'false' value", () => {
    const result = filtersToWhereClause([
      { field: "active", value: "false", type: "boolean" },
    ]);
    expect(result.whereClause).toBe('"active" = $1');
    expect(result.params).toEqual([false]);
  });

  it("skips filter when value is null", () => {
    const result = filtersToWhereClause([
      { field: "active", value: null, type: "boolean" },
    ]);
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });
});

// ─── Lookup filters ─────────────────────────────────────

describe("lookup filters", () => {
  it("generates EQ clause", () => {
    const result = filtersToWhereClause([
      { field: "status", operator: "EQ", value: "Active", type: "lookup" },
    ]);
    expect(result.whereClause).toBe('"status" = $1');
    expect(result.params).toEqual(["Active"]);
  });

  it("generates NEQ clause", () => {
    const result = filtersToWhereClause([
      { field: "status", operator: "NEQ", value: "Inactive", type: "lookup" },
    ]);
    expect(result.whereClause).toBe('"status" != $1');
    expect(result.params).toEqual(["Inactive"]);
  });

  it("skips filter when value is empty", () => {
    const result = filtersToWhereClause([
      { field: "status", operator: "EQ", value: "", type: "lookup" },
    ]);
    expect(result.whereClause).toBe("");
    expect(result.params).toEqual([]);
  });
});

// ─── Mixed / combined filters ────────────────────────────

describe("mixed/combined filters", () => {
  it("combines different filter types with AND", () => {
    const result = filtersToWhereClause([
      { field: "customer_name", operator: "ILIKE", value: "John", type: "text" },
      { field: "order_total", operator: "RANGE", min: 50, max: 500, type: "number" },
      { field: "active", value: true, type: "boolean" },
    ]);
    expect(result.whereClause).toBe(
      '"customer_name" ILIKE $1 AND "order_total" >= $2 AND "order_total" <= $3 AND "active" = $4'
    );
    expect(result.params).toEqual(["%John%", 50, 500, true]);
  });

  it("combines text + date filters", () => {
    const result = filtersToWhereClause([
      { field: "name", value: "test", type: "text" },
      { field: "created_at", operator: "RANGE", min: "2024-01-01", type: "date" },
    ]);
    expect(result.whereClause).toBe(
      '"name" ILIKE $1 AND "created_at" >= $2::date'
    );
    expect(result.params).toEqual(["%test%", "2024-01-01"]);
  });
});

// ─── Type inference ──────────────────────────────────────

describe("type inference (inferType)", () => {
  it("infers text for ILIKE operator", () => {
    expect(_inferType({ operator: "ILIKE", value: "test" })).toBe("text");
  });

  it("infers boolean for boolean value", () => {
    expect(_inferType({ value: true })).toBe("boolean");
    expect(_inferType({ value: false })).toBe("boolean");
  });

  it("infers number for numeric value", () => {
    expect(_inferType({ value: 42 })).toBe("number");
    expect(_inferType({ value: 3.14 })).toBe("number");
  });

  it("infers date for date-pattern string", () => {
    expect(_inferType({ value: "2024-01-15" })).toBe("date");
    expect(_inferType({ value: "2024-01-15T00:00:00" })).toBe("date");
  });

  it("infers text as default for unknown string", () => {
    expect(_inferType({ value: "hello world" })).toBe("text");
  });

  it("infers number when min/max present without type", () => {
    expect(_inferType({ min: 10, max: 100 })).toBe("number");
  });

  it("infers date when min/max are date strings", () => {
    expect(_inferType({ min: "2024-01-01", max: "2024-12-31" })).toBe("date");
  });

  it("respects explicit type over inference", () => {
    expect(_inferType({ value: "42", type: "text" })).toBe("text");
    expect(_inferType({ value: "42", type: "number" })).toBe("number");
  });
});

// ─── Operator normalization ──────────────────────────────

describe("operator normalization", () => {
  it("normalizes eq to EQ", () => {
    expect(_normalizeOperator("eq")).toBe("EQ");
    expect(_normalizeOperator("=")).toBe("EQ");
    expect(_normalizeOperator("==")).toBe("EQ");
  });

  it("normalizes neq/ne to NEQ", () => {
    expect(_normalizeOperator("neq")).toBe("NEQ");
    expect(_normalizeOperator("ne")).toBe("NEQ");
    expect(_normalizeOperator("<>")).toBe("NEQ");
    expect(_normalizeOperator("!=")).toBe("NEQ");
  });

  it("normalizes ilike/like/contains to ILIKE", () => {
    expect(_normalizeOperator("ilike")).toBe("ILIKE");
    expect(_normalizeOperator("like")).toBe("ILIKE");
    expect(_normalizeOperator("contains")).toBe("ILIKE");
  });

  it("normalizes range/between to RANGE", () => {
    expect(_normalizeOperator("range")).toBe("RANGE");
    expect(_normalizeOperator("between")).toBe("RANGE");
  });

  it("normalizes gt/gte/lt/lte", () => {
    expect(_normalizeOperator(">")).toBe("GT");
    expect(_normalizeOperator(">=")).toBe("GTE");
    expect(_normalizeOperator("<")).toBe("LT");
    expect(_normalizeOperator("<=")).toBe("LTE");
  });

  it("returns empty string operator as EQ", () => {
    expect(_normalizeOperator("")).toBe("EQ");
  });

  it("returns undefined/null operator as EQ", () => {
    expect(_normalizeOperator(undefined)).toBe("EQ");
    expect(_normalizeOperator(null)).toBe("EQ");
  });
});

// ─── Column type hints ──────────────────────────────────

describe("column type hints", () => {
  it("uses columnTypes hint to infer type", () => {
    const result = filtersToWhereClause(
      [{ field: "order_total", operator: "EQ", value: 100 }],
      { columnTypes: { order_total: "number" } }
    );
    expect(result.whereClause).toBe('"order_total" = $1');
    expect(result.params).toEqual([100]);
  });

  it("columnTypes hint is overridden by explicit type", () => {
    const result = filtersToWhereClause(
      [{ field: "notes", operator: "ILIKE", value: "test", type: "text" }],
      { columnTypes: { notes: "number" } }
    );
    expect(result.whereClause).toBe('"notes" ILIKE $1');
    expect(result.params).toEqual(["%test%"]);
  });
});

// ─── Validate filter ─────────────────────────────────────

describe("validateFilter", () => {
  it("returns null for valid text filter", () => {
    expect(
      validateFilter({ field: "name", operator: "ILIKE", value: "test", type: "text" })
    ).toBeNull();
  });

  it("returns null for valid number range filter", () => {
    expect(
      validateFilter({ field: "total", operator: "RANGE", min: 1, max: 100, type: "number" })
    ).toBeNull();
  });

  it("rejects null filter", () => {
    expect(validateFilter(null)).toBe("Filter must be an object");
  });

  it("rejects filter without field", () => {
    expect(validateFilter({ value: "test" })).toBe(
      "Filter must have a 'field' property (string)"
    );
  });

  it("rejects filter with SQL injection attempt in field", () => {
    expect(validateFilter({ field: "name'; DROP TABLE", value: "test" })).toBe(
      "Invalid field name"
    );
  });

  it("rejects range filter with no min or max", () => {
    expect(
      validateFilter({ field: "total", operator: "RANGE", type: "number" })
    ).toBe("Range filter requires at least 'min' or 'max'");
  });

  it("rejects boolean filter with no value", () => {
    expect(
      validateFilter({ field: "active", type: "boolean" })
    ).toBe("Boolean filter requires a value (true/false)");
  });

  it("rejects text filter with empty value", () => {
    expect(
      validateFilter({ field: "name", type: "text", value: "" })
    ).toBe("Filter on 'name' requires a value");
  });
});

// ─── Edge cases ─────────────────────────────────────────

describe("edge cases", () => {
  it("handles a single filter correctly", () => {
    const result = filtersToWhereClause([
      { field: "name", operator: "ILIKE", value: "test", type: "text" },
    ]);
    expect(result.whereClause).toBe('"name" ILIKE $1');
    expect(result.params).toHaveLength(1);
  });

  it("resets parameter index between calls", () => {
    const first = filtersToWhereClause([
      { field: "a", operator: "ILIKE", value: "x", type: "text" },
    ]);
    expect(first.whereClause).toBe('"a" ILIKE $1');

    const second = filtersToWhereClause([
      { field: "b", operator: "ILIKE", value: "y", type: "text" },
    ]);
    expect(second.whereClause).toBe('"b" ILIKE $1');
  });

  it("handles unknown filter type gracefully", () => {
    const result = filtersToWhereClause([
      { field: "data", operator: "ILIKE", value: "test", type: "unknown_type" },
    ]);
    // Should fall back to text handler
    expect(result.whereClause).toBe('"data" ILIKE $1');
    expect(result.params).toEqual(["%test%"]);
  });
});
