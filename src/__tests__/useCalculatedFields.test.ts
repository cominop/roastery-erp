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

  it("filters out stored-type calculated fields", async () => {
    mockResponse = [
      makeRow({ name: "calc_field", calc_type: "formula", depends_on: [] }),
      makeRow({ name: "stored_field", calc_type: "stored", depends_on: [] }),
    ];
    const { result } = renderHook(() =>
      useCalculatedFields("orders", { x: 1 }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.definitions.length).toBe(1);
    expect(result.current.definitions[0].name).toBe("calc_field");
    expect(result.current.computedValues).toHaveProperty("calc_field");
    expect(result.current.computedValues).not.toHaveProperty("stored_field");
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
});