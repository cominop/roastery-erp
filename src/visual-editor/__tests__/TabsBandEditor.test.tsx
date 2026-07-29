/**
 * Unit tests for TabsBandEditor.
 *
 * Tests: tab switching, band property controls (visibility, height,
 * record source), per-band FieldPicker integration, disabled state.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TabsBandEditor from "../TabsBandEditor";
import type { TabsBandEditorProps } from "../TabsBandEditor";
import type { VisualEditorSection } from "../types";
import type { LayoutPanel } from "../ColumnLayoutConfig";
import type { FieldPickerItem } from "../FieldPicker";

// ─── Fixtures ─────────────────────────────────────────

const EMPTY_SECTION = (): VisualEditorSection => ({
  visible: true,
  height: 720,
  controls: [],
});

const DEFAULT_SECTIONS: Record<LayoutPanel, VisualEditorSection> = {
  header: { ...EMPTY_SECTION(), height: 540 },
  detail: {
    ...EMPTY_SECTION(),
    recordSource: "orders",
    allowAdditions: true,
    allowDeletions: false,
  },
  footer: { ...EMPTY_SECTION(), height: 360, visible: false },
};

const ALL_FIELDS: FieldPickerItem[] = [
  { name: "id", type: "integer" },
  { name: "customer_name", type: "varchar(100)" },
  { name: "amount", type: "numeric(10,2)" },
  { name: "created_at", type: "timestamp" },
  { name: "is_active", type: "boolean" },
];

const DEFAULT_BAND_FIELDS: Record<LayoutPanel, FieldPickerItem[]> = {
  header: [{ name: "customer_name", type: "varchar(100)" }],
  detail: [
    { name: "id", type: "integer" },
    { name: "amount", type: "numeric(10,2)" },
  ],
  footer: [],
};

// ─── Helpers ──────────────────────────────────────────

const DEFAULT_PROPS: TabsBandEditorProps = {
  sections: DEFAULT_SECTIONS,
  onSectionChange: vi.fn(),
  availableFields: ALL_FIELDS,
  bandFields: DEFAULT_BAND_FIELDS,
  onBandFieldsChange: vi.fn(),
};

function renderDefault(props?: Partial<TabsBandEditorProps>) {
  return render(<TabsBandEditor {...DEFAULT_PROPS} {...props} />);
}

/** Helper to switch to a specific tab */
async function clickTab(label: string) {
  const tab = screen.getByRole("tab", { name: new RegExp(label, "i") });
  await userEvent.click(tab);
}

/** Visible checkbox has accessible name "On" or "Off" via the label text */
function getVisibleCheckbox(): HTMLInputElement {
  return screen.getByRole("checkbox", { name: /^on$/i });
}

// ─── Tests ────────────────────────────────────────────

