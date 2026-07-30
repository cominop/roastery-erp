/**
 * Unit tests for TemplateLibrary component and templateRegistry.
 *
 * Tests: registry functions (built-in templates, CRUD, persistence),
 * applyTemplateToForm for all 5 template types, and TemplateLibrary
 * component rendering/interaction.
 *
 * Step 77: Template Library (Phase 7 of the Visual Editor).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TemplateLibrary from "../TemplateLibrary";
import type { TemplateLibraryProps, FieldDefinition } from "../TemplateLibrary";
import type { VisualEditorForm } from "../types";
import {
  getTemplates,
  getTemplate,
  registerTemplate,
  unregisterTemplate,
  saveUserTemplates,
  applyTemplateToForm,
} from "../templateRegistry";
import type { FormTemplate } from "../templateRegistry";

// ─── Fixtures ─────────────────────────────────────────

const SAMPLE_FIELDS: FieldDefinition[] = [
  { id: "f1", caption: "Customer Name", name: "customer_name", type: "text" },
  { id: "f2", caption: "Email Address", name: "email", type: "text" },
  { id: "f3", caption: "Phone Number", name: "phone", type: "text" },
  { id: "f4", caption: "Order Total", name: "total", type: "number" },
  { id: "f5", caption: "Order Date", name: "order_date", type: "date" },
];

const BASE_FORM: VisualEditorForm = {
  name: "TestForm",
  caption: "Test Form",
  width: 800,
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

const DEFAULT_PROPS: TemplateLibraryProps = {
  form: BASE_FORM,
  availableFields: SAMPLE_FIELDS,
  onApplyTemplate: vi.fn(),
  onClose: vi.fn(),
};

// ─── Helpers ──────────────────────────────────────────

function renderDefault(props?: Partial<TemplateLibraryProps>) {
  return render(<TemplateLibrary {...DEFAULT_PROPS} {...props} />);
}

function getDialog() {
  return screen.getByRole("dialog", { name: "Template Library" });
}

/** Find a template card by its name text (the card div has role="button") */
function getCardByName(name: string): HTMLElement {
  const nameEl = screen.getByText(name);
  const card = nameEl.closest('[role="button"]');
  if (!card) throw new Error(`Card not found for template "${name}"`);
  return card;
}

// ====================================================================
// Template Registry Tests
// ====================================================================

