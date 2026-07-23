// PermissionGate unit tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionGate } from "../PermissionGate";

// ─── Mock usePermissions ──────────────────────────────

const mockUsePermissions = vi.fn();

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: (...args: unknown[]) => mockUsePermissions(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PermissionGate", () => {
  it("renders children when permission is granted", () => {
    mockUsePermissions.mockReturnValue({
      canSelect: true,
      canInsert: true,
      canUpdate: false,
      canDelete: false,
      loading: false,
    });

    render(
      <PermissionGate table="orders" action="insert">
        <button>New Order</button>
      </PermissionGate>
    );

    expect(screen.getByText("New Order")).toBeInTheDocument();
  });

  it("renders fallback when permission is denied", () => {
    mockUsePermissions.mockReturnValue({
      canSelect: true,
      canInsert: false,
      canUpdate: false,
      canDelete: false,
      loading: false,
    });

    render(
      <PermissionGate
        table="orders"
        action="insert"
        fallback={<span>Access Denied</span>}
      >
        <button>New Order</button>
      </PermissionGate>
    );

    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByText("New Order")).not.toBeInTheDocument();
  });

  it("renders nothing when permission is denied and no fallback", () => {
    mockUsePermissions.mockReturnValue({
      canSelect: true,
      canInsert: false,
      canUpdate: true,
      canDelete: false,
      loading: false,
    });

    const { container } = render(
      <PermissionGate table="orders" action="insert">
        <button>New Order</button>
      </PermissionGate>
    );

    // Container should be empty
    expect(container.textContent).toBe("");
  });

  it("renders loadingFallback while loading when provided", () => {
    mockUsePermissions.mockReturnValue({
      canSelect: undefined,
      canInsert: undefined,
      canUpdate: undefined,
      canDelete: undefined,
      loading: true,
    });

    render(
      <PermissionGate
        table="orders"
        action="select"
        loadingFallback={<span>Checking...</span>}
      >
        <button>View</button>
      </PermissionGate>
    );

    expect(screen.getByText("Checking...")).toBeInTheDocument();
    expect(screen.queryByText("View")).not.toBeInTheDocument();
  });

  it("renders fallback while loading when no loadingFallback provided", () => {
    mockUsePermissions.mockReturnValue({
      canSelect: undefined,
      canInsert: undefined,
      canUpdate: undefined,
      canDelete: undefined,
      loading: true,
    });

    render(
      <PermissionGate
        table="orders"
        action="select"
        fallback={<span>No access</span>}
      >
        <button>View</button>
      </PermissionGate>
    );

    // Falls back to the regular fallback when loading
    expect(screen.getByText("No access")).toBeInTheDocument();
  });

  it("checks the correct action permission", () => {
    mockUsePermissions.mockReturnValue({
      canSelect: true,
      canInsert: false,
      canUpdate: false,
      canDelete: false,
      loading: false,
    });

    // Select should be allowed, insert should not
    const { rerender } = render(
      <PermissionGate table="orders" action="select">
        <span>Select OK</span>
      </PermissionGate>
    );
    expect(screen.getByText("Select OK")).toBeInTheDocument();

    // Rerender with insert action (which is denied)
    mockUsePermissions.mockReturnValue({
      canSelect: true,
      canInsert: false,
      canUpdate: false,
      canDelete: false,
      loading: false,
    });

    rerender(
      <PermissionGate
        table="orders"
        action="insert"
        fallback={<span>Insert Denied</span>}
      >
        <span>Select OK</span>
      </PermissionGate>
    );

    expect(screen.getByText("Insert Denied")).toBeInTheDocument();
    expect(screen.queryByText("Select OK")).not.toBeInTheDocument();
  });

  it("passes the correct table to usePermissions", () => {
    mockUsePermissions.mockReturnValue({
      canSelect: true,
      canInsert: false,
      canUpdate: false,
      canDelete: false,
      loading: false,
    });

    render(
      <PermissionGate table="inventory" action="select">
        <span>Inventory Access</span>
      </PermissionGate>
    );

    expect(mockUsePermissions).toHaveBeenCalledWith({ table: "inventory" });
  });
});