// PermissionMatrix unit tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PermissionMatrix from "../PermissionMatrix";

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
  { id: 1, name: "admin", caption: "Administrator", is_system: true },
  { id: 2, name: "manager", caption: "Manager", is_system: true },
  { id: 3, name: "data-entry", caption: "Data Entry", is_system: true },
];

const mockTables = [
  {
    name: "orders",
    label: "orders",
    fields: [
      { name: "id", type: "integer" },
      { name: "customer_id", type: "integer" },
      { name: "order_date", type: "timestamp" },
      { name: "discount", type: "numeric" },
      { name: "total", type: "numeric" },
    ],
  },
  {
    name: "customers",
    label: "customers",
    fields: [
      { name: "id", type: "integer" },
      { name: "name", type: "varchar" },
      { name: "balance", type: "numeric" },
    ],
  },
];

const mockPermissions = [
  { role_id: 3, table_name: "orders", field_name: "discount", can_read: true, can_write: false },
  { role_id: 3, table_name: "customers", field_name: "balance", can_read: true, can_write: false },
];

const mockMatrixData = {
  roles: mockRoles,
  tables: mockTables,
  permissions: mockPermissions,
};

// ─── Helper ───────────────────────────────────────────

function setMockResponses(responses: MockResponse[]) {
  mockResponses = responses;
  vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
}

// ─── Tests ────────────────────────────────────────────

describe("PermissionMatrix", () => {
  it("renders access denied for non-admin", async () => {
    const nonAdminInfo = { ...mockAdminUserInfo, isAdmin: false };
    setMockResponses([
      { ok: true, data: nonAdminInfo },
    ]);
    render(<PermissionMatrix />);

    await waitFor(() => {
      expect(screen.getByText("Access denied")).toBeInTheDocument();
    });
  });

  it("renders the matrix with table selector and roles", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockMatrixData },
    ]);
    render(<PermissionMatrix />);

    // Should show the header
    await waitFor(() => {
      expect(screen.getByText("Permission Matrix")).toBeInTheDocument();
    });

    // Should show table selector with first table selected
    expect(screen.getByText("orders")).toBeInTheDocument();

    // Should show role columns
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Data Entry")).toBeInTheDocument();

    // Should show fields from the orders table
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("customer_id")).toBeInTheDocument();
    expect(screen.getByText("order_date")).toBeInTheDocument();
    expect(screen.getByText("discount")).toBeInTheDocument();
    expect(screen.getByText("total")).toBeInTheDocument();
  });

  it("switches table on table select change", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockMatrixData },
    ]);
    render(<PermissionMatrix />);

    await waitFor(() => {
      expect(screen.getByText("Permission Matrix")).toBeInTheDocument();
    });

    // Initially shows orders fields
    expect(screen.getByText("customer_id")).toBeInTheDocument();

    // Switch to customers table via the select
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "customers");

    // Should now show customer fields
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("balance")).toBeInTheDocument();
  });

  it("filters fields by search query", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockMatrixData },
    ]);
    render(<PermissionMatrix />);

    await waitFor(() => {
      expect(screen.getByText("Permission Matrix")).toBeInTheDocument();
    });

    // Type in the search box
    const searchInput = screen.getByPlaceholderText("Search fields...");
    await userEvent.type(searchInput, "discount");

    // Should only show matching field
    expect(screen.getByText("discount")).toBeInTheDocument();
    // Other fields should not be visible
    expect(screen.queryByText("customer_id")).not.toBeInTheDocument();
    expect(screen.queryByText("order_date")).not.toBeInTheDocument();
  });

  it("saves edited permissions", async () => {
    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: mockMatrixData }, // GET matrix
      { ok: true, data: { ok: true, count: 1 } }, // POST save
      { ok: true, data: mockMatrixData }, // GET matrix after save (re-fetch)
    ]);

    const user = userEvent.setup();
    render(<PermissionMatrix />);

    await waitFor(() => {
      expect(screen.getByText("Permission Matrix")).toBeInTheDocument();
    });

    // Find a can_read toggle for admin on discount field and click it
    // The button that has Eye icon (can_read) — initially all say "Click to revoke read"
    const readToggles = screen.getAllByTitle("Click to revoke read");
    // Click the first one to revoke read access (this creates an edit)
    if (readToggles.length > 0) {
      await user.click(readToggles[0]);
    }

    // Should now show Save button with count
    const saveButton = screen.getByRole("button", { name: /Save/i });
    expect(saveButton).not.toBeDisabled();

    // Click save
    await user.click(saveButton);

    // Should show success message
    await waitFor(() => {
      expect(screen.getByText(/permission.*saved/)).toBeInTheDocument();
    });
  });

  it("shows no table selected state when tables array is empty", async () => {
    const emptyMatrix = {
      roles: mockRoles,
      tables: [],
      permissions: [],
    };

    setMockResponses([
      { ok: true, data: mockAdminUserInfo },
      { ok: true, data: emptyMatrix },
    ]);
    render(<PermissionMatrix />);

    await waitFor(() => {
      expect(screen.getByText("No table selected")).toBeInTheDocument();
    });
  });
});