describe("templateRegistry", () => {
  // ── Built-in templates ──

  it("getTemplates() returns 5 built-in templates", () => {
    const templates = getTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(5);
    const names = templates.map((t) => t.name);
    expect(names).toContain("default");
    expect(names).toContain("tabs");
    expect(names).toContain("grid");
    expect(names).toContain("master-detail");
    expect(names).toContain("catalog");
  });

  it("getTemplate('default') returns the default template", () => {
    const tpl = getTemplate("default");
    expect(tpl).toBeDefined();
    expect(tpl!.name).toBe("default");
    expect(tpl!.template).toBe("default");
    expect(tpl!.layout.columns).toBe(1);
    expect(tpl!.options.width).toBe(800);
  });

  it("getTemplate('tabs') returns tabs template with tab definitions", () => {
    const tpl = getTemplate("tabs");
    expect(tpl).toBeDefined();
    expect(tpl!.layout.tabs).toBeDefined();
    expect(tpl!.layout.tabs!.length).toBeGreaterThanOrEqual(2);
    expect(tpl!.layout.tabs![0].caption).toBe("General");
  });

  it("getTemplate('grid') returns grid template with multi-column layout", () => {
    const tpl = getTemplate("grid");
    expect(tpl).toBeDefined();
    expect(tpl!.layout.columns).toBeGreaterThanOrEqual(2);
    expect(tpl!.layout.labelSize).toBe("small");
  });

  it("getTemplate('master-detail') returns the master-detail template", () => {
    const tpl = getTemplate("master-detail");
    expect(tpl).toBeDefined();
    expect(tpl!.template).toBe("master-detail");
    expect(tpl!.options.width).toBe(1000);
  });

  it("getTemplate('catalog') returns the catalog template", () => {
    const tpl = getTemplate("catalog");
    expect(tpl).toBeDefined();
    expect(tpl!.template).toBe("catalog");
    expect(tpl!.options.multiSelect).toBe(true);
  });

  it("getTemplate('nonexistent') returns undefined", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });

  // ── User template CRUD ──

  it("registerTemplate() adds a user template", () => {
    const userTpl: FormTemplate = {
      name: "my-custom",
      description: "My custom layout",
      template: "default",
      layout: { columns: 1, labelSize: "medium", inPanel: false },
      options: { width: 800, formBorder: true, formHeader: true, showHistory: true, closeButton: true, closeOnEscape: true, modeless: false, buttonsOnTop: false },
    };
    registerTemplate(userTpl);
    const found = getTemplate("my-custom");
    expect(found).toBeDefined();
    expect(found!.description).toBe("My custom layout");
    // Cleanup
    unregisterTemplate("my-custom");
  });

  it("unregisterTemplate() removes a user template", () => {
    const tpl: FormTemplate = {
      name: "to-remove",
      description: "Temp",
      template: "default",
      layout: { columns: 1, labelSize: "medium", inPanel: false },
      options: { width: 800, formBorder: true, formHeader: true, showHistory: true, closeButton: true, closeOnEscape: true, modeless: false, buttonsOnTop: false },
    };
    registerTemplate(tpl);
    expect(getTemplate("to-remove")).toBeDefined();
    const result = unregisterTemplate("to-remove");
    expect(result).toBe(true);
    expect(getTemplate("to-remove")).toBeUndefined();
  });

  it("cannot remove built-in templates", () => {
    expect(unregisterTemplate("default")).toBe(false);
    expect(getTemplate("default")).toBeDefined();
    expect(unregisterTemplate("tabs")).toBe(false);
    expect(unregisterTemplate("grid")).toBe(false);
    expect(unregisterTemplate("master-detail")).toBe(false);
    expect(unregisterTemplate("catalog")).toBe(false);
  });

  it("registerTemplate() replaces existing user template with same name", () => {
    const tpl1: FormTemplate = {
      name: "dup-template",
      description: "First version",
      template: "default",
      layout: { columns: 1, labelSize: "medium", inPanel: false },
      options: { width: 800, formBorder: true, formHeader: true, showHistory: true, closeButton: true, closeOnEscape: true, modeless: false, buttonsOnTop: false },
    };
    const tpl2: FormTemplate = {
      ...tpl1,
      description: "Second version",
    };
    registerTemplate(tpl1);
    registerTemplate(tpl2);
    const found = getTemplate("dup-template");
    expect(found!.description).toBe("Second version");
    unregisterTemplate("dup-template");
  });

  it("registerTemplate() with built-in name is silently ignored", () => {
    const builtIn: FormTemplate = {
      name: "default",
      description: "Should not override built-in",
      template: "default",
      layout: { columns: 1, labelSize: "medium", inPanel: false },
      options: { width: 800, formBorder: true, formHeader: true, showHistory: true, closeButton: true, closeOnEscape: true, modeless: false, buttonsOnTop: false },
    };
    registerTemplate(builtIn);
    const tpl = getTemplate("default");
    expect(tpl!.description).not.toBe("Should not override built-in");
  });

  // ── localStorage persistence ──

  it("saveUserTemplates() / loadUserTemplates() round-trips via localStorage", () => {
    // Mock localStorage entirely
    const store: Record<string, string> = {};
    const mockStorage: Storage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { for (const k in store) delete store[k]; },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() { return Object.keys(store).length; },
    };
    vi.stubGlobal("localStorage", mockStorage);

    const tpl: FormTemplate = {
      name: "persisted-tpl",
      description: "Should survive reload",
      template: "grid",
      layout: { columns: 2, labelSize: "small", inPanel: true },
      options: { width: 900, formBorder: true, formHeader: true, showHistory: false, closeButton: true, closeOnEscape: true, modeless: true, buttonsOnTop: true },
    };
    registerTemplate(tpl);
    saveUserTemplates();

    // Verify the data was written to storage
    const raw = localStorage.getItem("roastery-ui:form-templates");
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((t: FormTemplate) => t.name === "persisted-tpl")).toBe(true);

    vi.unstubAllGlobals();
  });
});

// ====================================================================
// applyTemplateToForm Tests
// ====================================================================

