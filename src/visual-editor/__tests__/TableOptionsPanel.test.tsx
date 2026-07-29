/**
 * Unit tests for TableOptionsPanel.
 *
 * Tests: rendering all sections, row height radio group, display toggles
 * (alternating rows, grid lines), interaction toggles (sorting, filtering,
 * row selection), page size stepper, disabled state, edge cases.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableOptionsPanel from "../TableOptionsPanel";
import type { TableOptionsPanelProps, TableOptions } from "../TableOptionsPanel";

// ─── Fixtures ─────────────────────────────────────────

const DEFAULT_OPTIONS: TableOptions = {
  rowHeight: "normal",
  alternatingRows: true,
  showGridLines: true,
  allowSorting: true,
  allowFiltering: true,
  allowRowSelection: true,
  pageSize: 50,
};

const DEFAULT_PROPS: TableOptionsPanelProps = {
  options: DEFAULT_OPTIONS,
  onChange: vi.fn(),
};

// ─── Helpers ──────────────────────────────────────────

function renderDefault(props?: Partial<TableOptionsPanelProps>) {
  return render(<TableOptionsPanel {...DEFAULT_PROPS} {...props} />);
}

function getRegion() {
  return screen.getByRole("region", { name: "Table options" });
}

// ─── Tests ────────────────────────────────────────────

describe("TableOptionsPanel", () => {
  // ── Rendering & structure ──

  it("renders the panel with accessible region", () => {
    renderDefault();
    expect(getRegion()).toBeInTheDocument();
  });

  it("renders all four section headers", () => {
    renderDefault();
    expect(screen.getByText("Row height")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
    expect(screen.getByText("Interaction")).toBeInTheDocument();
    expect(screen.getByText("Pagination")).toBeInTheDocument();
  });

  // ── Row height section ──

  it("renders three row height options", () => {
    renderDefault();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveTextContent("Compact");
    expect(radios[1]).toHaveTextContent("Normal");
    expect(radios[2]).toHaveTextContent("Comfortable");
  });

  it("highlights the current row height as checked", () => {
    renderDefault();
    const normalRadio = screen.getByRole("radio", { name: /normal/i });
    expect(normalRadio).toHaveAttribute("aria-checked", "true");

    const compactRadio = screen.getByRole("radio", { name: /compact/i });
    expect(compactRadio).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with compact row height", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const compactRadio = screen.getByRole("radio", { name: /compact/i });
    await userEvent.click(compactRadio);
    expect(onChange).toHaveBeenCalledWith({ rowHeight: "compact" });
  });

  it("calls onChange with comfortable row height", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const comfortableRadio = screen.getByRole("radio", { name: /comfortable/i });
    await userEvent.click(comfortableRadio);
    expect(onChange).toHaveBeenCalledWith({ rowHeight: "comfortable" });
  });

  // ── Display section ──

  it("renders alternating rows checkbox checked by default", () => {
    renderDefault();
    const cb = screen.getByRole("checkbox", { name: /alternating row colors/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("toggles alternating rows off", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const cb = screen.getByRole("checkbox", { name: /alternating row colors/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ alternatingRows: false });
  });

  it("toggles alternating rows back on", async () => {
    const onChange = vi.fn();
    renderDefault({ options: { ...DEFAULT_OPTIONS, alternatingRows: false }, onChange });
    const cb = screen.getByRole("checkbox", { name: /alternating row colors/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ alternatingRows: true });
  });

  it("renders show grid lines checkbox checked by default", () => {
    renderDefault();
    const cb = screen.getByRole("checkbox", { name: /show grid lines/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("toggles grid lines", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const cb = screen.getByRole("checkbox", { name: /show grid lines/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ showGridLines: false });
  });

  // ── Interaction section ──

  it("renders allow sorting checkbox checked by default", () => {
    renderDefault();
    const cb = screen.getByRole("checkbox", { name: /allow sorting/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("toggles sorting", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const cb = screen.getByRole("checkbox", { name: /allow sorting/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ allowSorting: false });
  });

  it("renders allow filtering checkbox checked by default", () => {
    renderDefault();
    const cb = screen.getByRole("checkbox", { name: /allow filtering/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("toggles filtering", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const cb = screen.getByRole("checkbox", { name: /allow filtering/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ allowFiltering: false });
  });

  it("renders row selection checkbox checked by default", () => {
    renderDefault();
    const cb = screen.getByRole("checkbox", { name: /row selection/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("toggles row selection", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const cb = screen.getByRole("checkbox", { name: /row selection/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ allowRowSelection: false });
  });

  // ── Pagination section ──

  it("renders page size with default value", () => {
    renderDefault();
    const input = screen.getByLabelText("Records per page");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(50);
  });

  it("calls onChange with decremented page size", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const decBtn = screen.getByLabelText("Decrease page size");
    await userEvent.click(decBtn);
    expect(onChange).toHaveBeenCalledWith({ pageSize: 40 });
  });

  it("calls onChange with incremented page size", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const incBtn = screen.getByLabelText("Increase page size");
    await userEvent.click(incBtn);
    expect(onChange).toHaveBeenCalledWith({ pageSize: 60 });
  });

  it("disables decrement at minimum page size (10)", () => {
    renderDefault({ options: { ...DEFAULT_OPTIONS, pageSize: 10 } });
    const decBtn = screen.getByLabelText("Decrease page size");
    expect(decBtn).toBeDisabled();
  });

  it("disables increment at maximum page size (500)", () => {
    renderDefault({ options: { ...DEFAULT_OPTIONS, pageSize: 500 } });
    const incBtn = screen.getByLabelText("Increase page size");
    expect(incBtn).toBeDisabled();
  });

  // ── Disabled state ──

  it("disables all interactive elements when disabled", () => {
    renderDefault({ disabled: true });

    // Row height radios
    screen.getAllByRole("radio").forEach((r) => {
      expect(r.className).toContain("pointer-events-none");
    });

    // Checkboxes
    screen.getAllByRole("checkbox").forEach((cb) => {
      expect(cb).toBeDisabled();
    });

    // Page size stepper
    expect(screen.getByLabelText("Decrease page size")).toBeDisabled();
    expect(screen.getByLabelText("Increase page size")).toBeDisabled();
    expect(screen.getByLabelText("Records per page")).toBeDisabled();
  });

  it("applies disabled opacity class", () => {
    renderDefault({ disabled: true });
    const region = getRegion();
    expect(region.className).toContain("opacity-60");
  });

  // ── Edge cases ──

  it("handles empty/undefined options gracefully", () => {
    renderDefault({ options: {} });
    // Should render without crashing
    expect(getRegion()).toBeInTheDocument();
    // Radio defaults to "normal"
    const normalRadio = screen.getByRole("radio", { name: /normal/i });
    expect(normalRadio).toHaveAttribute("aria-checked", "true");
    // Page size defaults to 50
    const input = screen.getByLabelText("Records per page");
    expect(input).toHaveValue(50);
  });

  it("renders unchecked when option is false", () => {
    renderDefault({
      options: {
        ...DEFAULT_OPTIONS,
        alternatingRows: false,
        showGridLines: false,
        allowSorting: false,
        allowFiltering: false,
        allowRowSelection: false,
      },
    });
    screen.getAllByRole("checkbox").forEach((cb) => {
      expect(cb).not.toBeChecked();
    });
  });

  it("renders page size with custom value", () => {
    renderDefault({ options: { ...DEFAULT_OPTIONS, pageSize: 100 } });
    const input = screen.getByLabelText("Records per page");
    expect(input).toHaveValue(100);
  });
});
