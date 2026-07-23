// usePermissions unit tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePermissions } from "../usePermissions";

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

const mockUserInfo = {
  userId: 2,
  companyId: 1,
  roleIds: [3],
  roleNames: ["data-entry"],
  isAdmin: false,
};

const mockAdminInfo = {
  userId: 1,
  companyId: 1,
  roleIds: [1],
  roleNames: ["admin"],
  isAdmin: true,
};

const mockTablePerms = {
  canSelect: true,
  canInsert: true,
  canUpdate: true,
  canDelete: false,
};

// ─── Tests ────────────────────────────────────────────

describe("usePermissions - user info", () => {
  it("fetches user info on mount", async () => {
    mockResponses = [{ ok: true, data: mockUserInfo }];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions());

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.userInfo).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isAdmin).toBe(false);

    // Wait for fetch to resolve
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.userInfo).toEqual(mockUserInfo);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets isAdmin to true when user is admin", async () => {
    mockResponses = [{ ok: true, data: mockAdminInfo }];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.userInfo?.isAdmin).toBe(true);
  });

  it("sets error when fetch fails", async () => {
    mockResponses = [{ ok: false, data: { error: "Server error" } }];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.userInfo).toBeNull();
  });
});

describe("usePermissions - table permissions", () => {
  it("fetches table permissions when table option provided", async () => {
    mockResponses = [
      { ok: true, data: mockUserInfo },
      { ok: true, data: mockTablePerms },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions({ table: "orders" }));

    await waitFor(() => {
      expect(result.current.canSelect).toBe(true);
    });

    expect(result.current.canInsert).toBe(true);
    expect(result.current.canUpdate).toBe(true);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.tablePermissions).toEqual(mockTablePerms);
  });

  it("returns undefined table permissions when no table provided", async () => {
    mockResponses = [{ ok: true, data: mockUserInfo }];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.canSelect).toBeUndefined();
    expect(result.current.canInsert).toBeUndefined();
    expect(result.current.canUpdate).toBeUndefined();
    expect(result.current.canDelete).toBeUndefined();
    expect(result.current.tablePermissions).toBeUndefined();
  });

  it("handles table permission fetch failure gracefully", async () => {
    mockResponses = [
      { ok: true, data: mockUserInfo },
      { ok: false, data: { error: "Bad" } },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions({ table: "orders" }));

    // Wait for both fetches to settle
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Wait a tick for the table permissions effect to settle
    await vi.waitFor(() => {
      expect(result.current.tablePermissions).toBeUndefined();
    });
  });
});

describe("usePermissions - checkPermission", () => {
  it("returns cached result from table permissions", async () => {
    mockResponses = [
      { ok: true, data: mockUserInfo },
      { ok: true, data: mockTablePerms },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions({ table: "orders" }));

    // Wait for table permissions to be loaded
    await waitFor(() => {
      expect(result.current.canSelect).toBe(true);
    });

    // canSelect is cached from the table permissions fetch
    const permitted = await result.current.checkPermission("orders", "select");
    expect(permitted).toBe(true);
  });

  it("calls API for uncached permission check", async () => {
    mockResponses = [
      { ok: true, data: mockUserInfo },
      { ok: true, data: { permitted: true } },
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Check a permission not yet cached — should make an API call
    const permitted = await result.current.checkPermission("inventory", "select");
    expect(permitted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns false when checkPermission API call fails", async () => {
    mockResponses = [
      { ok: true, data: mockUserInfo },
      { ok: false, data: { error: "fail" } },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const permitted = await result.current.checkPermission("secret", "delete");
    expect(permitted).toBe(false);
  });
});

describe("usePermissions - admin bypass", () => {
  it("checkPermission returns true for admin without API call", async () => {
    mockResponses = [{ ok: true, data: mockAdminInfo }];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Admin check should bypass API — only the user-info call was made
    const permitted = await result.current.checkPermission("anything", "delete");
    expect(permitted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no extra API call
  });

  it("table permissions are all true for admin", async () => {
    mockResponses = [
      { ok: true, data: mockAdminInfo },
      { ok: true, data: { canSelect: true, canInsert: true, canUpdate: true, canDelete: true } },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    const { result } = renderHook(() => usePermissions({ table: "orders" }));

    await waitFor(() => {
      expect(result.current.canSelect).toBe(true);
    });

    expect(result.current.canInsert).toBe(true);
    expect(result.current.canUpdate).toBe(true);
    expect(result.current.canDelete).toBe(true);
  });
});