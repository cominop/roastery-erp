/**
 * Template Registry — save/load form layouts as reusable templates.
 * Step 77: Template Library (Phase 7 of the Visual Editor).
 */

import type { VisualEditorForm } from "./types";

// ─── Types ─────────────────────────────────────────────

export interface FormTemplateBand {
  fields: string[]; // field names
}

export interface FormTemplateTab {
  caption: string;
  bands: FormTemplateBand[];
}

export interface FormTemplate {
  name: string;
  description: string;
  template: "default" | "tabs" | "grid" | "master-detail" | "catalog";
  layout: {
    columns: 1 | 2 | 3 | 4;
    labelSize: "xsmall" | "small" | "medium" | "large" | "xlarge";
    inPanel: boolean;
    tabs?: FormTemplateTab[];
  };
  options: {
    width: number;
    formBorder: boolean;
    formHeader: boolean;
    showHistory: boolean;
    closeButton: boolean;
    closeOnEscape: boolean;
    modeless: boolean;
    buttonsOnTop: boolean;
    multiSelect?: boolean;
    dblclickEdit?: boolean;
  };
}

// ─── Built-in templates ────────────────────────────────

const BUILT_IN_TEMPLATES: FormTemplate[] = [
  {
    name: "default",
    description: "Simple single-column layout with label/input pairs and a footer button bar. Best for basic data entry forms.",
    template: "default",
    layout: {
      columns: 1,
      labelSize: "medium",
      inPanel: false,
    },
    options: {
      width: 800,
      formBorder: true,
      formHeader: true,
      showHistory: true,
      closeButton: true,
      closeOnEscape: true,
      modeless: false,
      buttonsOnTop: false,
    },
  },
  {
    name: "tabs",
    description: "Multi-section form organised with a tab header. Each tab contains its own band of fields. Ideal for complex data sets.",
    template: "tabs",
    layout: {
      columns: 1,
      labelSize: "medium",
      inPanel: false,
      tabs: [
        {
          caption: "General",
          bands: [{ fields: [] }],
        },
        {
          caption: "Details",
          bands: [{ fields: [] }],
        },
      ],
    },
    options: {
      width: 900,
      formBorder: true,
      formHeader: true,
      showHistory: true,
      closeButton: true,
      closeOnEscape: true,
      modeless: false,
      buttonsOnTop: false,
    },
  },
  {
    name: "grid",
    description: "Multi-column grid layout for wide data-dense forms. Fields are arranged in a 2-3 column Bootstrap-style grid.",
    template: "grid",
    layout: {
      columns: 2,
      labelSize: "small",
      inPanel: false,
    },
    options: {
      width: 1000,
      formBorder: true,
      formHeader: true,
      showHistory: false,
      closeButton: true,
      closeOnEscape: true,
      modeless: true,
      buttonsOnTop: true,
    },
  },
  {
    name: "master-detail",
    description: "Split view with a master record area at the top and a subform (datasheet) at the bottom. Perfect for orders with line items.",
    template: "master-detail",
    layout: {
      columns: 1,
      labelSize: "medium",
      inPanel: false,
    },
    options: {
      width: 1000,
      formBorder: true,
      formHeader: true,
      showHistory: true,
      closeButton: true,
      closeOnEscape: true,
      modeless: false,
      buttonsOnTop: false,
    },
  },
  {
    name: "catalog",
    description: "Browse/search layout with a search bar at the top, data table in the middle, and action buttons. Read-only lookup style.",
    template: "catalog",
    layout: {
      columns: 2,
      labelSize: "small",
      inPanel: false,
    },
    options: {
      width: 1100,
      formBorder: true,
      formHeader: true,
      showHistory: false,
      closeButton: true,
      closeOnEscape: true,
      modeless: true,
      buttonsOnTop: true,
      multiSelect: true,
      dblclickEdit: false,
    },
  },
];

// ─── User templates store ──────────────────────────────

const STORAGE_KEY = "roastery-ui:form-templates";

let userTemplates: FormTemplate[] = [];

function isBuiltIn(name: string): boolean {
  return BUILT_IN_TEMPLATES.some((t) => t.name === name);
}

// ─── Public API ────────────────────────────────────────

/** Returns all registered templates (built-in + user). */
export function getTemplates(): FormTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...userTemplates];
}

/** Get a template by name. */
export function getTemplate(name: string): FormTemplate | undefined {
  return getTemplates().find((t) => t.name === name);
}

/** Add a user template. Silently ignores built-in name conflicts. */
export function registerTemplate(template: FormTemplate): void {
  if (isBuiltIn(template.name)) return;
  // Replace existing user template with same name
  const idx = userTemplates.findIndex((t) => t.name === template.name);
  if (idx >= 0) {
    userTemplates[idx] = template;
  } else {
    userTemplates.push(template);
  }
}

