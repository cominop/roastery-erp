/**
 * Unit tests for FieldEditorDialog.
 *
 * Tests: open/close, create vs edit mode, section navigation, general tab,
 * data tab, style tab, behavior tab, validation tab, events tab, save, cancel,
 * disabled-like empty state, edge cases.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FieldEditorDialog from "../FieldEditorDialog";
import type { FieldEditorDialogProps } from "../FieldEditorDialog";
import type { VisualEditorControl } from "../types";

// ─── Fixtures ─────────────────────────────────────────

const SAMPLE_CONTROL: VisualEditorControl = {
  id: "ctrl-001",
  type: "text-box",
  name: "CustomerName",
  caption: "Customer Name",
  left: 300,
  top: 300,
  width: 2880,
  height: 270,
  visible: true,
  enabled: true,
  locked: false,
  tabIndex: 0,
  dataBinding: {
    controlSource: "customers.name",
  },
  style: {
    backColor: "#ffffff",
    foreColor: "#000000",
    borderColor: "#cccccc",
    borderStyle: "solid",
    borderWidth: 1,
    fontName: "Segoe UI",
    fontSize: 8,
    fontBold: false,
    fontItalic: false,
    fontUnderline: false,
    textAlign: "left",
  },
  validation: {
    rule: "> 0",
    text: "Must be positive",
  },
  events: {
    onClick: "HandleClick",
    onChange: "HandleChange",
  },
};

const DEFAULT_PROPS: FieldEditorDialogProps = {
  open: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
};

// ─── Helpers ──────────────────────────────────────────

function renderDefault(props?: Partial<FieldEditorDialogProps>) {
  return render(<FieldEditorDialog {...DEFAULT_PROPS} {...props} />);
}

function getDialog() {
  return screen.getByRole("dialog");
}

// ─── Tests ────────────────────────────────────────────

describe("FieldEditorDialog", () => {
  // ── Rendering & structure ──

  it("renders nothing when closed", () => {
    renderDefault({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog with accessible role when open", () => {
    renderDefault();
    expect(getDialog()).toBeInTheDocument();
  });

  it("renders in create mode with 'New Field' title", () => {
    renderDefault();
    expect(screen.getByText("New Field")).toBeInTheDocument();
  });

  it("renders in edit mode with control name in title", () => {
    renderDefault({ control: SAMPLE_CONTROL });
    expect(screen.getByText("Edit: CustomerName")).toBeInTheDocument();
  });

  it("renders footer buttons: Cancel and Create/Update", () => {
    renderDefault();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Create Field")).toBeInTheDocument();
  });

  it("shows 'Update Field' in edit mode", () => {
    renderDefault({ control: SAMPLE_CONTROL });
    expect(screen.getByText("Update Field")).toBeInTheDocument();
  });

  // ── Section navigation ──

  it("renders all six section tabs", () => {
    renderDefault();
    expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Data" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Style" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Behavior" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Validation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Events" })).toBeInTheDocument();
  });

  it("defaults to General tab selected", () => {
    renderDefault();
    const generalTab = screen.getByRole("tab", { name: "General" });
    expect(generalTab).toHaveAttribute("aria-selected", "true");
  });

  it("switches to Data tab on click", async () => {
    renderDefault();
    const dataTab = screen.getByRole("tab", { name: "Data" });
    await userEvent.click(dataTab);
    expect(dataTab).toHaveAttribute("aria-selected", "true");
    // General should no longer be selected
    const generalTab = screen.getByRole("tab", { name: "General" });
    expect(generalTab).toHaveAttribute("aria-selected", "false");
  });

  it("switches to Events tab on click", async () => {
    renderDefault();
    const eventsTab = screen.getByRole("tab", { name: "Events" });
    await userEvent.click(eventsTab);
    expect(eventsTab).toHaveAttribute("aria-selected", "true");
  });

  // ── General tab ──

  it("renders General tab fields: Name, Type, Caption, Position", () => {
    renderDefault({ control: SAMPLE_CONTROL });
    // Check that fields are populated
    const nameInput = screen.getByLabelText("Field name");
    expect(nameInput).toHaveValue("CustomerName");

    const typeSelect = screen.getByLabelText("Control type");
    expect(typeSelect).toHaveValue("text-box");

    const captionInput = screen.getByLabelText("Caption");
    expect(captionInput).toHaveValue("Customer Name");

    const leftInput = screen.getByLabelText("Left position");
    expect(leftInput).toHaveValue(300);

    const topInput = screen.getByLabelText("Top position");
    expect(topInput).toHaveValue(300);

    const widthInput = screen.getByLabelText("Width");
    expect(widthInput).toHaveValue(2880);

    const heightInput = screen.getByLabelText("Height");
    expect(heightInput).toHaveValue(270);
  });

  it("updates name field on user input", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const nameInput = screen.getByLabelText("Field name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "NewName");
    expect(nameInput).toHaveValue("NewName");
  });

  it("changes control type on select", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const typeSelect = screen.getByLabelText("Control type");
    await userEvent.selectOptions(typeSelect, "check-box");
    expect(typeSelect).toHaveValue("check-box");
  });

  // ── Data tab ──

  it("renders Data tab fields populated from control", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const dataTab = screen.getByRole("tab", { name: "Data" });
    await userEvent.click(dataTab);

    const sourceInput = screen.getByLabelText("Control source");
    expect(sourceInput).toHaveValue("customers.name");
  });

  it("updates control source on Data tab", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const dataTab = screen.getByRole("tab", { name: "Data" });
    await userEvent.click(dataTab);

    const sourceInput = screen.getByLabelText("Control source");
    await userEvent.clear(sourceInput);
    await userEvent.type(sourceInput, "orders.total");
    expect(sourceInput).toHaveValue("orders.total");
  });

  it("shows expression input when calculated field is checked", async () => {
    renderDefault();
    const dataTab = screen.getByRole("tab", { name: "Data" });
    await userEvent.click(dataTab);

    const calcCheckbox = screen.getByRole("checkbox", {
      name: /calculated field/i,
    });
    await userEvent.click(calcCheckbox);

    expect(screen.getByLabelText("Expression")).toBeInTheDocument();
  });

  // ── Style tab ──

  it("renders Style tab with color pickers and font controls", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const styleTab = screen.getByRole("tab", { name: "Style" });
    await userEvent.click(styleTab);

    expect(screen.getByLabelText("Background color")).toBeInTheDocument();
    expect(screen.getByLabelText("Foreground color")).toBeInTheDocument();
    expect(screen.getByLabelText("Border color")).toBeInTheDocument();
    expect(screen.getByLabelText("Border style")).toHaveValue("solid");
    expect(screen.getByLabelText("Font name")).toHaveValue("Segoe UI");
    expect(screen.getByLabelText("Font size")).toHaveValue(8);
    expect(screen.getByLabelText("Text alignment")).toHaveValue("left");
  });

  it("toggles bold/italic/underline on Style tab", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const styleTab = screen.getByRole("tab", { name: "Style" });
    await userEvent.click(styleTab);

    const boldCheckbox = screen.getByRole("checkbox", { name: /^bold$/i });
    const italicCheckbox = screen.getByRole("checkbox", { name: /^italic$/i });

    expect(boldCheckbox).not.toBeChecked();
    expect(italicCheckbox).not.toBeChecked();

    await userEvent.click(boldCheckbox);
    expect(boldCheckbox).toBeChecked();

    await userEvent.click(italicCheckbox);
    expect(italicCheckbox).toBeChecked();
  });

  // ── Behavior tab ──

  it("renders Behavior tab with toggle checkboxes", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const behaviorTab = screen.getByRole("tab", { name: "Behavior" });
    await userEvent.click(behaviorTab);

    // Should have visible, enabled, locked checkboxes
    expect(screen.getByRole("checkbox", { name: /^visible$/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^enabled$/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^locked$/i })).not.toBeChecked();
    expect(screen.getByLabelText("Tab index")).toHaveValue(0);
  });

  it("toggles locked state on Behavior tab", async () => {
    renderDefault();
    const behaviorTab = screen.getByRole("tab", { name: "Behavior" });
    await userEvent.click(behaviorTab);

    const lockedCheckbox = screen.getByRole("checkbox", { name: /^locked$/i });
    expect(lockedCheckbox).not.toBeChecked();
    await userEvent.click(lockedCheckbox);
    expect(lockedCheckbox).toBeChecked();
  });

  // ── Validation tab ──

  it("renders Validation tab with rule and text fields", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const validationTab = screen.getByRole("tab", { name: "Validation" });
    await userEvent.click(validationTab);

    expect(screen.getByLabelText("Validation rule")).toHaveValue("> 0");
    expect(screen.getByLabelText("Validation text")).toHaveValue(
      "Must be positive",
    );
  });

  it("updates validation rule on input", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const validationTab = screen.getByRole("tab", { name: "Validation" });
    await userEvent.click(validationTab);

    const ruleInput = screen.getByLabelText("Validation rule");
    await userEvent.clear(ruleInput);
    await userEvent.type(ruleInput, "> 10");
    expect(ruleInput).toHaveValue("> 10");
  });

  // ── Events tab ──

  it("renders Events tab with event fields", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const eventsTab = screen.getByRole("tab", { name: "Events" });
    await userEvent.click(eventsTab);

    expect(screen.getByLabelText("On Click")).toHaveValue("HandleClick");
    expect(screen.getByLabelText("On Change")).toHaveValue("HandleChange");
    // Empty event fields show placeholder
    expect(screen.getByLabelText("On Double Click")).toHaveValue("");
  });

  it("updates an event field on input", async () => {
    renderDefault({ control: SAMPLE_CONTROL });
    const eventsTab = screen.getByRole("tab", { name: "Events" });
    await userEvent.click(eventsTab);

    const dblClickInput = screen.getByLabelText("On Double Click");
    await userEvent.type(dblClickInput, "HandleDblClick");
    expect(dblClickInput).toHaveValue("HandleDblClick");
  });

  // ── Save / Cancel ──

  it("calls onSave with the control when Create Field is clicked", async () => {
    const onSave = vi.fn();
    renderDefault({ onSave });

    // Fill in a name first
    const nameInput = screen.getByLabelText("Field name");
    await userEvent.type(nameInput, "TestField");

    const createBtn = screen.getByText("Create Field");
    await userEvent.click(createBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as VisualEditorControl;
    expect(saved.name).toBe("TestField");
    expect(saved.id).toBeTruthy();
    expect(saved.type).toBe("text-box");
  });

  it("calls onSave with the control when Update Field is clicked", async () => {
    const onSave = vi.fn();
    renderDefault({ control: SAMPLE_CONTROL, onSave });

    const updateBtn = screen.getByText("Update Field");
    await userEvent.click(updateBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as VisualEditorControl;
    expect(saved.id).toBe("ctrl-001");
    expect(saved.name).toBe("CustomerName");
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    renderDefault({ onClose });
    const cancelBtn = screen.getByText("Cancel");
    await userEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    renderDefault({ onClose });
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking backdrop", async () => {
    const onClose = vi.fn();
    renderDefault({ onClose });
    // Click the backdrop (the first child of the dialog container)
    const backdrop = document.querySelector(".bg-black\\/40");
    if (backdrop) {
      await userEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  // ── Edge cases ──

  it("handles empty control with defaults gracefully", () => {
    renderDefault();
    const nameInput = screen.getByLabelText("Field name");
    expect(nameInput).toHaveValue("");

    const typeSelect = screen.getByLabelText("Control type");
    expect(typeSelect).toHaveValue("text-box");

    const leftInput = screen.getByLabelText("Left position");
    expect(leftInput).toHaveValue(300);
  });

  it("resets draft when dialog opens with a new control", () => {
    const { rerender } = render(
      <FieldEditorDialog open={false} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <FieldEditorDialog
        open={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        control={SAMPLE_CONTROL}
      />,
    );
    // Should show in edit mode with the control's data
    expect(screen.getByText("Edit: CustomerName")).toBeInTheDocument();
  });

  it("preserves partial control data through save", async () => {
    const onSave = vi.fn();
    const partial: VisualEditorControl = {
      id: "ctrl-partial",
      type: "command-button",
      name: "SaveBtn",
      left: 100,
      top: 200,
      width: 1440,
      height: 360,
    };
    renderDefault({ control: partial, onSave });

    const updateBtn = screen.getByText("Update Field");
    await userEvent.click(updateBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as VisualEditorControl;
    expect(saved.id).toBe("ctrl-partial");
    expect(saved.type).toBe("command-button");
    expect(saved.name).toBe("SaveBtn");
    expect(saved.left).toBe(100);
    expect(saved.top).toBe(200);
  });
});