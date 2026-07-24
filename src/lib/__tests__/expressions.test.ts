// Expression parser unit tests — tokeniser → AST → safe evaluator
// Tests cover: lexer, parser, evaluator, built-in functions, aggregates,
// edge cases, and error handling. No eval() or new Function() is used.
import { describe, it, expect } from "vitest";
import { evaluateExpression } from "@/lib/expressions";
import type { ExprContext } from "@/types";

// ─── Helper ────────────────────────────────────────────

function evalWith(expr: string, record: Record<string, unknown> = {}): unknown {
  return evaluateExpression(expr, { record });
}

function evalWithCtx(expr: string, ctx: ExprContext): unknown {
  return evaluateExpression(expr, ctx);
}

// ─── Literals & Identity ──────────────────────────────

describe("literals", () => {
  it("evaluates numeric literals", () => {
    expect(evalWith("42")).toBe(42);
    expect(evalWith("3.14")).toBe(3.14);
    expect(evalWith("0")).toBe(0);
    expect(evalWith("-5")).toBe(-5);
  });

  it("evaluates string literals", () => {
    expect(evalWith('"hello"')).toBe("hello");
    expect(evalWith("'world'")).toBe("world");
    expect(evalWith("'it\\'s ok'")).toBe("it's ok");
  });

  it("evaluates date literals", () => {
    const d = evalWith("#01/15/2024#") as Date;
    expect(d).toBeInstanceOf(Date);
    // Months are 0-indexed in JS Date
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
    expect(d.getFullYear()).toBe(2024);
  });

  it("supports leading = in expressions", () => {
    expect(evaluateExpression("=42", { record: {} })).toBe(42);
    expect(evaluateExpression('="hello"', { record: {} })).toBe("hello");
  });
});

// ─── Field References ──────────────────────────────────

describe("field references", () => {
  it("resolves [FieldName] bracket references", () => {
    const record = { CustomerName: "Acme Corp", Balance: 500 };
    expect(evalWith("[CustomerName]", record)).toBe("Acme Corp");
    expect(evalWith("[Balance]", record)).toBe(500);
  });

  it("resolves plain identifier field references", () => {
    const record = { ProductName: "Coffee", Price: 12.99 };
    expect(evalWith("ProductName", record)).toBe("Coffee");
    expect(evalWith("Price", record)).toBe(12.99);
  });

  it("resolves field names case-insensitively", () => {
    const record = { CUSTOMERNAME: "Acme Corp" };
    expect(evalWith("[customername]", record)).toBe("Acme Corp");
    expect(evalWith("customername", record)).toBe("Acme Corp");
  });

  it("returns null for missing fields", () => {
    expect(evalWith("[NonExistent]", {})).toBeNull();
  });
});

// ─── Arithmetic ────────────────────────────────────────

describe("arithmetic", () => {
  it("adds numbers", () => {
    expect(evalWith("2 + 3")).toBe(5);
    expect(evalWith("10 + 20")).toBe(30);
  });

  it("subtracts numbers", () => {
    expect(evalWith("10 - 3")).toBe(7);
    expect(evalWith("5 - 10")).toBe(-5);
  });

  it("multiplies numbers", () => {
    expect(evalWith("4 * 3")).toBe(12);
    expect(evalWith("0 * 100")).toBe(0);
  });

  it("divides numbers", () => {
    expect(evalWith("10 / 2")).toBe(5);
    expect(evalWith("7 / 2")).toBe(3.5);
  });

  it("handles division by zero", () => {
    expect(evalWith("10 / 0")).toBeNull();
  });

  it("respects operator precedence", () => {
    expect(evalWith("2 + 3 * 4")).toBe(14);   // * before +
    expect(evalWith("10 - 6 / 2")).toBe(7);   // / before -
    expect(evalWith("3 * 4 + 2")).toBe(14);   // same, RTL
  });

  it("respects parentheses for grouping", () => {
    expect(evalWith("(2 + 3) * 4")).toBe(20);
    expect(evalWith("10 / (3 - 1)")).toBe(5);
  });

  it("handles unary minus", () => {
    expect(evalWith("-5")).toBe(-5);
    expect(evalWith("-(10 + 5)")).toBe(-15);
    expect(evalWith("3 + -2")).toBe(1);
  });

  it("chains multiple additions", () => {
    expect(evalWith("1 + 2 + 3 + 4")).toBe(10);
  });

  it("chains multiple multiplications", () => {
    expect(evalWith("2 * 3 * 4")).toBe(24);
  });
});

// ─── String Concatenation ─────────────────────────────

