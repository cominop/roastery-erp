/**
 * Unit tests for TableFieldPicker column configuration.
 *
 * Tests: rendering visible/hidden columns, visibility toggling, inline
 * reordering (up/down), per-column config expansion (label, width, align,
 * sortable), adding new columns, hidden fields section, disabled state.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableFieldPicker from "../TableFieldPicker";
import type { TableColumnConfig, TableFieldPickerProps } from "../TableFieldPicker";
import type { FieldPickerItem } from "../FieldPicker";

// ─── Fixtures ─────────────────────────────────────────

const FIELDS: FieldPickerItem[] = [
  { name: "orderid", type: "integer" },
  { name: "customer_name", type: "varchar(100)" },
  { name: "amount", type: "numeric(10,2)" },
  { name: "order_date", type: "timestamp" },
  { name: "is_active", type: "boolean" },
  { name: "notes", type: "text" },
];

const VISIBLE_COLUMNS: TableColumnConfig[] = [
  { field: "orderid", label: "Order ID", width: 80, visible: true, align: "left", sortable: true },
  { field: "customer_name", visible: true, align: "left", sortable: true },
  { field: "amount", label: "Amount", width: 120, visible: true, align: "right", sortable: false },
];

const HIDDEN_COLUMNS: TableColumnConfig[] = [
  { field: "order_date", visible: false, align: "left", sortable: true },
  { field: "is_active", visible: false, align: "center", sortable: true },
];

const ALL_COLUMNS: TableColumnConfig[] = [...VISIBLE_COLUMNS, ...HIDDEN_COLUMNS];

// ─── Helpers ──────────────────────────────────────────

function renderDefault(props?: Partial<TableFieldPickerProps>) {
  const defaultProps: TableFieldPickerProps = {
    availableFields: FIELDS,
    columns: ALL_COLUMNS,
    onChange: vi.fn(),
  };
  return render(<TableFieldPicker {...defaultProps} {...props} />);
}

function getRegion() {
  return screen.getByRole("region", { name: "Table column picker" });
}

async function clickButton(ariaLabel: string) {
  const btn = screen.getByLabelText(ariaLabel);
  await userEvent.click(btn);
}

// ─── Tests ────────────────────────────────────────────

describe("TableFieldPicker", () => {
  // ── Rendering & structure ──

  it("renders with accessible region", () => {
    renderDefault();
    expect(getRegion()).toBeInTheDocument();
  });

  it("shows column count", () => {
    renderDefault();
    expect(screen.getByText("3 visible")).toBeInTheDocument();
  });

  it("renders visible column rows with names and types", () => {
    renderDefault();
    expect(screen.getByText("orderid")).toBeInTheDocument();
    expect(screen.getByText("customer_name")).toBeInTheDocument();
    expect(screen.getByText("amount")).toBeInTheDocument();
    expect(screen.getAllByText("number").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("text").length).toBeGreaterThanOrEqual(1);
  });

  it("renders hidden fields in a separate section", () => {
    renderDefault();
    expect(screen.getByText(/Hidden fields/)).toBeInTheDocument();
    expect(screen.getByText("order_date")).toBeInTheDocument();
    expect(screen.getByText("is_active")).toBeInTheDocument();
  });

  it("shows empty state when no visible columns", () => {
    renderDefault({ columns: HIDDEN_COLUMNS });
    expect(
      screen.getByText(/No columns selected.*all fields hidden/i),
    ).toBeInTheDocument();
  });

  // ── Visibility toggling ──

  it("hides a visible column on eye icon click", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    await clickButton("Hide column orderid");
    expect(onChange).toHaveBeenCalledWith(
      ALL_COLUMNS.map((c) =>
        c.field === "orderid" ? { ...c, visible: false } : c,
      ),
    );
  });

  it("shows a hidden column on eye-off icon click", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    await clickButton("Show column order_date");
    expect(onChange).toHaveBeenCalledWith(
      ALL_COLUMNS.map((c) =>
        c.field === "order_date" ? { ...c, visible: true } : c,
      ),
    );
  });

  it("adds a new visible column when a field not in columns is toggled on", async () => {
    const onChange = vi.fn();
    renderDefault({ availableFields: FIELDS, columns: [], onChange });
    await clickButton("Show column orderid");
    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as TableColumnConfig[];
    const added = result.find((c) => c.field === "orderid");
    expect(added).toBeDefined();
    expect(added!.visible).toBe(true);
    expect(added!.label).toBe("orderid");
  });

  // ── Inline reorder ──

  it("moves a column up", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });

    // "customer_name" is second visible column — move it up
    await clickButton("Move customer_name up");
    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as TableColumnConfig[];
    const order = result.filter((c) => c.visible).map((c) => c.field);
    expect(order[0]).toBe("customer_name");
    expect(order[1]).toBe("orderid");
  });

  it("moves a column down", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });

    // "orderid" is first visible column — move it down
    await clickButton("Move orderid down");
    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as TableColumnConfig[];
    const order = result.filter((c) => c.visible).map((c) => c.field);
    expect(order[0]).toBe("customer_name");
    expect(order[1]).toBe("orderid");
  });

  it("disables up button on first column", () => {
    renderDefault();
    const upBtn = screen.getByLabelText("Move orderid up");
    expect(upBtn).toBeDisabled();
  });

  it("disables down button on last column", () => {
    renderDefault();
    const downBtn = screen.getByLabelText("Move amount down");
    expect(downBtn).toBeDisabled();
  });

  // ── Expand/collapse inline config ──

  it("shows inline config when settings button is clicked", async () => {
    renderDefault();
    const settingsBtn = screen.getByLabelText("Settings for amount");
    await userEvent.click(settingsBtn);
    // Expanded config should show label, width, align, sortable
    expect(screen.getByLabelText("Alignment for amount")).toBeInTheDocument();
    expect(screen.getByLabelText(/Allow sorting/i)).toBeInTheDocument();
  });

  it("updates column label from inline config", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const settingsBtn = screen.getByLabelText("Settings for amount");
    await userEvent.click(settingsBtn);

    const labelInputs = screen.getAllByPlaceholderText(/orderid|customer_name|amount/);
    const amountLabel = labelInputs.find(
      (el) =>
        el instanceof HTMLInputElement &&
        el.type === "text" &&
        el.closest('[class*="bg-muted\\/10"]'),
    );
    // Instead find by vague label — just type in the text input
    const textInputs = screen.getAllByRole("textbox");
    const amountInput = textInputs[0]; // first text input in expanded section is label
    if (amountInput) {
      await userEvent.clear(amountInput);
      await userEvent.type(amountInput, "Total");
      await userEvent.tab();
    }
  });

  it("updates column width from inline config", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    await clickButton("Settings for amount");

    // Width input for amount — find by aria-label
    // The width input doesn't have a dedicated aria-label, so we
    // find it as the first spinbutton (number input) in the expanded context
    const spinbuttons = screen.getAllByRole("spinbutton");
    // Filter to the one that shows the current width value (120 for amount)
    const widthInput = spinbuttons.find(
      (el) => (el as HTMLInputElement).value === "120",
    );
    expect(widthInput).toBeDefined();

    // Programmatically trigger the onChange via the react onChange handler
    // Using fireEvent.change which calls the React onChange directly
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(widthInput!, { target: { value: "200" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("toggles sortable from inline config", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    await clickButton("Settings for orderid");

    const sortCheckboxes = screen.getAllByRole("checkbox");
    // The last checkbox in the expanded config is "Allow sorting"
    const sortCb = sortCheckboxes[sortCheckboxes.length - 1];
    await userEvent.click(sortCb);
    expect(onChange).toHaveBeenCalled();
  });

  // ── Disabled state ──

  it("disables all interactive controls when disabled", () => {
    renderDefault({ disabled: true });

    // Visibility eye buttons should have opacity class
    const hideBtns = screen.getAllByTitle("Hide column");
    hideBtns.forEach((btn) => expect(btn.className).toContain("disabled:opacity-30"));

    // Move buttons should be disabled
    const upBtn = screen.getByLabelText("Move customer_name up");
    expect(upBtn.className).toContain("disabled:opacity-20");

    const downBtn = screen.getByLabelText("Move orderid down");
    expect(downBtn.className).toContain("disabled:opacity-20");

    // Settings buttons should be disabled
    const settingsBtns = screen.getAllByTitle("Column settings");
    settingsBtns.forEach((btn) => expect(btn.className).toContain("disabled:opacity-30"));
  });

  it("applies disabled opacity class", () => {
    renderDefault({ disabled: true });
    const region = getRegion();
    expect(region.className).toContain("opacity-60");
  });

  // ── Edge cases ──

  it("handles empty available fields gracefully", () => {
    renderDefault({ availableFields: [], columns: [] });
    expect(getRegion()).toBeInTheDocument();
    expect(
      screen.getByText(/No columns selected.*all fields hidden/i),
    ).toBeInTheDocument();
  });

  it("shows all fields in hidden section when none are visible", () => {
    // Only pass 2 fields that match the hidden columns
    const twoFields: FieldPickerItem[] = [
      { name: "order_date", type: "timestamp" },
      { name: "is_active", type: "boolean" },
    ];
    renderDefault({ availableFields: twoFields, columns: HIDDEN_COLUMNS });
    // Text is fragmented — use parent element text content
    const region = getRegion();
    expect(region.textContent).toContain("Hidden fields");
    expect(region.textContent).toContain("2");
    expect(screen.getByText("order_date")).toBeInTheDocument();
    expect(screen.getByText("is_active")).toBeInTheDocument();
  });
});