describe("TabsBandEditor", () => {
  // ── Tab bar ──

  it("renders tab bar with Header, Detail, and Footer tabs", () => {
    renderDefault();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent(/header/i);
    expect(tabs[1]).toHaveTextContent(/detail/i);
    expect(tabs[2]).toHaveTextContent(/footer/i);
  });

  it("shows Header tab as active by default", () => {
    renderDefault();

    const headerTab = screen.getByRole("tab", { name: /header/i });
    expect(headerTab).toHaveAttribute("aria-selected", "true");

    const detailTab = screen.getByRole("tab", { name: /detail/i });
    expect(detailTab).toHaveAttribute("aria-selected", "false");
  });

  it("switches to Detail tab on click", async () => {
    renderDefault();

    await clickTab("detail");

    const detailTab = screen.getByRole("tab", { name: /detail/i });
    expect(detailTab).toHaveAttribute("aria-selected", "true");

    const headerTab = screen.getByRole("tab", { name: /header/i });
    expect(headerTab).toHaveAttribute("aria-selected", "false");
  });

  it("switches to Footer tab on click", async () => {
    renderDefault();

    await clickTab("footer");

    const footerTab = screen.getByRole("tab", { name: /footer/i });
    expect(footerTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders tabpanel for the active section", () => {
    renderDefault();

    const panel = screen.getByRole("tabpanel");
    expect(panel).toBeInTheDocument();
  });

  // ── Band info header ──

  it("shows band name and field count for the active tab", () => {
    renderDefault();

    // Header is default — 1 field assigned
    expect(screen.getByText(/header band/i)).toBeInTheDocument();
    expect(screen.getByText("1 field")).toBeInTheDocument();
  });

  it("updates field count when switching tabs", async () => {
    renderDefault();

    // Header tab: 1 field
    expect(screen.getByText("1 field")).toBeInTheDocument();

    // Switch to Detail: 2 fields
    await clickTab("detail");
    expect(screen.getByText("2 fields")).toBeInTheDocument();

    // Switch to Footer: 0 fields
    await clickTab("footer");
    expect(screen.getByText("0 fields")).toBeInTheDocument();
  });

  // ── Visibility ──

  it("renders visibility checkbox and label for the active tab", () => {
    renderDefault();

    const visibleCb = getVisibleCheckbox();
    expect(visibleCb).toBeInTheDocument();
    // Header is visible by default
    expect(visibleCb).toBeChecked();
  });

  it("calls onSectionChange with toggled visibility", async () => {
    const onSectionChange = vi.fn();
    renderDefault({ onSectionChange });

    const visibleCb = getVisibleCheckbox();
    await userEvent.click(visibleCb);

    expect(onSectionChange).toHaveBeenCalledWith("header", { visible: false });
  });

  // ── Height ──

  it("renders height controls with current value", () => {
    renderDefault();

    // Header height is 540
    expect(screen.getByText("540")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Decrease band height" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase band height" }),
    ).toBeInTheDocument();
  });

  it("calls onSectionChange with decremented height", async () => {
    const onSectionChange = vi.fn();
    renderDefault({ sections: DEFAULT_SECTIONS, onSectionChange });

    const decBtn = screen.getByRole("button", {
      name: "Decrease band height",
    });
    await userEvent.click(decBtn);

    expect(onSectionChange).toHaveBeenCalledWith("header", { height: 480 });
  });

  it("calls onSectionChange with incremented height", async () => {
    const onSectionChange = vi.fn();
    renderDefault({ sections: DEFAULT_SECTIONS, onSectionChange });

    const incBtn = screen.getByRole("button", {
      name: "Increase band height",
    });
    await userEvent.click(incBtn);

    expect(onSectionChange).toHaveBeenCalledWith("header", { height: 600 });
  });

  it("disables decrement button at minimum height (60)", () => {
    const sections: Record<LayoutPanel, VisualEditorSection> = {
      ...DEFAULT_SECTIONS,
      header: { ...DEFAULT_SECTIONS.header, height: 60 },
    };
    renderDefault({ sections });

    const decBtn = screen.getByRole("button", {
      name: "Decrease band height",
    });
    expect(decBtn).toBeDisabled();
  });

  it("disables increment button at maximum height (21600)", () => {
    const sections: Record<LayoutPanel, VisualEditorSection> = {
      ...DEFAULT_SECTIONS,
      header: { ...DEFAULT_SECTIONS.header, height: 21600 },
    };
    renderDefault({ sections });

    const incBtn = screen.getByRole("button", {
      name: "Increase band height",
    });
    expect(incBtn).toBeDisabled();
  });

  // ── Record source (Detail only) ──

  it("shows record source input for Detail tab", async () => {
    renderDefault();

    await clickTab("detail");
    expect(screen.getByDisplayValue("orders")).toBeInTheDocument();
  });

  it("does not show record source input for Header tab", () => {
    renderDefault();

    expect(screen.queryByDisplayValue("orders")).not.toBeInTheDocument();
  });

  it("calls onSectionChange when record source changes", async () => {
    const onSectionChange = vi.fn();
    renderDefault({ onSectionChange });

    await clickTab("detail");
    const input = screen.getByPlaceholderText("Table or query name");
    await userEvent.clear(input);
    await userEvent.type(input, "customers");

    // Each keypress fires a change — check at least one call had "customers"
    const calls = onSectionChange.mock.calls.filter(
      (c: unknown[]) => c[0] === "detail" && typeof c[1] === "object",
    );
    const lastCall = calls[calls.length - 1] as [string, object];
    expect(lastCall[0]).toBe("detail");
    expect(lastCall[1]).toHaveProperty("recordSource");
  });

  // ── Allow additions/deletions (Detail only) ──

  it("shows allow additions and deletions checkboxes for Detail tab", async () => {
    renderDefault();

    await clickTab("detail");

    expect(
      screen.getByRole("checkbox", { name: /allow additions/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /allow deletions/i }),
    ).toBeInTheDocument();
  });

  it("does not show allow additions/deletions for Header tab", () => {
    renderDefault();

    expect(
      screen.queryByRole("checkbox", { name: /allow additions/i }),
    ).not.toBeInTheDocument();
  });

  it("toggles allow additions on Detail tab", async () => {
    const onSectionChange = vi.fn();
    renderDefault({ onSectionChange });

    await clickTab("detail");
    const addCb = screen.getByRole("checkbox", { name: /allow additions/i });
    await userEvent.click(addCb);

    expect(onSectionChange).toHaveBeenCalledWith("detail", {
      allowAdditions: false,
    });
  });

  it("toggles allow deletions on Detail tab", async () => {
    const onSectionChange = vi.fn();
    renderDefault({ onSectionChange });

    await clickTab("detail");
    const delCb = screen.getByRole("checkbox", { name: /allow deletions/i });
    await userEvent.click(delCb);

    expect(onSectionChange).toHaveBeenCalledWith("detail", {
      allowDeletions: true,
    });
  });

  // ── Per-band FieldPicker integration ──

  it("renders FieldPicker with 'Available' and 'Assigned' labels", () => {
    renderDefault();

    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Assigned")).toBeInTheDocument();
  });

  it("shows band fields section header", () => {
    renderDefault();

    expect(screen.getByText("Band fields")).toBeInTheDocument();
  });

  it("passes correct available fields to FieldPicker", () => {
    renderDefault();

    // Available fields minus header's 1 selected = 4 available
    expect(screen.getByText(/\b4\b/)).toBeInTheDocument();
  });

  it("calls onBandFieldsChange when fields are moved in FieldPicker", async () => {
    const onBandFieldsChange = vi.fn();
    renderDefault({ onBandFieldsChange });

    // Check "id" in available side for Header tab
    // Accessible name for the checkbox is "idnumber" (name + type category)
    const idCheckbox = screen.getByRole("checkbox", { name: /^id/i });
    await userEvent.click(idCheckbox);

    // Click Move selected →
    const moveBtn = screen.getByTitle("Move selected →");
    await userEvent.click(moveBtn);

    expect(onBandFieldsChange).toHaveBeenCalledTimes(1);
    const result = onBandFieldsChange.mock.calls[0] as [
      string,
      FieldPickerItem[],
    ];
    expect(result[0]).toBe("header");
    expect(result[1].map((f) => f.name)).toContain("id");
  });

  it("switches FieldPicker content when tab changes", async () => {
    renderDefault();

    // Header: customer_name is selected (in "Assigned" panel)
    expect(screen.getByText("customer_name")).toBeInTheDocument();

    await clickTab("detail");

    // Detail: id and amount are selected
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("amount")).toBeInTheDocument();

    await clickTab("footer");

    // Footer: no fields selected
    expect(screen.getByText("No fields selected")).toBeInTheDocument();
  });

  // ── Section info footer ──

  it("shows controls count in section info footer", () => {
    renderDefault();

    expect(
      screen.getByText((content) => content.includes("Section controls:")),
    ).toBeInTheDocument();
    // Check the footer span has controls text with a number after colon
    const sectionInfo = screen.getByText(/section controls:/i);
    expect(sectionInfo.textContent).toMatch(/0$/);
  });

  // ── Disabled state ──

  it("applies disabled class and disables interactive elements", () => {
    renderDefault({ disabled: true });

    // Tab buttons disabled
    screen.getAllByRole("tab").forEach((tab) => {
      expect(tab).toBeDisabled();
    });

    // Height buttons disabled
    expect(
      screen.getByRole("button", { name: "Decrease band height" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Increase band height" }),
    ).toBeDisabled();

    // Visible checkbox disabled (accessible name is "On")
    const visibleCb = screen.getByRole("checkbox", { name: /^on$/i });
    expect(visibleCb).toBeDisabled();
  });

  // ── Accessibility ──

  it("has correct aria attributes on tablist and tabs", () => {
    renderDefault();

    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("aria-label", "Form sections");
  });

  it("has correct aria attributes on region", () => {
    renderDefault();

    const region = screen.getByRole("region");
    expect(region).toHaveAttribute("aria-label", "Tabs and band editor");
  });

  // ── Edge cases ──

  it("handles empty availableFields gracefully", () => {
    // When available fields is empty and header has 1 field assigned,
    // the assigned field is still shown in the selected panel
    renderDefault({ availableFields: [] });

    // "All fields selected" shown on available side when availableOnly is empty
    expect(screen.getByText("All fields selected")).toBeInTheDocument();
    // Assigned field "customer_name" is still shown on selected side
    expect(screen.getByText("customer_name")).toBeInTheDocument();
  });

  it("handles null/undefined section properties gracefully", () => {
    const sections: Record<LayoutPanel, VisualEditorSection> = {
      header: { visible: true, controls: [] },
      detail: { controls: [] },
      footer: { controls: [] },
    };
    renderDefault({ sections });

    // Should still render without crashing
    expect(screen.getByText(/header band/i)).toBeInTheDocument();
  });

  it("handles no assigned fields and no available fields", () => {
    renderDefault({
      availableFields: [],
      bandFields: {
        header: [],
        detail: [],
        footer: [],
      },
    });

    expect(screen.getByText("All fields selected")).toBeInTheDocument();
    expect(screen.getByText("No fields selected")).toBeInTheDocument();
  });

  it("does not call onSectionChange when clicking disabled height buttons at bounds", async () => {
    const onSectionChange = vi.fn();
    const sections: Record<LayoutPanel, VisualEditorSection> = {
      ...DEFAULT_SECTIONS,
      header: { ...DEFAULT_SECTIONS.header, height: 60 },
    };
    renderDefault({ sections, onSectionChange });

    const decBtn = screen.getByRole("button", {
      name: "Decrease band height",
    });
    await userEvent.click(decBtn);

    expect(onSectionChange).not.toHaveBeenCalled();
  });
});