/** Remove a user template. Returns false for built-in or nonexistent. */
export function unregisterTemplate(name: string): boolean {
  if (isBuiltIn(name)) return false;
  const idx = userTemplates.findIndex((t) => t.name === name);
  if (idx < 0) return false;
  userTemplates.splice(idx, 1);
  return true;
}

/** Persist user templates to localStorage. */
export function saveUserTemplates(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userTemplates));
  } catch {
    // localStorage may be unavailable (private browsing, SSR)
    // silently ignore
  }
}

/** Load user templates from localStorage. */
export function loadUserTemplates(): FormTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FormTemplate[];
    userTemplates = Array.isArray(parsed) ? parsed : [];
  } catch {
    userTemplates = [];
  }
  return userTemplates;
}

// ─── Apply template to form ────────────────────────────

/**
 * Apply a template to a form definition, producing a new VisualEditorForm
 * with the template's layout and options applied.
 */
export function applyTemplateToForm(
  form: VisualEditorForm,
  template: FormTemplate,
  availableFields: { id: string; caption: string; name: string; type: string }[],
): VisualEditorForm {
  const result: VisualEditorForm = {
    ...form,
    version: form.version,
    // Copy options from template
    width: template.options.width,
    closeButton: template.options.closeButton,
    historyEnabled: template.options.showHistory,
  };

  // Build field names from available fields
  const fieldNames = availableFields.map((f) => f.id || f.name);

  switch (template.template) {
    case "default": {
      // Single band with all available fields, 1 column
      result.detail = {
        ...result.detail,
        controls: [],
      };
      // We can't store column count on the form itself, but we store
      // the layout config via the template's layout.columns
      break;
    }

    case "tabs": {
      // Create tab structure from template definition
      const tabs = template.layout.tabs ?? [];
      if (tabs.length > 0) {
        // Create a tab control with pages for each tab
        const tabControlId = crypto.randomUUID();
        result.detail = {
          ...result.detail,
          controls: [
            {
              id: tabControlId,
              type: "tab-control",
              name: "TabControl",
              left: 0,
              top: 0,
              width: 9000,
              height: 6000,
              pages: tabs.map((_, i) => `page-${i}`),
            },
            ...tabs.flatMap((tab, ti) => {
              const pageId = `page-${ti}`;
              const pageControlId = crypto.randomUUID();
              const fieldControls = tab.bands.flatMap((band) =>
                band.fields
                  .map((fieldName) => {
                    const fieldDef = availableFields.find(
                      (f) => f.id === fieldName || f.name === fieldName,
                    );
                    if (!fieldDef) return null;
                    return {
                      id: crypto.randomUUID(),
                      type: "text-box" as const,
                      name: fieldDef.name,
                      caption: fieldDef.caption,
                      left: 300,
                      top: 300,
                      width: 2880,
                      height: 270,
                      visible: true,
                      enabled: true,
                      locked: false,
                      parentPage: pageId,
                    };
                  })
                  .filter(Boolean),
              );
              return [
                {
                  id: pageControlId,
                  type: "page" as const,
                  name: `Page_${ti}`,
                  caption: tab.caption,
                  left: 0,
                  top: 0,
                  width: 9000,
                  height: 6000,
                } as const,
                ...fieldControls,
              ];
            }),
          ],
        };
      }
      break;
    }

    case "grid": {
      // Set column count from template layout
      result.detail = {
        ...result.detail,
        controls: [],
      };
      break;
    }

    case "master-detail": {
      // Create a subform in the detail section
      result.detail = {
        ...result.detail,
        controls: [
          {
            id: crypto.randomUUID(),
            type: "subform",
            name: "DetailSubform",
            caption: "Details",
            left: 0,
            top: 0,
            width: 9000,
            height: 4000,
            sourceObject: "",
            linkMasterFields: [],
            linkChildFields: [],
          },
        ],
      };
      break;
    }

    case "catalog": {
      // Search bar + data table + action buttons layout
      result.detail = {
        ...result.detail,
        controls: [
          // Search text box at top
          {
            id: crypto.randomUUID(),
            type: "text-box",
            name: "SearchBox",
            caption: "Search",
            left: 300,
            top: 300,
            width: 4000,
            height: 270,
            visible: true,
            enabled: true,
            locked: false,
          },
          // Data table as list box
          {
            id: crypto.randomUUID(),
            type: "list-box",
            name: "ResultsTable",
            left: 300,
            top: 700,
            width: 8400,
            height: 4000,
            visible: true,
            enabled: true,
            locked: false,
            multiSelect: true,
          },
        ],
      };
      break;
    }
  }

  return result;
}