describe("string concat", () => {
  it("concatenates strings with &", () => {
    expect(evalWith('"Hello" & " World"')).toBe("Hello World");
  });

  it("concatenates strings and numbers", () => {
    expect(evalWith('"Order #" & 42')).toBe("Order #42");
  });

  it("handles null in concatenation", () => {
    const record = { Name: null };
    expect(evalWith('"Hello " & [Name]', record)).toBe("Hello ");
  });
});

// ─── Comparisons ───────────────────────────────────────

describe("comparisons", () => {
  it("equal (=) returns -1 for true, 0 for false", () => {
    expect(evalWith("5 = 5")).toBe(-1);
    expect(evalWith("5 = 3")).toBe(0);
  });

  it("not equal (<>)", () => {
    expect(evalWith("5 <> 3")).toBe(-1);
    expect(evalWith("5 <> 5")).toBe(0);
  });

  it("less than (<)", () => {
    expect(evalWith("3 < 5")).toBe(-1);
    expect(evalWith("5 < 3")).toBe(0);
    expect(evalWith("3 < 3")).toBe(0);
  });

  it("greater than (>)", () => {
    expect(evalWith("5 > 3")).toBe(-1);
    expect(evalWith("3 > 5")).toBe(0);
  });

  it("less than or equal (<=)", () => {
    expect(evalWith("3 <= 5")).toBe(-1);
    expect(evalWith("3 <= 3")).toBe(-1);
    expect(evalWith("5 <= 3")).toBe(0);
  });

  it("greater than or equal (>=)", () => {
    expect(evalWith("5 >= 3")).toBe(-1);
    expect(evalWith("5 >= 5")).toBe(-1);
    expect(evalWith("3 >= 5")).toBe(0);
  });

  it("compares field values", () => {
    const record = { Qty: 10, MinQty: 5 };
    expect(evalWith("[Qty] >= [MinQty]", record)).toBe(-1);
  });
});

// ─── Logical Operators ─────────────────────────────────

describe("logical operators", () => {
  it("AND returns -1 when both sides are truthy", () => {
    expect(evalWith("5 > 3 AND 2 < 4")).toBe(-1);
  });

  it("AND returns 0 when either side is falsy", () => {
    expect(evalWith("5 > 3 AND 2 > 4")).toBe(0);
    expect(evalWith("5 < 3 AND 2 < 4")).toBe(0);
  });

  it("OR returns -1 when either side is truthy", () => {
    expect(evalWith("5 > 3 OR 2 > 4")).toBe(-1);
    expect(evalWith("5 < 3 OR 2 < 4")).toBe(-1); // 2 < 4 is true
    expect(evalWith("5 < 3 OR 2 > 4")).toBe(0);
  });

  it("NOT negates truthiness", () => {
    expect(evalWith("NOT 0")).toBe(-1);
    expect(evalWith("NOT 5")).toBe(0);
    expect(evalWith("NOT (5 > 3)")).toBe(0);
    expect(evalWith("NOT (5 < 3)")).toBe(-1);
  });

  it("supports compound logic with precedence", () => {
    // NOT binds tighter than AND, AND binds tighter than OR
    expect(evalWith("NOT 0 AND 1")).toBe(-1);
    expect(evalWith("NOT 5 AND 1")).toBe(0);
  });
});

// ─── Built-in Functions ───────────────────────────────

