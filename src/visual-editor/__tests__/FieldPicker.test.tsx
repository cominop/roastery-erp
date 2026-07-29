/**
 * Unit tests for FieldPicker two-list selector.
 *
 * Tests: rendering, checkbox toggling, move operations (single + all),
 * search filtering, inline reordering, disabled state, and custom labels.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FieldPicker from "../FieldPicker";
import type { FieldPickerItem } from "../FieldPicker";

// ─── Fixtures ─────────────────────────────────────────

const ALL_FIELDS: FieldPickerItem[] = [
  { name: "id", type: "integer" },
  { name: "customer_name", type: "varchar(100)" },
  { name: "email", type: "varchar(255)" },
  { name: "amount", type: "numeric(10,2)" },
  { name: "created_at", type: "timestamp" },
  { name: "is_active", type: "boolean" },
  { name: "notes", type: "text" },
];

const SOME_SELECTED: FieldPickerItem[] = [
  { name: "customer_name", type: "varchar(100)" },
  { name: "amount", type: "numeric(10,2)" },
];

// ─── Helpers ──────────────────────────────────────────

function getCheckbox(label: string): HTMLInputElement {
  return screen.getByRole("checkbox", { name: new RegExp(label, "i") });
}

async function clickButton(title: string) {
  const btn = screen.getByTitle(title);
  await userEvent.click(btn);
}

// ─── Tests ────────────────────────────────────────────

describe("FieldPicker", () => {
  it("renders both panels with counts", () => {
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText(/Available Fields/)).toBeInTheDocument();
    expect(screen.getByText(/Selected Fields/)).toBeInTheDocument();

    // 7 total - 2 selected = 5 available
    expect(screen.getByText(/\(5\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(2\)/)).toBeInTheDocument();
  });

  it("shows empty state when no fields selected and none available", () => {
    render(
      <FieldPicker
        availableFields={[]}
        selectedFields={[]}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("All fields selected")).toBeInTheDocument();
    expect(screen.getByText("No fields selected")).toBeInTheDocument();
  });

  it("displays field names with type badges", () => {
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={() => {}}
      />,
    );

    // Available fields
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getByText("created_at")).toBeInTheDocument();
    expect(screen.getByText("is_active")).toBeInTheDocument();
    expect(screen.getByText("notes")).toBeInTheDocument();

    // Selected fields
    expect(screen.getByText("customer_name")).toBeInTheDocument();
    expect(screen.getByText("amount")).toBeInTheDocument();

    // Type badges
    expect(screen.getAllByText("number").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("text").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("date").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("boolean").length).toBeGreaterThanOrEqual(1);
  });

  it("toggles checkbox on click", async () => {
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={() => {}}
      />,
    );

    const cb = getCheckbox("id");
    expect(cb).not.toBeChecked();

    await userEvent.click(cb);
    expect(cb).toBeChecked();

    await userEvent.click(cb);
    expect(cb).not.toBeChecked();
  });

  it("moves selected fields right with > button", async () => {
    const onChange = vi.fn();
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={onChange}
      />,
    );

    // Check "id" and "email" in available side
    await userEvent.click(getCheckbox("id"));
    await userEvent.click(getCheckbox("email"));

    // Click move right
    await clickButton("Move selected →");

    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as FieldPickerItem[];
    expect(result).toHaveLength(SOME_SELECTED.length + 2);
    expect(result.map((f) => f.name)).toContain("id");
    expect(result.map((f) => f.name)).toContain("email");
  });

  it("does not call onChange when > clicked with no selection", async () => {
    const onChange = vi.fn();
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={onChange}
      />,
    );

    await clickButton("Move selected →");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves selected fields left with < button", async () => {
    const onChange = vi.fn();
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={onChange}
      />,
    );

    // Check "customer_name" in selected side
    await userEvent.click(getCheckbox("customer_name"));

    // Click move left
    await clickButton("← Move selected");

    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as FieldPickerItem[];
    expect(result).toHaveLength(SOME_SELECTED.length - 1);
    expect(result.map((f) => f.name)).not.toContain("customer_name");
  });

  it("moves all fields right with >> button", async () => {
    const onChange = vi.fn();
    const emptySelected: FieldPickerItem[] = [];
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={emptySelected}
        onChange={onChange}
      />,
    );

    await clickButton("Move all →");

    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as FieldPickerItem[];
    expect(result).toHaveLength(ALL_FIELDS.length);
  });

  it("moves all fields left with << button", async () => {
    const onChange = vi.fn();
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={ALL_FIELDS}
        onChange={onChange}
      />,
    );

    await clickButton("← Move all");

    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as FieldPickerItem[];
    expect(result).toHaveLength(0);
  });

  it("filters available fields by search", async () => {
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={() => {}}
      />,
    );

    const searchInputs = screen.getAllByPlaceholderText("Filter...");
    const availSearch = searchInputs[0];
    await userEvent.type(availSearch, "email");

    // "email" should be visible
    expect(screen.getByText("email")).toBeInTheDocument();
    // "id" should be filtered out
    expect(screen.queryByText("id")).not.toBeInTheDocument();
  });

  it("filters selected fields by search", async () => {
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={() => {}}
      />,
    );

    const searchInputs = screen.getAllByPlaceholderText("Filter...");
    const selSearch = searchInputs[1];
    await userEvent.type(selSearch, "amount");

    expect(screen.getByText("amount")).toBeInTheDocument();
    expect(screen.queryByText("customer_name")).not.toBeInTheDocument();
  });

  it("shows 'No fields match filter' when search has no matches", async () => {
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={() => {}}
      />,
    );

    const searchInputs = screen.getAllByPlaceholderText("Filter...");
    const availSearch = searchInputs[0];
    await userEvent.type(availSearch, "zzzzz");

    expect(screen.getByText("No fields match filter")).toBeInTheDocument();
  });

  it("moves a field up with inline reorder button", async () => {
    const onChange = vi.fn();
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={[
          { name: "id", type: "integer" },
          { name: "amount", type: "numeric" },
        ]}
        onChange={onChange}
      />,
    );

    // Click the up arrow on "amount" (second item, can move up)
    const upButtons = screen.getAllByTitle("Move up");
    // The up button for "amount" should be the second one (one per row)
    // We target by finding the label that contains "amount" and clicking its up button
    const amountRow = screen.getByText("amount").closest("label");
    expect(amountRow).not.toBeNull();
    const upBtn = amountRow!.querySelector('[title="Move up"]');
    expect(upBtn).not.toBeNull();
    await userEvent.click(upBtn!);

    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as FieldPickerItem[];
    expect(result[0].name).toBe("amount");
    expect(result[1].name).toBe("id");
  });

  it("moves a field down with inline reorder button", async () => {
    const onChange = vi.fn();
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={[
          { name: "id", type: "integer" },
          { name: "amount", type: "numeric" },
        ]}
        onChange={onChange}
      />,
    );

    // Click the down arrow on "id" (first item, can move down)
    const idRow = screen.getByText("id").closest("label");
    expect(idRow).not.toBeNull();
    const downBtn = idRow!.querySelector('[title="Move down"]');
    expect(downBtn).not.toBeNull();
    await userEvent.click(downBtn!);

    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0] as FieldPickerItem[];
    expect(result[0].name).toBe("amount");
    expect(result[1].name).toBe("id");
  });

  it("does not call onChange when moving first item up or last item down", async () => {
    const onChange = vi.fn();
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={[
          { name: "id", type: "integer" },
          { name: "amount", type: "numeric" },
        ]}
        onChange={onChange}
      />,
    );

    // Try to move "id" up (first item, should be disabled)
    const idRow = screen.getByText("id").closest("label");
    const upBtn = idRow!.querySelector('[title="Move up"]') as HTMLButtonElement;
    expect(upBtn.disabled).toBe(true);

    // Try to move "amount" down (last item, should be disabled)
    const amountRow = screen.getByText("amount").closest("label");
    const downBtn = amountRow!.querySelector('[title="Move down"]') as HTMLButtonElement;
    expect(downBtn.disabled).toBe(true);

    // Even if we somehow click, onChange should not be called
    // Since they're disabled, the click won't fire
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders with custom labels", () => {
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={() => {}}
        availableLabel="Source Columns"
        selectedLabel="Target Columns"
      />,
    );

    expect(screen.getByText(/Source Columns/)).toBeInTheDocument();
    expect(screen.getByText(/Target Columns/)).toBeInTheDocument();
  });

  it("applies disabled class but still renders fields", () => {
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={() => {}}
        disabled
      />,
    );

    // The container should have opacity-60
    const container = screen.getByTitle("Move all →").closest("div")?.parentElement;
    expect(container?.className).toContain("opacity-60");

    // Fields should still be visible
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("customer_name")).toBeInTheDocument();
  });

  it("clears checkboxes after move operation", async () => {
    const onChange = vi.fn();
    render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={onChange}
      />,
    );

    const cb = getCheckbox("id");
    await userEvent.click(cb);
    expect(cb).toBeChecked();

    await clickButton("Move selected →");

    // Checkbox should be cleared after move
    expect(cb).not.toBeChecked();
  });

  it("counts update correctly after move all left", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={SOME_SELECTED}
        onChange={onChange}
      />,
    );

    expect(screen.getByText(/\(5\)/)).toBeInTheDocument(); // available
    expect(screen.getByText(/\(2\)/)).toBeInTheDocument(); // selected

    // Simulate parent calling onChange (which then sets new selectedFields)
    await clickButton("← Move all");
    rerender(
      <FieldPicker
        availableFields={ALL_FIELDS}
        selectedFields={[]}
        onChange={onChange}
      />,
    );

    expect(screen.getByText(/\(7\)/)).toBeInTheDocument(); // all available now
    expect(screen.getByText(/\(0\)/)).toBeInTheDocument(); // none selected
  });
});