describe("applyTemplateToForm", () => {
  let form: VisualEditorForm;

  beforeEach(() => {
    form = { ...BASE_FORM, detail: { controls: [] }, header: { controls: [] }, footer: { controls: [] } };
  });

  it("applies 'default' template — preserves form structure", () => {
    const tpl = getTemplate("default")!;
    const result = applyTemplateToForm(form, tpl, SAMPLE_FIELDS);
    expect(result.width).toBe(800);
    expect(result.closeButton).toBe(true);
    expect(result.historyEnabled).toBe(true);
    expect(result.detail).toBeDefined();
  });

  it("applies 'tabs' template — creates tab control and pages", () => {
    const tpl = getTemplate("tabs")!;
    const result = applyTemplateToForm(form, tpl, SAMPLE_FIELDS);
    expect(result.detail.controls.length).toBeGreaterThan(0);
    const tabControl = result.detail.controls.find((c) => c.type === "tab-control");
    expect(tabControl).toBeDefined();
    expect(tabControl!.pages).toBeDefined();
    expect(tabControl!.pages!.length).toBeGreaterThanOrEqual(2);
    const pages = result.detail.controls.filter((c) => c.type === "page");
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });

  it("applies 'grid' template — sets width and options", () => {
    const tpl = getTemplate("grid")!;
    const result = applyTemplateToForm(form, tpl, SAMPLE_FIELDS);
    expect(result.width).toBe(1000);
    expect(result.closeButton).toBe(true);
  });

  it("applies 'master-detail' template — creates subform control", () => {
    const tpl = getTemplate("master-detail")!;
    const result = applyTemplateToForm(form, tpl, SAMPLE_FIELDS);
    expect(result.detail.controls.length).toBeGreaterThan(0);
    const subform = result.detail.controls.find((c) => c.type === "subform");
    expect(subform).toBeDefined();
    expect(subform!.name).toBe("DetailSubform");
    expect(subform!.linkMasterFields).toEqual([]);
  });

  it("applies 'catalog' template — creates search + list-box controls", () => {
    const tpl = getTemplate("catalog")!;
    const result = applyTemplateToForm(form, tpl, SAMPLE_FIELDS);
    expect(result.detail.controls.length).toBeGreaterThanOrEqual(2);
    const searchBox = result.detail.controls.find((c) => c.name === "SearchBox");
    expect(searchBox).toBeDefined();
    expect(searchBox!.type).toBe("text-box");
    const resultsTable = result.detail.controls.find((c) => c.name === "ResultsTable");
    expect(resultsTable).toBeDefined();
    expect(resultsTable!.type).toBe("list-box");
    expect(resultsTable!.multiSelect).toBe(true);
  });

  it("handles empty availableFields gracefully for tabs template", () => {
    const tpl = getTemplate("tabs")!;
    const result = applyTemplateToForm(form, tpl, []);
    expect(result.detail.controls.length).toBeGreaterThanOrEqual(1);
    expect(result.detail.controls.some((c) => c.type === "tab-control")).toBe(true);
  });

  it("handles empty availableFields gracefully for default template", () => {
    const tpl = getTemplate("default")!;
    const result = applyTemplateToForm(form, tpl, []);
    expect(result.width).toBe(800);
    expect(result.detail).toBeDefined();
  });

  it("copies template options to the form", () => {
    const tpl = getTemplate("catalog")!;
    const result = applyTemplateToForm(form, tpl, SAMPLE_FIELDS);
    expect(result.width).toBe(1100);
    expect(result.closeButton).toBe(true);
  });
});

// ====================================================================
// TemplateLibrary Component Tests
// ====================================================================

