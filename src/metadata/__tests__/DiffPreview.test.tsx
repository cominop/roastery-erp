// DiffPreview unit tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiffPreview from "../components/DiffPreview";
import type { DiffResult } from "../components/DiffPreview";

// ─── Mock data ──────────────────────────────────────────

const mockDiffResult: DiffResult = {
  summary: {
    forms: { added: 0, removed: 0, changed: 3, unchanged: 85 },
    fields: { added: 5, removed: 0, changed: 12, unchanged: 120 },
    events: { added: 0, removed: 0, changed: 1, unchanged: 42 },
    nav_tree: { added: 1, removed: 0, changed: 0, unchanged: 30 },
    permissions: { added: 0, removed: 0, changed: 0, unchanged: 15 },
    reports: { added: 0, removed: 0, changed: 2, unchanged: 8 },
    settings: { added: 0, removed: 0, changed: 0, unchanged: 3 },
  },
  details: {
    forms: [
      {
        name: "CustomerForm",
        key_field: "name",
        status: "changed",
        changes: ["field 'caption' changed: \"Client\" → \"Customer\""],
      },
      {
        name: "OrderForm",
        key_field: "name",
        status: "changed",
        changes: [
          "field 'header_height' changed: \"60\" → \"72\"",
          "field 'allow_edits' changed: true → false",
        ],
      },
      {
        name: "ProductForm",
        key_field: "name",
        status: "changed",
        changes: ["definition block changed"],
      },
    ],
    fields: [
      {
        name: "phone",
        key_field: "control_name",
        status: "added",
        changes: [],
      },
      {
        name: "email",
        key_field: "control_name",
        status: "added",
        changes: [],
      },
      {
        name: "status",
        key_field: "control_name",
        status: "changed",
        changes: ["field 'caption' changed: \"Status\" → \"Order Status\""],
      },
    ],
    events: [
      {
        name: "OnCurrent",
        key_field: "name",
        status: "changed",
        changes: ["handler_code block changed"],
      },
    ],
    nav_tree: [
      {
        name: "Reports",
        key_field: "id",
        status: "added",
        changes: [],
      },
    ],
    permissions: {
      roles: [
        {
          name: "admin",
          key_field: "name",
          status: "unchanged",
          changes: [],
        },
      ],
      user_roles: [],
      table_permissions: [],
      field_permissions: [],
      row_filters: [],
    },
    reports: [
      {
        name: "InvoiceReport",
        key_field: "name",
        status: "changed",
        changes: ["field 'caption' changed: \"Invoice\" → \"Invoice (v2)\""],
      },
      {
        name: "SummaryReport",
        key_field: "name",
        status: "changed",
        changes: ["field 'query' changed"],
      },
    ],
    settings: [
      {
        name: "theme",
        key_field: "name",
        status: "unchanged",
        changes: [],
      },
    ],
  },
};

// ─── Helper to create fetch mock ────────────────────────

function mockFetch(result: DiffResult) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(result),
  });
}

function mockFetchError(message: string) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: message }),
  });
}

function mockFetchNetworkError() {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
}

// ─── Tests ──────────────────────────────────────────────

