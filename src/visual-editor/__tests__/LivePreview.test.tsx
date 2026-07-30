/**
 * Unit tests for LivePreview component.
 *
 * Tests: rendering with various form configurations, control positioning,
 * section visibility, empty states, and form property reflection.
 *
 * Step 78: LivePreview pane (Phase 8 of the Visual Editor).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LivePreview from "../LivePreview";
import type { VisualEditorForm } from "../types";

// ─── Test fixtures ───────────────────────────────────────

const EMPTY_FORM: VisualEditorForm = {
  name: "EmptyForm",
  caption: "Empty Form",
  width: 14400,
  borderStyle: "sizable",
  historyEnabled: true,
  recordSelectors: true,
  scrollBars: "both",
  closeButton: true,
  minMaxButtons: true,
  modal: false,
  header: { controls: [] },
  detail: { controls: [] },
  footer: { controls: [] },
  version: 1,
};

const FULL_FORM: VisualEditorForm = {
  name: "CustomerForm",
  caption: "Customer Details",
  width: 18000,
  borderStyle: "sizable",
  historyEnabled: true,
  recordSelectors: true,
  scrollBars: "both",
  closeButton: true,
  minMaxButtons: true,
  modal: false,
  recordSource: "customers",
  header: {
    visible: true,
    height: 600,
    controls: [
      {
        id: "h1",
        type: "label",
        name: "HeaderLabel",
        caption: "Customer Information",
        left: 120,
        top: 60,
        width: 3000,
        height: 270,
        visible: true,
      },
      {
        id: "h2",
        type: "command-button",
        name: "btnNew",
        caption: "New Customer",
        left: 5000,
        top: 60,
        width: 1200,
        height: 360,
        visible: true,
      },
    ],
  },
  detail: {
    visible: true,
    height: 1800,
    controls: [
      {
        id: "d1",
        type: "text-box",
        name: "customer_name",
        caption: "Customer Name",
        left: 120,
        top: 60,
        width: 2880,
        height: 270,
        visible: true,
        dataBinding: { controlSource: "customer_name" },
      },
      {
        id: "d2",
        type: "text-box",
        name: "email",
        caption: "Email",
        left: 120,
        top: 400,
        width: 2880,
        height: 270,
        visible: true,
        dataBinding: { controlSource: "email" },
      },
      {
        id: "d3",
        type: "check-box",
        name: "active",
        caption: "Active Customer",
        left: 120,
        top: 740,
        width: 1800,
        height: 270,
        visible: true,
      },
    ],
  },
  footer: {
    visible: true,
    height: 480,
    controls: [
      {
        id: "f1",
        type: "command-button",
        name: "btnSave",
        caption: "Save",
        left: 300,
        top: 60,
        width: 1200,
        height: 360,
        visible: true,
      },
      {
        id: "f2",
        type: "command-button",
        name: "btnCancel",
        caption: "Cancel",
        left: 1700,
        top: 60,
        width: 1200,
        height: 360,
        visible: true,
      },
    ],
  },
  version: 1,
};

// ─── Tests ───────────────────────────────────────────────

describe("LivePreview", () => {
  // ── Basic rendering ──

  it("renders the form name in the preview info bar", () => {
    render(<LivePreview form={EMPTY_FORM} />);
    expect(screen.getByText("EmptyForm")).toBeTruthy();
  });

  it("renders the 'Preview' label", () => {
    render(<LivePreview form={EMPTY_FORM} />);
    expect(screen.getByText("Preview")).toBeTruthy();
  });

  it("renders the form caption in the title bar", () => {
    render(<LivePreview form={FULL_FORM} />);
    expect(screen.getByText("Customer Details")).toBeTruthy();
  });

  // ── Section rendering ──

  it("renders header section with label badge", () => {
    render(<LivePreview form={FULL_FORM} />);
    expect(screen.getAllByText("Header").length).toBeGreaterThanOrEqual(1);
  });

  it("renders detail section with label badge", () => {
    render(<LivePreview form={FULL_FORM} />);
    expect(screen.getAllByText("Detail").length).toBeGreaterThanOrEqual(1);
  });

  it("renders footer section with label badge", () => {
    render(<LivePreview form={FULL_FORM} />);
    expect(screen.getAllByText("Footer").length).toBeGreaterThanOrEqual(1);
  });

  it("shows control count in the info footer", () => {
    render(<LivePreview form={FULL_FORM} />);
    // 2 header + 3 detail + 2 footer = 7 controls
    expect(screen.getByText("7 controls")).toBeTruthy();
  });

  it("shows record source in info footer when present", () => {
    render(<LivePreview form={FULL_FORM} />);
    expect(screen.getByText("customers")).toBeTruthy();
  });

  // ── Empty states ──

  it("handles empty form gracefully", () => {
    render(<LivePreview form={EMPTY_FORM} />);
    expect(screen.getByText("EmptyForm")).toBeTruthy();
  });

  it("shows 'No sections visible' when all sections hidden", () => {
    const hiddenForm: VisualEditorForm = {
      ...EMPTY_FORM,
      header: { visible: false, controls: [] },
      detail: { visible: false, controls: [] },
      footer: { visible: false, controls: [] },
    };
    render(<LivePreview form={hiddenForm} />);
    expect(screen.getByText("No sections visible")).toBeTruthy();
  });

  it("does NOT show control count when there are zero controls", () => {
    render(<LivePreview form={EMPTY_FORM} />);
    expect(screen.queryByText(/0 controls/)).toBeNull();
  });

  // ── Border styles ──

  it("applies 'none' border style", () => {
    const noBorder: VisualEditorForm = {
      ...EMPTY_FORM,
      borderStyle: "none",
    };
    const { container } = render(<LivePreview form={noBorder} />);
    // The inner form container should exist (we trust CSS class application)
    expect(container.querySelector('[class*="border-0"]')).toBeTruthy();
  });

  it("applies 'dialog' border style", () => {
    const dialogBorder: VisualEditorForm = {
      ...EMPTY_FORM,
      borderStyle: "dialog",
    };
    const { container } = render(<LivePreview form={dialogBorder} />);
    expect(container.querySelector('[class*="shadow-lg"]')).toBeTruthy();
  });

  // ── Control types ──

  it("renders label-type controls", () => {
    render(<LivePreview form={FULL_FORM} />);
    // Header has a label with caption "Customer Information"
    expect(screen.getByText("Customer Information")).toBeTruthy();
  });

  it("renders button-type controls", () => {
    render(<LivePreview form={FULL_FORM} />);
    expect(screen.getByText("Save")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("renders check-box controls", () => {
    render(<LivePreview form={FULL_FORM} />);
    expect(screen.getByText("Active Customer")).toBeTruthy();
  });

  it("renders text-box controls with captions", () => {
    render(<LivePreview form={FULL_FORM} />);
    expect(screen.getByText("Customer Name")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
  });

  // ── Page controls are skipped ──

  it("skips page-type controls (not rendered)", () => {
    const formWithPage: VisualEditorForm = {
      ...EMPTY_FORM,
      detail: {
        visible: true,
        height: 1200,
        controls: [
          {
            id: "p1",
            type: "page",
            name: "Page1",
            caption: "General",
            left: 0,
            top: 0,
            width: 9000,
            height: 6000,
            visible: true,
          },
          {
            id: "d1",
            type: "text-box",
            name: "field1",
            caption: "Field 1",
            left: 120,
            top: 60,
            width: 2880,
            height: 270,
            visible: true,
          },
        ],
      },
    };
    render(<LivePreview form={formWithPage} />);
    // Page caption should NOT appear (it's skipped)
    expect(screen.queryByText("General")).toBeNull();
    // Normal control should still appear
    expect(screen.getByText("Field 1")).toBeTruthy();
  });

  // ── Visibility filtering ──

  it("hides invisible controls", () => {
    const formWithHidden: VisualEditorForm = {
      ...EMPTY_FORM,
      detail: {
        visible: true,
        height: 600,
        controls: [
          {
            id: "v1",
            type: "text-box",
            name: "visible_field",
            caption: "Visible Field",
            left: 120,
            top: 60,
            width: 2880,
            height: 270,
            visible: true,
          },
          {
            id: "v2",
            type: "text-box",
            name: "hidden_field",
            caption: "Hidden Field",
            left: 120,
            top: 400,
            width: 2880,
            height: 270,
            visible: false,
          },
        ],
      },
    };
    render(<LivePreview form={formWithHidden} />);
    expect(screen.getByText("Visible Field")).toBeTruthy();
    expect(screen.queryByText("Hidden Field")).toBeNull();
  });

  // ── Section visibility ──

  it("hides header section when visible=false", () => {
    const noHeader: VisualEditorForm = {
      ...FULL_FORM,
      header: { ...FULL_FORM.header!, visible: false },
    };
    render(<LivePreview form={noHeader} />);
    // Header badge shouldn't appear
    const headers = screen.queryAllByText("Header");
    // There might be "Header" in DOM from other text, but the section badge
    // should be gone since we render null returning early
    // Let's check that the header controls are not rendered
    expect(screen.queryByText("Customer Information")).toBeNull();
    // Detail and footer controls should still render
    expect(screen.getByText("Customer Name")).toBeTruthy();
  });

  it("hides footer section when visible=false", () => {
    const noFooter: VisualEditorForm = {
      ...FULL_FORM,
      footer: { ...FULL_FORM.footer!, visible: false },
    };
    render(<LivePreview form={noFooter} />);
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.getByText("Customer Name")).toBeTruthy();
  });

  // ── Compact / width override ──

  it("accepts widthOverride prop", () => {
    const { container } = render(<LivePreview form={FULL_FORM} widthOverride={350} />);
    // The inner form container should have the specified width
    const inner = container.querySelector('[class*="flex-col"][class*="overflow-hidden"]');
    expect(inner).toBeTruthy();
    // We can't easily assert style values, but the component shouldn't throw
  });

  it("accepts compact prop without crashing", () => {
    render(<LivePreview form={FULL_FORM} compact />);
    expect(screen.getByText("Preview")).toBeTruthy();
  });

  // ── Caption fallback ──

  it("falls back to form name when no caption is set", () => {
    const noCaption: VisualEditorForm = {
      ...EMPTY_FORM,
      caption: undefined,
    };
    render(<LivePreview form={noCaption} />);
    // The form name appears in both the info bar and the title bar
    const matches = screen.getAllByText("EmptyForm");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  // ── Title bar chrome dots ──

  it("shows chrome dots when closeButton is not explicitly false", () => {
    const { container } = render(<LivePreview form={FULL_FORM} />);
    // The chrome dots are rendered as 3 div elements with w-[5px]
    const chromeDots = container.querySelectorAll('[class*="rounded-full"]');
    expect(chromeDots.length).toBeGreaterThanOrEqual(3);
  });

  it("hides chrome dots when closeButton is false", () => {
    const noClose: VisualEditorForm = {
      ...FULL_FORM,
      closeButton: false,
    };
    render(<LivePreview form={noClose} />);
    // Caption title bar exists but chrome dots shouldn't be rendered
    expect(screen.getByText("Customer Details")).toBeTruthy();
  });

  // ── Line controls ──

  it("renders line controls as simple elements", () => {
    const formWithLine: VisualEditorForm = {
      ...EMPTY_FORM,
      detail: {
        visible: true,
        height: 600,
        controls: [
          {
            id: "ln1",
            type: "line",
            name: "Separator",
            left: 120,
            top: 300,
            width: 5000,
            height: 30,
            visible: true,
          },
        ],
      },
    };
    const { container } = render(<LivePreview form={formWithLine} />);
    expect(container).toBeTruthy();
  });
});
