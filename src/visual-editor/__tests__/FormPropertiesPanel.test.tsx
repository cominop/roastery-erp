/**
 * Unit tests for FormPropertiesPanel.
 *
 * Tests: rendering, width stepper/input, border style radios, history toggle,
 * buttons & chrome section, scroll bars selector, disabled state, edge cases.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormPropertiesPanel from "../FormPropertiesPanel";
import type { FormPropertiesPanelProps, FormProperties } from "../FormPropertiesPanel";

// ─── Fixtures ─────────────────────────────────────────

const DEFAULT_VALUES: FormProperties = {
  width: 14400,
  borderStyle: 'sizable',
  historyEnabled: true,
  navigationButtons: true,
  recordSelectors: true,
  scrollBars: 'both',
  closeButton: true,
  minMaxButtons: true,
};

const DEFAULT_PROPS: FormPropertiesPanelProps = {
  values: DEFAULT_VALUES,
  onChange: vi.fn(),
};

// ─── Helpers ──────────────────────────────────────────

function renderDefault(props?: Partial<FormPropertiesPanelProps>) {
  return render(<FormPropertiesPanel {...DEFAULT_PROPS} {...props} />);
}

function getRegion() {
  return screen.getByRole("region", { name: "Form properties" });
}

// ─── Tests ────────────────────────────────────────────

describe("FormPropertiesPanel", () => {
  // ── Rendering & structure ──

  it("renders the panel with accessible region", () => {
    renderDefault();
    expect(getRegion()).toBeInTheDocument();
  });

  it("renders all four section headers", () => {
    renderDefault();
    expect(screen.getByText("Width")).toBeInTheDocument();
    expect(screen.getByText("Border")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText(/Buttons & chrome/i)).toBeInTheDocument();
  });

  // ── Width section ──

  it("renders width stepper with current value", () => {
    renderDefault();
    expect(screen.getByText("Form width")).toBeInTheDocument();
    expect(screen.getByDisplayValue("14400")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Decrease form width" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase form width" }),
    ).toBeInTheDocument();
  });

  it("calls onChange with decremented width", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const decBtn = screen.getByRole("button", {
      name: "Decrease form width",
    });
    await userEvent.click(decBtn);
    expect(onChange).toHaveBeenCalledWith({ width: 14160 });
  });

  it("calls onChange with incremented width", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const incBtn = screen.getByRole("button", {
      name: "Increase form width",
    });
    await userEvent.click(incBtn);
    expect(onChange).toHaveBeenCalledWith({ width: 14640 });
  });

  it("disables decrement at minimum width (3000)", () => {
    renderDefault({ values: { ...DEFAULT_VALUES, width: 3000 } });
    const decBtn = screen.getByRole("button", {
      name: "Decrease form width",
    });
    expect(decBtn).toBeDisabled();
  });

  it("disables increment at maximum width (60000)", () => {
    renderDefault({ values: { ...DEFAULT_VALUES, width: 60000 } });
    const incBtn = screen.getByRole("button", {
      name: "Increase form width",
    });
    expect(incBtn).toBeDisabled();
  });

  it("does not call onChange when clicking disabled width bounds", async () => {
    const onChange = vi.fn();
    renderDefault({ values: { ...DEFAULT_VALUES, width: 3000 }, onChange });
    const decBtn = screen.getByRole("button", {
      name: "Decrease form width",
    });
    await userEvent.click(decBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts a valid typed width on blur", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const input = screen.getByLabelText("Form width in twips");
    await userEvent.clear(input);
    await userEvent.type(input, "20000");
    // trigger blur
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith({ width: 20000 });
  });

  it("resets width input on blur when value is out of range", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const input = screen.getByLabelText("Form width in twips");
    await userEvent.clear(input);
    await userEvent.type(input, "100");
    await userEvent.click(document.body);
    // onChange should NOT be called because 100 is below minimum
    expect(onChange).not.toHaveBeenCalledWith({ width: 100 });
  });

  // ── Border section ──

  it("renders border style radio group with four options", () => {
    renderDefault();
    const radios = screen.getAllByRole("radio");
    // 4 border options + 0 scroll radios (scroll uses select)
    const borderRadios = radios.slice(0, 4);
    expect(borderRadios).toHaveLength(4);
    expect(borderRadios[0]).toHaveTextContent("None");
    expect(borderRadios[1]).toHaveTextContent("Thin");
    expect(borderRadios[2]).toHaveTextContent("Sizable");
    expect(borderRadios[3]).toHaveTextContent("Dialog");
  });

  it("highlights the current border style as checked", () => {
    renderDefault();
    const sizableRadio = screen.getByRole("radio", { name: "Sizable" });
    expect(sizableRadio).toHaveAttribute("aria-checked", "true");

    const noneRadio = screen.getByRole("radio", { name: "None" });
    expect(noneRadio).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with new border style on click", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const thinRadio = screen.getByRole("radio", { name: "Thin" });
    await userEvent.click(thinRadio);
    expect(onChange).toHaveBeenCalledWith({ borderStyle: "thin" });
  });

  it("calls onChange with 'none' border style on click", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const noneRadio = screen.getByRole("radio", { name: "None" });
    await userEvent.click(noneRadio);
    expect(onChange).toHaveBeenCalledWith({ borderStyle: "none" });
  });

  it("calls onChange with 'dialog' border style on click", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const dialogRadio = screen.getByRole("radio", { name: "Dialog" });
    await userEvent.click(dialogRadio);
    expect(onChange).toHaveBeenCalledWith({ borderStyle: "dialog" });
  });

  // ── History section ──

  it("renders history checkbox with label", () => {
    renderDefault();
    const checkbox = screen.getByRole("checkbox", {
      name: /track edit history/i,
    });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it("toggles history off on click", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const checkbox = screen.getByRole("checkbox", {
      name: /track edit history/i,
    });
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ historyEnabled: false });
  });

  it("toggles history back on when previously off", async () => {
    const onChange = vi.fn();
    renderDefault({
      values: { ...DEFAULT_VALUES, historyEnabled: false },
      onChange,
    });
    const checkbox = screen.getByRole("checkbox", {
      name: /track edit history/i,
    });
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ historyEnabled: true });
  });

  // ── Buttons & chrome section ──

  it("renders navigation buttons checkbox", () => {
    renderDefault();
    const cb = screen.getByRole("checkbox", { name: /navigation buttons/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("toggles navigation buttons", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const cb = screen.getByRole("checkbox", { name: /navigation buttons/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ navigationButtons: false });
  });

  it("renders record selectors checkbox", () => {
    renderDefault();
    const cb = screen.getByRole("checkbox", { name: /record selectors/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("toggles record selectors", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const cb = screen.getByRole("checkbox", { name: /record selectors/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ recordSelectors: false });
  });

  it("renders scroll bars select with four options", () => {
    renderDefault();
    const select = screen.getByLabelText("Scroll bar style");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("both");
    // Verify options exist
    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(4);
    expect(options[0]).toHaveTextContent("None");
    expect(options[1]).toHaveTextContent("Vertical");
    expect(options[2]).toHaveTextContent("Horizontal");
    expect(options[3]).toHaveTextContent("Both");
  });

  it("calls onChange when scroll bar style changes", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const select = screen.getByLabelText("Scroll bar style");
    await userEvent.selectOptions(select, "vertical");
    expect(onChange).toHaveBeenCalledWith({ scrollBars: "vertical" });
  });

  it("renders close button checkbox", () => {
    renderDefault();
    const cb = screen.getByRole("checkbox", { name: /^close$/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("toggles close button", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const cb = screen.getByRole("checkbox", { name: /^close$/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ closeButton: false });
  });

  it("renders min/max buttons checkbox", () => {
    renderDefault();
    const cb = screen.getByRole("checkbox", { name: /min\/max/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("toggles min/max buttons", async () => {
    const onChange = vi.fn();
    renderDefault({ onChange });
    const cb = screen.getByRole("checkbox", { name: /min\/max/i });
    await userEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ minMaxButtons: false });
  });

  // ── Default values — all true ──

  it("checks all checkboxes by default", () => {
    renderDefault();
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => {
      expect(cb).toBeChecked();
    });
  });

  // ── Alternative state: all off ──

  it("unchecks all checkboxes when values are false", () => {
    const allOff: FormProperties = {
      width: 14400,
      borderStyle: 'sizable',
      historyEnabled: false,
      navigationButtons: false,
      recordSelectors: false,
      scrollBars: 'none',
      closeButton: false,
      minMaxButtons: false,
    };
    renderDefault({ values: allOff });
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => {
      expect(cb).not.toBeChecked();
    });
  });

  // ── Disabled state ──

  it("disables all interactive elements when disabled", () => {
    renderDefault({ disabled: true });

    // Width stepper buttons
    expect(
      screen.getByRole("button", { name: "Decrease form width" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Increase form width" }),
    ).toBeDisabled();

    // Width input
    expect(screen.getByLabelText("Form width in twips")).toBeDisabled();

    // Border radios
    screen.getAllByRole("radio").forEach((r) => expect(r).toBeDisabled());

    // Scroll bar select
    expect(screen.getByLabelText("Scroll bar style")).toBeDisabled();

    // All checkboxes
    screen.getAllByRole("checkbox").forEach((cb) => expect(cb).toBeDisabled());
  });

  it("applies disabled opacity class to the region", () => {
    const { container } = renderDefault({ disabled: true });
    // The outer region div gets opacity-60
    const region = getRegion();
    expect(region.className).toContain("opacity-60");
  });

  // ── Edge cases ──

  it("handles empty/undefined values gracefully", () => {
    renderDefault({ values: {} });
    // Should render without crashing with defaults assumed by controlled inputs
    // Width shows empty input (since it's controlled via widthDraft)
    const widthInput = screen.getByLabelText("Form width in twips");
    // borderStyle defaults to 'sizable' via internal default
    const sizableRadio = screen.getByRole("radio", { name: "Sizable" });
    expect(sizableRadio).toHaveAttribute("aria-checked", "true");
    expect(widthInput).toBeInTheDocument();
  });

  it("shows correct scroll bar value when 'horizontal'", () => {
    renderDefault({
      values: { ...DEFAULT_VALUES, scrollBars: "horizontal" },
    });
    const select = screen.getByLabelText("Scroll bar style");
    expect(select).toHaveValue("horizontal");
  });

  it("shows correct scroll bar value when 'none'", () => {
    renderDefault({
      values: { ...DEFAULT_VALUES, scrollBars: "none" },
    });
    const select = screen.getByLabelText("Scroll bar style");
    expect(select).toHaveValue("none");
  });
});