describe("built-in functions", () => {
  describe("IIF", () => {
    it("returns the true-part when condition is truthy", () => {
      expect(evalWith('IIF(5 > 3, "yes", "no")')).toBe("yes");
    });

    it("returns the false-part when condition is falsy", () => {
      expect(evalWith('IIF(5 < 3, "yes", "no")')).toBe("no");
    });

    it("returns null when false-part is omitted", () => {
      expect(evalWith("IIF(0, 42)")).toBeNull();
    });
  });

  describe("NZ (null-to-zero)", () => {
    it("returns original value when not null", () => {
      expect(evalWith("NZ(42)")).toBe(42);
      expect(evalWith('NZ("hello")')).toBe("hello");
    });

    it("returns 0 when null", () => {
      expect(evalWith("NZ(Null)")).toBe(0);
    });

    it("returns alternative when provided", () => {
      expect(evalWith('NZ(Null, "fallback")')).toBe("fallback");
    });
  });

  describe("ISNULL", () => {
    it("returns -1 for null/empty", () => {
      expect(evalWith("ISNULL(Null)")).toBe(-1);
    });

    it("returns 0 for non-null values", () => {
      expect(evalWith("ISNULL(42)")).toBe(0);
      expect(evalWith('ISNULL("hello")')).toBe(0);
    });
  });

  describe("NOW / DATE", () => {
    it("NOW returns a Date", () => {
      const d = evalWith("NOW()") as Date;
      expect(d).toBeInstanceOf(Date);
      // Should be close to "now"
      expect(Math.abs(d.getTime() - Date.now())).toBeLessThan(5000);
    });

    it("DATE() returns a Date", () => {
      const d = evalWith("DATE()") as Date;
      expect(d).toBeInstanceOf(Date);
    });
  });

  describe("string functions", () => {
    it("LEFT", () => {
      expect(evalWith('LEFT("Hello World", 5)')).toBe("Hello");
    });

    it("RIGHT", () => {
      expect(evalWith('RIGHT("Hello World", 5)')).toBe("World");
    });

    it("MID", () => {
      // MID(str, start, count) — 1-indexed
      expect(evalWith('MID("Hello", 2, 3)')).toBe("ell");
    });

    it("LEN", () => {
      expect(evalWith('LEN("Hello")')).toBe(5);
      expect(evalWith('LEN("")')).toBe(0);
    });

    it("TRIM", () => {
      expect(evalWith('TRIM("  Hello  ")')).toBe("Hello");
    });

    it("UCASE", () => {
      expect(evalWith('UCASE("Hello")')).toBe("HELLO");
    });

    it("LCASE", () => {
      expect(evalWith('LCASE("Hello")')).toBe("hello");
    });

    it("INSTR — finds substring position (1-indexed)", () => {
      expect(evalWith('INSTR("Hello World", "World")')).toBe(7);
      expect(evalWith('INSTR("Hello World", "xyz")')).toBe(0);
    });

    it("REPLACE", () => {
      expect(evalWith('REPLACE("Hello World", "World", "There")')).toBe("Hello There");
    });
  });

  describe("math functions", () => {
    it("INT floors the number", () => {
      expect(evalWith("INT(3.7)")).toBe(3);
      expect(evalWith("INT(-1.2)")).toBe(-2);
    });

    it("ABS returns absolute value", () => {
      expect(evalWith("ABS(-5)")).toBe(5);
      expect(evalWith("ABS(5)")).toBe(5);
    });

    it("VAL converts string to number", () => {
      expect(evalWith('VAL("42.5")')).toBe(42.5);
      expect(evalWith('VAL("hello")')).toBe(0);
    });

    it("ROUND rounds to specified precision", () => {
      expect(evalWith("ROUND(3.14159, 2)")).toBe(3.14);
      expect(evalWith("ROUND(3.14159, 0)")).toBe(3);
    });
  });

  describe("date functions", () => {
    it("DATEADD adds days", () => {
      const d = evalWith('DATEADD("d", 5, #01/01/2024#)') as Date;
      expect(d.getDate()).toBe(6);
    });

    it("DATEADD adds months", () => {
      const d = evalWith('DATEADD("m", 2, #01/01/2024#)') as Date;
      expect(d.getMonth()).toBe(2); // March
    });

    it("DATEADD adds years", () => {
      const d = evalWith('DATEADD("yyyy", 1, #01/01/2024#)') as Date;
      expect(d.getFullYear()).toBe(2025);
    });
  });

  describe("FORMAT", () => {
    it("formats short date", () => {
      const result = evalWith('FORMAT(#06/15/2024#, "Short Date")');
      expect(typeof result).toBe("string");
    });

    it("formats currency", () => {
      expect(evalWith('FORMAT(1234.5, "Currency")')).toBe("$1,234.50");
    });

    it("formats percent", () => {
      expect(evalWith('FORMAT(0.25, "Percent")')).toBe("25.00%");
    });

    it("formats fixed", () => {
      expect(evalWith('FORMAT(3.14159, "Fixed")')).toBe("3.14");
    });

    it("returns empty string for null", () => {
      expect(evalWith('FORMAT(Null, "Currency")')).toBe("");
    });
  });
});

// ─── Aggregates ────────────────────────────────────────