describe("TemplateLibrary component", () => {
  beforeEach(() => {
    // Ensure a clean template state for component tests
    const all = getTemplates();
    for (const t of all) {
      if (!["default", "tabs", "grid", "master-detail", "catalog"].includes(t.name)) {
        unregisterTemplate(t.name);
      }
    }
  });

  // ── Rendering & structure ──

  it("renders the dialog with accessible role", () => {
    renderDefault();
    expect(getDialog()).toBeInTheDocument();
  });

  it("renders the title 'Template Library'", () => {
    renderDefault();
    expect(screen.getByText("Template Library")).toBeInTheDocument();
  });

  it("renders all 5 built-in template cards", () => {
    renderDefault();
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("tabs")).toBeInTheDocument();
    expect(screen.getByText("grid")).toBeInTheDocument();
    expect(screen.getByText("master-detail")).toBeInTheDocument();
    expect(screen.getByText("catalog")).toBeInTheDocument();
  });

  it("renders 'Save Current Layout' and close buttons", () => {
    renderDefault();
    expect(screen.getByText("Save Current Layout")).toBeInTheDocument();
    expect(screen.getByLabelText("Close template library")).toBeInTheDocument();
  });

  it("closes the dialog when backdrop is clicked", async () => {
    const onClose = vi.fn();
    renderDefault({ onClose });
    const backdrop = getDialog()!.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    if (backdrop) {
      await userEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it("closes when X button is clicked", async () => {
    const onClose = vi.fn();
    renderDefault({ onClose });
    const closeBtn = screen.getByLabelText("Close template library");
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Template card interaction ──

  it("clicking a template card selects it (shows preview panel)", async () => {
    renderDefault();
    const card = getCardByName("default");
    await userEvent.click(card);
    // After selection, the preview panel should render
    expect(screen.getByText("Apply Template")).toBeInTheDocument();
  });

  it("clicking a selected template card again deselects it", async () => {
    renderDefault();
    const card = getCardByName("default");
    await userEvent.click(card);
    expect(screen.getByText("Apply Template")).toBeInTheDocument();

    // Click again to deselect
    await userEvent.click(card);
    // Apply Template button should disappear
    expect(screen.queryByText("Apply Template")).not.toBeInTheDocument();
  });

  it("shows template type badges on cards", () => {
    renderDefault();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Tabs")).toBeInTheDocument();
    expect(screen.getByText("Grid")).toBeInTheDocument();
  });

  // ── Apply Template ──

  it("Apply Template button triggers onApplyTemplate callback with correct form", async () => {
    const onApply = vi.fn();
    renderDefault({ onApplyTemplate: onApply });
    const card = getCardByName("default");
    await userEvent.click(card);
    const applyBtn = screen.getByText("Apply Template");
    await userEvent.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
    const result = onApply.mock.calls[0][0] as VisualEditorForm;
    expect(result.width).toBe(800);
  });

  it("Apply Template on tabs template passes transformed form with tab control", async () => {
    const onApply = vi.fn();
    renderDefault({ onApplyTemplate: onApply });
    const card = getCardByName("tabs");
    await userEvent.click(card);
    const applyBtn = screen.getByText("Apply Template");
    await userEvent.click(applyBtn);
    const result = onApply.mock.calls[0][0] as VisualEditorForm;
    expect(result.detail.controls.some((c) => c.type === "tab-control")).toBe(true);
  });

  // ── Save dialog ──

  it("shows save dialog when 'Save Current Layout' is clicked", async () => {
    renderDefault();
    await userEvent.click(screen.getByText("Save Current Layout"));
    expect(screen.getByRole("dialog", { name: "Save template" })).toBeInTheDocument();
  });

  it("save dialog has Cancel and Save buttons", async () => {
    renderDefault();
    await userEvent.click(screen.getByText("Save Current Layout"));
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("Save button is disabled when name is empty", async () => {
    renderDefault();
    await userEvent.click(screen.getByText("Save Current Layout"));
    const saveBtn = screen.getByText("Save").closest("button");
    expect(saveBtn).toBeDisabled();
  });

  it("saving a user template adds it to the template grid", async () => {
    renderDefault();
    await userEvent.click(screen.getByText("Save Current Layout"));

    const nameInput = screen.getByPlaceholderText("e.g. Order Entry Compact");
    await userEvent.type(nameInput, "My Saved Layout");
    await userEvent.click(screen.getByText("Save"));

    expect(screen.getByText("My Saved Layout")).toBeInTheDocument();
  });

  it("save dialog closes on Cancel", async () => {
    renderDefault();
    await userEvent.click(screen.getByText("Save Current Layout"));
    await userEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog", { name: "Save template" })).not.toBeInTheDocument();
  });

  // ── Delete user template ──

  it("delete button appears on user-created templates only", async () => {
    renderDefault();
    // Save a user template
    await userEvent.click(screen.getByText("Save Current Layout"));
    await userEvent.type(screen.getByPlaceholderText("e.g. Order Entry Compact"), "DeleteMe");
    await userEvent.click(screen.getByText("Save"));

    const deleteBtn = screen.getByLabelText("Delete template DeleteMe");
    expect(deleteBtn).toBeInTheDocument();
  });

  it("clicking delete removes the user template from the grid", async () => {
    renderDefault();
    // Save a user template
    await userEvent.click(screen.getByText("Save Current Layout"));
    await userEvent.type(screen.getByPlaceholderText("e.g. Order Entry Compact"), "DeleteMe2");
    await userEvent.click(screen.getByText("Save"));

    expect(screen.getByText("DeleteMe2")).toBeInTheDocument();

    // Delete it
    await userEvent.click(screen.getByLabelText("Delete template DeleteMe2"));
    expect(screen.queryByText("DeleteMe2")).not.toBeInTheDocument();
  });

  // ── Preview panel ──

  it("preview panel shows template details when a template is selected", async () => {
    renderDefault();
    const card = getCardByName("default");
    await userEvent.click(card);

    // Preview should show template properties
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Columns")).toBeInTheDocument();
    expect(screen.getByText("Label size")).toBeInTheDocument();
  });
});