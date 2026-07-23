// useFieldPermissions unit tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFieldPermissions } from "../useFieldPermissions";

// ─── Sequential fetch mock ────────────────────────────

type MockResponse = { ok: boolean; data: unknown };

let callIndex = 0;
let mockResponses: MockResponse[] = [];

function mockFetch(): Promise<Response> {
  const resp = mockResponses[callIndex] ?? { ok: false, data: { error: "unexpected call" } };
  callIndex++;
  return Promise.resolve(
    new Response(JSON.stringify(resp.data), {
      status: resp.ok ? 200 : 403,
      statusText: resp.ok ? "OK" : "Forbidden",
      headers: { "Content-Type": "application/json" },
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  callIndex = 0;
  mockResponses = [];
});

// ─── Fixtures ─────────────────────────────────────────

const mockFieldPerms = {
  discount: { hidden: false, readonly: true },
  salary: { hidden: true, readonly: false },
  balance: { hidden: false, readonly: true },
  commission: { hidden: true, readonly: true },
};

// ─── Tests ────────────────────────────────────────────

describe("useFieldPermissions", () => {
  it("fetches field permissions on mount", async () => {
    mockResponses = [{ ok: true, data: mockFieldPerms }];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => useFieldPermissions("orders"));

    // Initially loading
    expect(result.current.fieldLoading).toBe(true);
    expect(result.current.fieldPermissions).toBeNull();
    expect(result.current.fieldError).toBeNull();

    // Wait for fetch to resolve
    await waitFor(() => {
      expect(result.current.fieldLoading).toBe(false);
    });

    expect(result.current.fieldPermissions).toEqual(mockFieldPerms);
    expect(result.current.fieldError).toBeNull();
  });

  it("returns empty when no table provided", () => {
    const { result } = renderHook(() => useFieldPermissions(undefined));

    expect(result.current.fieldLoading).toBe(false);
    expect(result.current.fieldPermissions).toBeNull();
    expect(result.current.fieldError).toBeNull();
  });

  it("handles fetch failure gracefully", async () => {
    mockResponses = [{ ok: false, data: { error: "Server error" } }];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => useFieldPermissions("orders"));

    await waitFor(() => {
      expect(result.current.fieldLoading).toBe(false);
    });

    expect(result.current.fieldError).toBeTruthy();
    expect(result.current.fieldPermissions).toBeNull();
  });

  it("returns false for isFieldHidden when no permissions loaded", () => {
    const { result } = renderHook(() => useFieldPermissions(undefined));

    expect(result.current.isFieldHidden("any_field")).toBe(false);
  });

  it("returns false for isFieldReadonly when no permissions loaded", () => {
    const { result } = renderHook(() => useFieldPermissions(undefined));

    expect(result.current.isFieldReadonly("any_field")).toBe(false);
  });

  it("returns true for isFieldEditable when no permissions loaded", () => {
    const { result } = renderHook(() => useFieldPermissions(undefined));

    expect(result.current.isFieldEditable("any_field")).toBe(true);
  });
});

describe("useFieldPermissions - permission lookup", () => {
  beforeEach(async () => {
    mockResponses = [{ ok: true, data: mockFieldPerms }];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
  });

  it("identifies hidden fields", async () => {
    const { result } = renderHook(() => useFieldPermissions("employees"));

    await waitFor(() => {
      expect(result.current.fieldLoading).toBe(false);
    });

    expect(result.current.isFieldHidden("salary")).toBe(true);
    expect(result.current.isFieldHidden("discount")).toBe(false);
    expect(result.current.isFieldHidden("nonexistent")).toBe(false);
  });

  it("identifies readonly fields", async () => {
    const { result } = renderHook(() => useFieldPermissions("customers"));

    await waitFor(() => {
      expect(result.current.fieldLoading).toBe(false);
    });

    expect(result.current.isFieldReadonly("discount")).toBe(true);
    expect(result.current.isFieldReadonly("balance")).toBe(true);
    expect(result.current.isFieldReadonly("salary")).toBe(false);
    expect(result.current.isFieldReadonly("nonexistent")).toBe(false);
  });

  it("identifies editable fields", async () => {
    const { result } = renderHook(() => useFieldPermissions("orders"));

    await waitFor(() => {
      expect(result.current.fieldLoading).toBe(false);
    });

    // discount is readonly → not editable
    expect(result.current.isFieldEditable("discount")).toBe(false);
    // salary is hidden → not editable
    expect(result.current.isFieldEditable("salary")).toBe(false);
    // commission is both hidden AND readonly → not editable
    expect(result.current.isFieldEditable("commission")).toBe(false);
    // nonexistent has no rules → editable
    expect(result.current.isFieldEditable("nonexistent")).toBe(true);
  });

  it("caches results for the same table", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result, rerender } = renderHook(
      ({ table }: { table: string | undefined }) => useFieldPermissions(table),
      { initialProps: { table: "orders" } }
    );

    await waitFor(() => {
      expect(result.current.fieldLoading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Re-render with the same table — should use cache, not fetch
    rerender({ table: "orders" });

    // Wait a tick for effects to settle
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("re-fetches when table changes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result, rerender } = renderHook(
      ({ table }: { table: string | undefined }) => useFieldPermissions(table),
      { initialProps: { table: "orders" } }
    );

    await waitFor(() => {
      expect(result.current.fieldLoading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Change table — should fetch again
    rerender({ table: "employees" });

    await waitFor(() => {
      // First call was for "orders", second for "employees"
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});