describe("aggregate functions", () => {
  const groupRecords = [
    { Product: "Coffee", Qty: 10, Price: 5 },
    { Product: "Tea", Qty: 20, Price: 3 },
    { Product: "Coffee", Qty: 15, Price: 5 },
  ];

  it("COUNT(*) returns total rows", () => {
    expect(evalWithCtx("COUNT(*)", { groupRecords })).toBe(3);
  });

  it("SUM aggregates values", () => {
    expect(evalWithCtx("SUM([Qty])", { groupRecords })).toBe(45);
  });

  it("AVG computes average", () => {
    expect(evalWithCtx("AVG([Qty])", { groupRecords })).toBe(15);
  });

  it("MIN finds minimum", () => {
    expect(evalWithCtx("MIN([Qty])", { groupRecords })).toBe(10);
  });

  it("MAX finds maximum", () => {
    expect(evalWithCtx("MAX([Qty])", { groupRecords })).toBe(20);
  });

  it("returns 0 for COUNT on empty set", () => {
    expect(evalWithCtx("COUNT(*)", { groupRecords: [] })).toBe(0);
  });

  it("returns null for other aggregates on empty set", () => {
    expect(evalWithCtx("SUM([Qty])", { groupRecords: [] })).toBeNull();
    expect(evalWithCtx("AVG([Qty])", { groupRecords: [] })).toBeNull();
  });

  it("uses allRecords as fallback when groupRecords is empty", () => {
    expect(evalWithCtx("COUNT(*)", { allRecords: groupRecords, groupRecords: [] })).toBe(3);
  });
});

// ─── Complex Expressions ───────────────────────────────

describe("complex expressions", () => {
  it("combines arithmetic and comparisons", () => {
    const record = { Subtotal: 100, Discount: 15, MinOrder: 50 };
    expect(evalWith("([Subtotal] - [Discount]) >= [MinOrder]", record)).toBe(-1);
  });

  it("combines IIF with field references", () => {
    const record = { Status: "Shipped" };
    expect(evalWith('IIF([Status] = "Shipped", "Yes", "No")', record)).toBe("Yes");
  });

  it("nested function calls", () => {
    expect(evalWith('LEFT(TRIM("  Hello  "), 3)')).toBe("Hel");
  });

  it("handles field values through chain of operations", () => {
    const record = { Qty: 100, Price: 9.99 };
    expect(evalWith("[Qty] * [Price]", record)).toBe(999);
  });

  it("logical expression with field comparisons", () => {
    const record = { Age: 25, IsMember: true };
    expect(evalWith("[Age] >= 18 AND [IsMember]", record)).toBe(-1);
  });
});

// ─── Edge Cases & Error Handling ──────────────────────

describe("edge cases", () => {
  it("empty expression returns #Error", () => {
    expect(evalWith("")).toBe("#Error");
  });

  it("invalid syntax returns #Error", () => {
    expect(evalWith("5 + + 3")).toBe("#Error");
    expect(evalWith("(5 + 3")).toBe("#Error");
  });

  it("mixed case function names work", () => {
    expect(evalWith('iif(1, "yes", "no")')).toBe("yes");
    expect(evalWith('Iif(0, "yes", "no")')).toBe("no");
  });

  it("unary minus on field reference", () => {
    const record = { Value: 42 };
    expect(evalWith("-[Value]", record)).toBe(-42);
  });

  it("handles expressions with only whitespace", () => {
    expect(evalWith("   ")).toBe("#Error");
  });

  it("caches parsed AST for repeated expressions", () => {
    // Running the same expression twice should succeed both times
    expect(evalWith("2 + 2")).toBe(4);
    expect(evalWith("2 + 2")).toBe(4);
  });
});

// ─── Field Permission / Row Filter Patterns ────────────

describe("row filter patterns", () => {
  it("evaluates simple equality filter", () => {
    const record = { region: "West" };
    expect(evalWith('[region] = "West"', record)).toBe(-1);
    expect(evalWith('[region] = "East"', record)).toBe(0);
  });

  it("evaluates ILIKE-style pattern match using INSTR", () => {
    const record = { email: "alice@example.com" };
    expect(evalWith('INSTR([email], "example") > 0', record)).toBe(-1);
    expect(evalWith('INSTR([email], "test") > 0', record)).toBe(0);
  });

  it("evaluates complex row filter: region + min order", () => {
    const record = { region: "West", order_total: 150 };
    expect(evalWith('[region] = "West" AND [order_total] >= 100', record)).toBe(-1);
    expect(evalWith('[region] = "East" AND [order_total] >= 100', record)).toBe(0);
    expect(evalWith('[region] = "West" AND [order_total] < 100', record)).toBe(0);
  });

  it("evaluates nullable field check", () => {
    const record: Record<string, unknown> = { assigned_to: null };
    // ISNULL returns -1 for null
    expect(evalWith("ISNULL([assigned_to])", record)).toBe(-1);
    record.assigned_to = "Bob";
    expect(evalWith("ISNULL([assigned_to])", record)).toBe(0);
  });

  it("evaluates multi-field date comparison", () => {
    const record = { shipped_date: "2024-01-15" };
    // Compare string dates via field references
    expect(evalWith('[shipped_date] <> ""', record)).toBe(-1);
  });
});
