/**
 * Unit tests for ColumnLayoutConfig.
 *
 * Tests: rendering, column stepper, label width presets, panel toggles,
 * disabled state, edge cases (min/max columns).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ColumnLayoutConfig from "../ColumnLayoutConfig";
import type { ColumnLayoutConfigProps } from "../ColumnLayoutConfig";

// ─── Fixtures ─────────────────────────────────────────

const DEFAULT_PROPS: ColumnLayoutConfigProps = {
  columns: 2,
  onColumnsChange: vi.fn(),
  labelWidth: 30,
  onLabelWidthChange: vi.fn(),
  panels: { header: true, detail: true, footer: false },
  onPanelToggle: vi.fn(),
};

// ─── Helpers ──────────────────────────────────────────

function renderDefault(props?: Partial<ColumnLayoutConfigProps>) {
  return render(<ColumnLayoutConfig {...DEFAULT_PROPS} {...props} />);
}

async function clickButton(textOrTitle: string | RegExp) {
  const btn = screen.getByRole("button", { name: textOrTitle });
  await userEvent.click(btn);
}

// ─── Tests ────────────────────────────────────────────

describe("ColumnLayoutConfig", () => {
  it("renders columns section with stepper and current value", () => {
    renderDefault();
    expect(screen.getByText("Columns")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decrease columns" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase columns" })).toBeInTheDocument();
  });

  it("renders label width presets with active state", () => {
    renderDefault();
    expect(screen.getByText("Label width")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();

    // 30% should be checked as the default
    const radio30 = screen.getByRole("radio", { name: "30%" });
    expect(radio30).toHaveAttribute("aria-checked", "true");

    const radio20 = screen.getByRole("radio", { name: "20%" });
    expect(radio20).toHaveAttribute("aria-checked", "false");
  });

  it("renders panel toggles with correct checked state", () => {
    renderDefault();
    expect(screen.getByText("Visible panels")).toBeInTheDocument();

    const headerCb = screen.getByRole("checkbox", { name: /header/i });
    const detailCb = screen.getByRole("checkbox", { name: /detail/i });
    const footerCb = screen.getByRole("checkbox", { name: /footer/i });

    expect(headerCb).toBeChecked();
    expect(detailCb).toBeChecked();
    expect(footerCb).not.toBeChecked();
  });

  it("calls onColumnsChange with decremented value on minus click", async () => {
    const onColumnsChange = vi.fn();
    renderDefault({ columns: 3, onColumnsChange });

    await clickButton("Decrease columns");
    expect(onColumnsChange).toHaveBeenCalledWith(2);
  });

  it("calls onColumnsChange with incremented value on plus click", async () => {
    const onColumnsChange = vi.fn();
    renderDefault({ columns: 1, onColumnsChange });

    await clickButton("Increase columns");
    expect(onColumnsChange).toHaveBeenCalledWith(2);
  });

  it("disables minus button at minimum columns (1)", () => {
    renderDefault({ columns: 1 });
    const decBtn = screen.getByRole("button", { name: "Decrease columns" });
    expect(decBtn).toBeDisabled();
  });

  it("disables plus button at maximum columns (6)", () => {
    renderDefault({ columns: 6 });
    const incBtn = screen.getByRole("button", { name: "Increase columns" });
    expect(incBtn).toBeDisabled();
  });

  it("does not call onColumnsChange when at bounds", async () => {
    const onColumnsChange = vi.fn();
    renderDefault({ columns: 1, onColumnsChange });

    await clickButton("Decrease columns");
    expect(onColumnsChange).not.toHaveBeenCalled();
  });

  it("calls onLabelWidthChange when a preset is clicked", async () => {
    const onLabelWidthChange = vi.fn();
    renderDefault({ onLabelWidthChange });

    const radio40 = screen.getByRole("radio", { name: "40%" });
    await userEvent.click(radio40);
    expect(onLabelWidthChange).toHaveBeenCalledWith(40);
  });

  it("calls onLabelWidthChange when another preset is selected", async () => {
    const onLabelWidthChange = vi.fn();
    renderDefault({ labelWidth: 40, onLabelWidthChange });

    const radio20 = screen.getByRole("radio", { name: "20%" });
    await userEvent.click(radio20);
    expect(onLabelWidthChange).toHaveBeenCalledWith(20);
  });

  it("toggles header panel on checkbox click", async () => {
    const onPanelToggle = vi.fn();
    renderDefault({ onPanelToggle });

    const headerCb = screen.getByRole("checkbox", { name: /header/i });
    await userEvent.click(headerCb);

    expect(onPanelToggle).toHaveBeenCalledWith("header", false);
  });

  it("toggles footer panel on checkbox click", async () => {
    const onPanelToggle = vi.fn();
    renderDefault({ panels: { header: true, detail: true, footer: false }, onPanelToggle });

    const footerCb = screen.getByRole("checkbox", { name: /footer/i });
    await userEvent.click(footerCb);

    expect(onPanelToggle).toHaveBeenCalledWith("footer", true);
  });

  it("applies disabled state to all interactive elements", () => {
    renderDefault({ disabled: true });

    // Stepper buttons disabled
    expect(screen.getByRole("button", { name: "Decrease columns" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase columns" })).toBeDisabled();

    // Label width radios disabled
    const radios = screen.getAllByRole("radio");
    radios.forEach((r) => expect(r).toBeDisabled());

    // Checkboxes disabled
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).toBeDisabled());
  });

  it("renders with single column and shows 1", () => {
    renderDefault({ columns: 1 });
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders with maximum columns and shows 6", () => {
    renderDefault({ columns: 6 });
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("renders with all panels hidden", () => {
    renderDefault({
      panels: { header: false, detail: false, footer: false },
    });

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it("renders with all panels visible", () => {
    renderDefault({
      panels: { header: true, detail: true, footer: true },
    });

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  it("shows label width 20% as active when selected", () => {
    renderDefault({ labelWidth: 20 });
    const radio20 = screen.getByRole("radio", { name: "20%" });
    expect(radio20).toHaveAttribute("aria-checked", "true");

    const radio30 = screen.getByRole("radio", { name: "30%" });
    expect(radio30).toHaveAttribute("aria-checked", "false");
  });

  it("applies proper aria attributes to the root group", () => {
    renderDefault();
    const group = screen.getByRole("group", { name: "Column layout configuration" });
    expect(group).toBeInTheDocument();
  });
});