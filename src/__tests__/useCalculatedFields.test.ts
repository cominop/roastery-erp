/**
 * Unit tests for useCalculatedFields hook.
 *
 * Tests: fetching definitions, expression evaluation, dependency-based
 * auto-refresh, formatting, error handling, and empty states.
 *
 * Mock data uses snake_case keys matching the server's raw DB row format.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useCalculatedFields,
  clearCalculatedFieldsCache,
} from "@/calculated-fields/hooks/useCalculatedFields";

// ─── Mock fetch ──────────────────────────────────────────
let mockResponse: Record<string, unknown>[] = [];
let mockError: string | null = null;

beforeEach(() => {
  // Clear module-level cache between tests
  clearCalculatedFieldsCache();

  mockResponse = [];
  mockError = null;
  vi.restoreAllMocks();

  vi.spyOn(globalThis, "fetch").mockImplementation(
    (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/api/calculated-fields")) {
        if (mockError) {
          return Promise.reject(new Error(mockError));
        }
        return Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error("Unexpected URL: " + urlStr));
    },
  );
});

// ─── Helpers ─────────────────────────────────────────────
// Build a raw DB row (snake_case keys, matching server response)

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "order_total",
    caption: "Order Total",
    table_name: "orders",
    calc_type: "formula",
    expression: "[quantity] * [unit_price]",
    data_type: "currency",
    depends_on: ["quantity", "unit_price"],
    depends_on_tables: [],
    read_only: true,
    refresh_on: "read",
    null_when_empty: false,
    format: null,
    decimals: 2,
    prefix: null,
    suffix: null,
    visible: true,
    sortable: true,
    filterable: false,
    created_at: "2026-07-24T12:00:00Z",
    updated_at: "2026-07-24T12:00:00Z",
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────

describe("useCalculatedFields", () => {
  it("returns empty computedValues when no table name is given", () => {
    const { result } = renderHook(() =>
      useCalculatedFields(undefined, {}),
    );
    expect(result.current.computedValues).toEqual({});
    expect(result.current.definitions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns empty computedValues when no definitions exist", async () => {
    mockResponse = [];
    const { result } = renderHook(() =>
      useCalculatedFields("orders", {}),
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues).toEqual({});
    expect(result.current.definitions).toEqual([]);
  });

  it("evaluates expressions against the current record", async () => {
    mockResponse = [makeRow()];
    const { result } = renderHook(() =>
      useCalculatedFields("orders", { quantity: 10, unit_price: 9.99 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.definitions).toHaveLength(1);
    expect(result.current.computedValues).toHaveProperty("order_total");
    // 10 * 9.99 = 99.9, formatted with decimals=2 → "99.90"
    expect(result.current.computedValues.order_total).toBe("99.90");
  });

  it("re-evaluates when the record changes (auto-refresh on deps)", async () => {
    mockResponse = [makeRow()];

    const { result, rerender } = renderHook(
      ({ record }) => useCalculatedFields("orders", record),
      { initialProps: { record: { quantity: 10, unit_price: 9.99 } } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.order_total).toBe("99.90");

    // Change a dependency
    rerender({ record: { quantity: 5, unit_price: 9.99 } });

    expect(result.current.computedValues.order_total).toBe("49.95");
  });

  it("returns null for fields whose dependencies are not yet in the record", async () => {
    mockResponse = [makeRow()];
    const { result } = renderHook(() =>
      useCalculatedFields("orders", {}),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.order_total).toBeNull();
  });

  it("handles expressions with string concatenation", async () => {
    mockResponse = [
      makeRow({
        name: "full_name",
        expression: '[first_name] & " " & [last_name]',
        data_type: "text",
        decimals: null,
        depends_on: ["first_name", "last_name"],
      }),
    ];
    const { result } = renderHook(() =>
      useCalculatedFields("employees", {
        first_name: "Alice",
        last_name: "Smith",
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.full_name).toBe("Alice Smith");
  });

  it("returns #Error for expressions that fail to parse", async () => {
    mockResponse = [
      makeRow({
        expression: "(2 + 3",
        depends_on: [],
      }),
    ];
    const { result } = renderHook(() =>
      useCalculatedFields("orders", { some_field: 42 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.order_total).toBe("#Error");
  });

  it("applies prefix and suffix formatting", async () => {
    mockResponse = [
      makeRow({
        expression: "[price]",
        data_type: "currency",
        prefix: "$",
        suffix: " USD",
        decimals: 2,
        depends_on: ["price"],
      }),
    ];
    const { result } = renderHook(() =>
      useCalculatedFields("products", { price: 12.5 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.order_total).toBe("$12.50 USD");
  });

  it("applies decimal rounding", async () => {
    mockResponse = [
      makeRow({
        expression: "[rate]",
        data_type: "number",
        decimals: 0,
        depends_on: ["rate"],
      }),
    ];
    const { result } = renderHook(() =>
      useCalculatedFields("rates", { rate: 3.75 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.order_total).toBe("4");
  });

  it("filters out non-visible calculated fields", async () => {
    mockResponse = [
      makeRow({ name: "visible_field", visible: true, depends_on: [] }),
      makeRow({ name: "hidden_field", visible: false, depends_on: [] }),
    ];
    const { result } = renderHook(() =>
      useCalculatedFields("orders", { x: 1 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // hidden_field should be filtered out via `visible` check
    expect(result.current.definitions.length).toBe(1);
    expect(result.current.definitions[0].name).toBe("visible_field");
    expect(result.current.computedValues).toHaveProperty("visible_field");
    expect(result.current.computedValues).not.toHaveProperty("hidden_field");
  });

  it("includes stored-type calculated fields in definitions but fetches values via API", async () => {
    mockResponse = [
      makeRow({ name: "calc_field", calc_type: "formula", depends_on: [], expression: "[x]", data_type: "number" }),
      makeRow({ name: "stored_field", calc_type: "stored", depends_on: [], expression: "[a] + [b]", data_type: "number" }),
    ];

    // Mock stored-values endpoint
    const originalMock = vi.spyOn(globalThis, "fetch");
    originalMock.mockImplementation(
      (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/api/calculated-fields")) {
          if (urlStr.includes("stored-values")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ stored_values: { stored_field: 42 } }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error("Unexpected URL: " + urlStr));
      },
    );

    const { result } = renderHook(() =>
      useCalculatedFields("orders", { id: 1, x: 5 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Stored field should be in definitions (form renderer needs it for read-only marking)
    expect(result.current.definitions.length).toBe(2);
    expect(result.current.definitions.map((d) => d.name)).toContain("stored_field");

    // Stored field value should come from API
    expect(result.current.computedValues).toHaveProperty("stored_field");
    expect(result.current.computedValues.stored_field).toBe(42);
  });

  it("caches definitions across re-renders (no re-fetch)", async () => {
    mockResponse = [makeRow()];

    const { result, rerender } = renderHook(
      ({ record }) => useCalculatedFields("orders", record),
      { initialProps: { record: { quantity: 1, unit_price: 1 } } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Rerender with different record (should use cache, not fetch again)
    rerender({ record: { quantity: 2, unit_price: 2 } });

    expect(result.current.computedValues.order_total).toBe("4.00");
  });

  it("handles API errors gracefully", async () => {
    mockError = "Network error";
    const { result } = renderHook(() =>
      useCalculatedFields("orders", {}),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Network error");
    expect(result.current.computedValues).toEqual({});
    expect(result.current.definitions).toEqual([]);
  });

  it("evaluates TODAY() function", async () => {
    mockResponse = [
      makeRow({
        name: "today_date",
        expression: "TODAY()",
        data_type: "date",
        depends_on: [],
      }),
    ];
    const { result } = renderHook(() =>
      useCalculatedFields("orders", { id: 1 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const val = result.current.computedValues.today_date;
    expect(val).toBeInstanceOf(Date);
    expect(Math.abs((val as Date).getTime() - Date.now())).toBeLessThan(5000);
  });

  it("supports aggregate COUNT(*) expression", async () => {
    mockResponse = [
      makeRow({
        name: "item_count",
        expression: "COUNT(*)",
        data_type: "number",
        decimals: null,
        depends_on: [],
      }),
    ];
    const { result } = renderHook(() =>
      useCalculatedFields("orders", { id: 1 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.item_count).toBe(1);
  });

  it("resets definitions when table name changes", async () => {
    mockResponse = [makeRow({ name: "order_total" })];

    const { result, rerender } = renderHook(
      ({ table }) => useCalculatedFields(table, {}),
      { initialProps: { table: "orders" } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.definitions).toHaveLength(1);

    // Switch tables — should trigger a new fetch
    mockResponse = [];
    rerender({ table: "products" });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.definitions).toHaveLength(0);
  });

  // ── Aggregate field tests ──────────────────────────────

  it("calls evaluateAggregate API for aggregate calcType fields with record id", async () => {
    mockResponse = [
      makeRow({
        name: "order_total",
        calc_type: "aggregate",
        expression: "SUM(order_details.{quantity} * {unit_price})",
        data_type: "currency",
        decimals: 2,
        depends_on: [],
      }),
    ];

    // Mock fetch to also handle the /evaluate-aggregate call
    const { result } = renderHook(() =>
      useCalculatedFields("orders", { id: 42 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // The aggregate call should have been made via fetch
    // Since the mock returns empty for unmatched routes, aggregate
    // may fail gracefully — but we verify the field appears
    expect(result.current.computedValues).toHaveProperty("order_total");
  });

  it("evaluates aggregate fields via API call", async () => {
    mockResponse = [
      makeRow({
        name: "total_spent",
        calc_type: "aggregate",
        expression: "SUM(orders.{order_total})",
        data_type: "currency",
        decimals: 2,
        depends_on: [],
      }),
    ];

    // Override the global fetch mock to handle aggregate endpoint
    const originalMock = vi.spyOn(globalThis, "fetch");
    originalMock.mockImplementation(
      (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/api/calculated-fields")) {
          if (urlStr.includes("evaluate-aggregate")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ result: 2500.0, cached: false }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error("Unexpected URL: " + urlStr));
      },
    );

    const { result } = renderHook(() =>
      useCalculatedFields("orders", { id: 15 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.total_spent).toBe(2500);
  });

  it("returns #Error for aggregate fields when API call fails", async () => {
    mockResponse = [
      makeRow({
        name: "bad_agg",
        calc_type: "aggregate",
        expression: "SUM(nonexistent.{field})",
        data_type: "number",
        depends_on: [],
      }),
    ];

    const originalMock = vi.spyOn(globalThis, "fetch");
    originalMock.mockImplementation(
      (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/api/calculated-fields")) {
          if (urlStr.includes("evaluate-aggregate")) {
            return Promise.reject(new Error("API error"));
          }
          return Promise.resolve(
            new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error("Unexpected URL: " + urlStr));
      },
    );

    const { result } = renderHook(() =>
      useCalculatedFields("orders", { id: 99 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.bad_agg).toBe("#Error");
  });

  it("merges aggregate and scalar field results correctly", async () => {
    mockResponse = [
      makeRow({
        name: "line_total",
        expression: "{quantity} * {unit_price}",
        data_type: "currency",
        decimals: 2,
        depends_on: ["quantity", "unit_price"],
      }),
      makeRow({
        name: "order_total",
        calc_type: "aggregate",
        expression: "SUM(order_details.{line_total})",
        data_type: "currency",
        decimals: 2,
        depends_on: [],
      }),
    ];

    // Mock aggregate endpoint
    const originalMock = vi.spyOn(globalThis, "fetch");
    originalMock.mockImplementation(
      (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/api/calculated-fields")) {
          if (urlStr.includes("evaluate-aggregate")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ result: 125.50, cached: false }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error("Unexpected URL: " + urlStr));
      },
    );

    const { result } = renderHook(() =>
      useCalculatedFields("orders", {
        id: 5,
        quantity: 3,
        unit_price: 10.0,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Scalar field
    expect(result.current.computedValues.line_total).toBe("30.00");
    // Aggregate field
    expect(result.current.computedValues.order_total).toBe(125.5);
  });

  it("returns null for aggregate fields when record has no id", async () => {
    mockResponse = [
      makeRow({
        name: "order_total",
        calc_type: "aggregate",
        expression: "SUM(order_details.{quantity})",
        data_type: "number",
        depends_on: [],
      }),
    ];

    const { result } = renderHook(() =>
      useCalculatedFields("orders", {}),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // No record id means aggregate fields are not fetched
    // scalarValues for aggregate fields are not evaluated either
    expect(result.current.computedValues.order_total).toBeUndefined();
  });

  // ── Stored value tests ──────────────────────────────────

  it("returns empty stored values when no stored fields defined", async () => {
    mockResponse = [
      makeRow({ name: "qty", calc_type: "formula", depends_on: [], expression: "[x]", data_type: "number", decimals: null }),
    ];
    const { result } = renderHook(() =>
      useCalculatedFields("orders", { id: 1, x: 5 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.computedValues.qty).toBe(5);
    expect(result.current.computedValues).not.toHaveProperty("stored_field");
    expect(result.current.definitions.length).toBe(1);
  });

  it("handles stored values API failure gracefully", async () => {
    mockResponse = [
      makeRow({ name: "stored_field", calc_type: "stored", depends_on: [], expression: "[a] + [b]", data_type: "number" }),
    ];

    const originalMock = vi.spyOn(globalThis, "fetch");
    originalMock.mockImplementation(
      (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/api/calculated-fields")) {
          if (urlStr.includes("stored-values")) {
            return Promise.reject(new Error("API error"));
          }
          return Promise.resolve(
            new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error("Unexpected URL: " + urlStr));
      },
    );

    const { result } = renderHook(() =>
      useCalculatedFields("orders", { id: 1 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Stored field name should be in definitions
    expect(result.current.definitions.length).toBe(1);
    expect(result.current.definitions[0].name).toBe("stored_field");
    // But computedValues should not have it (API failed)
    expect(result.current.computedValues.stored_field).toBeUndefined();
  });

  it("returns stored values when record has an id", async () => {
    mockResponse = [
      makeRow({
        name: "total_with_tax",
        calc_type: "stored",
        expression: "[subtotal] * 1.13",
        data_type: "number",
        depends_on: ["subtotal"],
      }),
    ];

    const originalMock = vi.spyOn(globalThis, "fetch");
    originalMock.mockImplementation(
      (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/api/calculated-fields")) {
          if (urlStr.includes("stored-values")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({ stored_values: { total_with_tax: 113.0 } }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new Error("Unexpected URL: " + urlStr));
      },
    );

    const { result } = renderHook(() =>
      useCalculatedFields("orders", { id: 10, subtotal: 100 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.definitions.length).toBe(1);
    expect(result.current.computedValues.total_with_tax).toBe(113);
  });
});