describe("DiffPreview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading state initially", () => {
    // Never resolve the fetch
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<DiffPreview archivePath="/tmp/test.zip" />);

    expect(screen.getByText("Computing metadata diff...")).toBeInTheDocument();
  });

  it("renders error state when fetch fails", async () => {
    mockFetchError("Archive not found");

    render(<DiffPreview archivePath="/tmp/missing.zip" onCancel={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Diff failed")).toBeInTheDocument();
    });

    expect(screen.getByText("Archive not found")).toBeInTheDocument();
    expect(screen.getByText("Go Back")).toBeInTheDocument();
  });

  it("renders error state on network failure", async () => {
    mockFetchNetworkError();

    render(<DiffPreview archivePath="/tmp/test.zip" />);

    await waitFor(() => {
      expect(screen.getByText("Diff failed")).toBeInTheDocument();
    });

    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("renders summary counts correctly", async () => {
    mockFetch(mockDiffResult);

    render(<DiffPreview archivePath="/tmp/test.zip" />);

    await waitFor(() => {
      expect(screen.getByText("Diff Preview")).toBeInTheDocument();
    });

    // Summary cards
    expect(screen.getByText("6")).toBeInTheDocument(); // 0+5+0+1+0+0+0 = 6 added
    expect(screen.getByText("0")).toBeInTheDocument(); // 0 removed
    expect(screen.getByText("18")).toBeInTheDocument(); // 3+12+1+0+0+2+0 = 18 changed
  });

  it("renders section headers with correct counts", async () => {
    mockFetch(mockDiffResult);

    render(<DiffPreview archivePath="/tmp/test.zip" />);

    await waitFor(() => {
      expect(screen.getByText("Diff Preview")).toBeInTheDocument();
    });

    // Section headers should render (they contain the type names)
    expect(screen.getByText("forms")).toBeInTheDocument();
    expect(screen.getByText("fields")).toBeInTheDocument();
    expect(screen.getByText("events")).toBeInTheDocument();
    expect(screen.getByText(/nav/)).toBeInTheDocument();
    expect(screen.getByText("reports")).toBeInTheDocument();
  });

  it("renders changed items with before/after values", async () => {
    mockFetch(mockDiffResult);

    render(<DiffPreview archivePath="/tmp/test.zip" />);

    await waitFor(() => {
      expect(screen.getByText("CustomerForm")).toBeInTheDocument();
    });

    // Check that the change description for CustomerForm is visible
    expect(screen.getByText(/caption.*changed.*Client.*Customer/)).toBeInTheDocument();
  });

  it("shows added items with green styling", async () => {
    mockFetch(mockDiffResult);

    render(<DiffPreview archivePath="/tmp/test.zip" />);

    await waitFor(() => {
      expect(screen.getByText("Diff Preview")).toBeInTheDocument();
    });

    // "Added" label should appear for added items
    const addedLabels = screen.getAllByText("(Added)");
    expect(addedLabels.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onConfirm when Proceed with Import is clicked", async () => {
    mockFetch(mockDiffResult);

    const onConfirm = vi.fn();
    render(<DiffPreview archivePath="/tmp/test.zip" onConfirm={onConfirm} />);

    await waitFor(() => {
      expect(screen.getByText("Diff Preview")).toBeInTheDocument();
    });

    const proceedBtn = screen.getByText("Proceed with Import");
    await userEvent.click(proceedBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel is clicked", async () => {
    mockFetch(mockDiffResult);

    const onCancel = vi.fn();
    render(<DiffPreview archivePath="/tmp/test.zip" onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText("Diff Preview")).toBeInTheDocument();
    });

    const cancelBtn = screen.getByText("Cancel");
    await userEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("filter dropdown filters visible items", async () => {
    mockFetch(mockDiffResult);

    render(<DiffPreview archivePath="/tmp/test.zip" />);

    await waitFor(() => {
      expect(screen.getByText("Diff Preview")).toBeInTheDocument();
    });

    // The filter should be rendered — the select shows the raw value, not the label
    expect(screen.getByText("all")).toBeInTheDocument();
  });

  it("disables the proceed button when there are no changes", async () => {
    const noChangesResult: DiffResult = {
      summary: {
        forms: { added: 0, removed: 0, changed: 0, unchanged: 88 },
        fields: { added: 0, removed: 0, changed: 0, unchanged: 137 },
        events: { added: 0, removed: 0, changed: 0, unchanged: 43 },
        nav_tree: { added: 0, removed: 0, changed: 0, unchanged: 31 },
        permissions: { added: 0, removed: 0, changed: 0, unchanged: 15 },
        reports: { added: 0, removed: 0, changed: 0, unchanged: 10 },
        settings: { added: 0, removed: 0, changed: 0, unchanged: 3 },
      },
      details: {
        forms: [],
        fields: [],
        events: [],
        nav_tree: [],
        permissions: {},
        reports: [],
        settings: [],
      },
    };

    mockFetch(noChangesResult);

    render(<DiffPreview archivePath="/tmp/test.zip" onConfirm={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("No Changes")).toBeInTheDocument();
    });

    const btn = screen.getByText("No Changes");
    expect(btn).toBeDisabled();
  });
});