// RoleManager unit tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoleManager from "../RoleManager";

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

const mockAdminUserInfo = {
  userId: 1,
  companyId: 1,
  roleIds: [1],
  roleNames: ["admin"],
  isAdmin: true,
};

const mockRoles = [
  {
    id: 1,
    name: "admin",
    caption: "Administrator",
    is_system: true,
    created_at: "2025-01-01T00:00:00Z",
    user_count: 2,
  },
  {
    id: 2,
    name: "manager",
    caption: "Manager",
    is_system: true,
    created_at: "2025-01-01T00:00:00Z",
    user_count: 3,
  },
  {
    id: 3,
    name: "data-entry",
    caption: "Data Entry",
    is_system: true,
    created_at: "2025-01-01T00:00:00Z",
    user_count: 5,
  },
  {
    id: 4,
    name: "read-only",
    caption: "Read Only",
    is_system: true,
    created_at: "2025-01-01T00:00:00Z",
    user_count: 8,
  },
  {
    id: 5,
    name: "reports",
    caption: "Reports",
    is_system: true,
    created_at: "2025-01-01T00:00:00Z",
    user_count: 1,
  },
  {
    id: 99,
    name: "custom-role",
    caption: "Custom Role",
    is_system: false,
    created_at: "2025-07-01T00:00:00Z",
    user_count: 0,
  },
];

const mockRoleUsers = [
  { user_id: 10, employee_name: "Alice Smith", email: "alice@example.com", assigned_at: "2025-06-01T00:00:00Z" },
  { user_id: 20, employee_name: "Bob Jones", email: "bob@example.com", assigned_at: "2025-06-15T00:00:00Z" },
];

const mockEmployees = [
  { id: 10, firstname: "Alice", lastname: "Smith", email: "alice@example.com" },
  { id: 20, firstname: "Bob", lastname: "Jones", email: "bob@example.com" },
  { id: 30, firstname: "Charlie", lastname: "Brown", email: "charlie@example.com" },
];

// ─── Helper: set mock responses ───────────────────────

function setMockResponses(responses: MockResponse[]) {
  mockResponses = responses;
  vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
}

// ─── Tests ────────────────────────────────────────────

describe("RoleManager", () => {
  it("renders role list", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockRoles },
    ]);
    render(<RoleManager />);

    await waitFor(() => {
      expect(screen.getByText("Administrator")).toBeInTheDocument();
    });

    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Data Entry")).toBeInTheDocument();
    expect(screen.getByText("Read Only")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("Custom Role")).toBeInTheDocument();
  });

  it("shows system badge for system roles", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockRoles },
    ]);
    render(<RoleManager />);

    await waitFor(() => {
      expect(screen.getByText("Administrator")).toBeInTheDocument();
    });

    // System roles have "system" badges
    const systemBadges = screen.getAllByText("system");
    // admin, manager, data-entry, read-only, reports = 5
    // Custom role is NOT a system role so no badge
    expect(systemBadges.length).toBe(5);
  });

  it("opens create role dialog", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockRoles },
    ]);
    render(<RoleManager />);

    await waitFor(() => {
      expect(screen.getByText("Administrator")).toBeInTheDocument();
    });

    const newRoleBtn = screen.getByText("New Role");
    await userEvent.click(newRoleBtn);

    // "Create Role" appears both as dialog title and button text
    const createRoleElements = screen.getAllByText("Create Role");
    expect(createRoleElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByPlaceholderText("e.g., inventory-manager")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g., Inventory Manager")).toBeInTheDocument();
  });

  it("shows delete confirmation dialog", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockRoles }, // includes custom-role (is_system=false)
    ]);
    render(<RoleManager />);

    await waitFor(() => {
      expect(screen.getByText("Custom Role")).toBeInTheDocument();
    });

    // Non-system roles have delete buttons
    const deleteButtons = screen.getAllByTitle("Delete role");
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
    await userEvent.click(deleteButtons[0]);

    // "Delete Role" appears both as dialog title and action button
    await waitFor(() => {
      const deleteRoleElements = screen.getAllByText("Delete Role");
      expect(deleteRoleElements.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
  });

  it("shows user assignment section when role selected", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockRoles },
      { ok: true, data: mockRoleUsers },   // /api/roles/1/users
    ]);
    render(<RoleManager />);

    await waitFor(() => {
      expect(screen.getByText("Administrator")).toBeInTheDocument();
    });

    // Click on the first role
    const adminBtn = screen.getByText("Administrator");
    await userEvent.click(adminBtn);

    // Should show user assignment section
    await waitFor(() => {
      expect(screen.getByText("Assign Users")).toBeInTheDocument();
    });

    // Should show assigned users
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("filters role list by search", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockRoles },
    ]);
    render(<RoleManager />);

    await waitFor(() => {
      expect(screen.getByText("Administrator")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search roles...");
    await userEvent.type(searchInput, "Manager");

    // Administrator should no longer be visible
    expect(screen.queryByText("Administrator")).not.toBeInTheDocument();
    // Manager should be visible
    expect(screen.getByText("Manager")).toBeInTheDocument();
  });

  it("shows access denied for non-admin users", async () => {
    setMockResponses([
      {
        ok: true,
        data: {
          userId: 2,
          companyId: 1,
          roleIds: [3],
          roleNames: ["data-entry"],
          isAdmin: false,
        },
      },
    ]);
    render(<RoleManager />);

    await waitFor(() => {
      expect(screen.getByText("Access denied")).toBeInTheDocument();
    });

    expect(screen.queryByText("Administrator")).not.toBeInTheDocument();
  });

  it("shows loading state initially", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<never>(() => {}) // never resolves
    );

    render(<RoleManager />);

    expect(screen.getByText("Loading permissions...")).toBeInTheDocument();
  });

  it("renders user picker with employees", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockRoles },
      { ok: true, data: mockRoleUsers },   // /api/roles/1/users
      { ok: true, data: mockEmployees },   // /api/employees (direct call from openPicker)
      { ok: true, data: mockEmployees },   // /api/employees (debounced useEffect call)
    ]);
    render(<RoleManager />);

    await waitFor(() => {
      expect(screen.getByText("Administrator")).toBeInTheDocument();
    });

    // Click on the first role
    const adminBtn = screen.getByText("Administrator");
    await userEvent.click(adminBtn);

    // Wait for users to load
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    // Open the assign users picker
    const assignBtn = screen.getByText("Assign Users");
    await userEvent.click(assignBtn);

    // Wait for the picker dialog to open
    await waitFor(() => {
      expect(screen.getByText("Save Assignments")).toBeInTheDocument();
      // Charlie Brown should appear in the employee list
      expect(screen.getByText(/Charlie Brown/)).toBeInTheDocument();
    });
  });
});