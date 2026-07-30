/**
 * TemplateLibrary — modal panel for browsing, previewing, and applying
 * form layout templates (built-in + user-saved).
 *
 * Step 77: Template Library (Phase 7 of the Visual Editor).
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Grid3x3,
  LayoutTemplate,
  Columns3,
  SplitSquareHorizontal,
  Search,
  Save,
  Trash2,
  X,
  Check,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { VisualEditorForm } from "./types";
import type { FormTemplate } from "./templateRegistry";
import {
  getTemplates,
  getTemplate,
  registerTemplate,
  unregisterTemplate,
  saveUserTemplates,
  applyTemplateToForm,
} from "./templateRegistry";

// ─── Field definition type (minimal) ───────────────────

export interface FieldDefinition {
  id: string;
  caption: string;
  name: string;
  type: string;
}

// ─── Props ─────────────────────────────────────────────

export interface TemplateLibraryProps {
  form: VisualEditorForm;
  availableFields: FieldDefinition[];
  onApplyTemplate: (form: VisualEditorForm) => void;
  onClose: () => void;
}

// ─── Icons per template type ───────────────────────────

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  default: Grid3x3,
  tabs: LayoutTemplate,
  grid: Columns3,
  "master-detail": SplitSquareHorizontal,
  catalog: Search,
};

const TEMPLATE_LABELS: Record<string, string> = {
  default: "Default",
  tabs: "Tabs",
  grid: "Grid",
  "master-detail": "Master-Detail",
  catalog: "Catalog",
};

// ─── Component ─────────────────────────────────────────

export default function TemplateLibrary({
  form,
  availableFields,
  onApplyTemplate,
  onClose,
}: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<FormTemplate[]>(() => getTemplates());
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);

  const selected = selectedName ? getTemplate(selectedName) : undefined;

  // Focus save input when dialog opens
  useEffect(() => {
    if (showSaveDialog && saveInputRef.current) {
      saveInputRef.current.focus();
    }
  }, [showSaveDialog]);

  // ── Handlers ──

  const handleSelect = useCallback((name: string) => {
    setSelectedName((prev) => (prev === name ? null : name));
  }, []);

  const handleApply = useCallback(() => {
    if (!selected) return;
    const updated = applyTemplateToForm(form, selected, availableFields);
    onApplyTemplate(updated);
  }, [selected, form, availableFields, onApplyTemplate]);

  const handleSaveTemplate = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;

    const newTemplate: FormTemplate = {
      name,
      description: saveDescription.trim() || `Custom layout based on "${form.name}"`,
      template: "default",
      layout: {
        columns: 1,
        labelSize: "medium",
        inPanel: false,
      },
      options: {
        width: form.width ?? 800,
        formBorder: form.borderStyle !== undefined && form.borderStyle !== "none",
        formHeader: true,
        showHistory: form.historyEnabled ?? true,
        closeButton: form.closeButton ?? true,
        closeOnEscape: true,
        modeless: !form.modal,
        buttonsOnTop: false,
      },
    };

    registerTemplate(newTemplate);
    saveUserTemplates();
    setTemplates(getTemplates());
    setSaveName("");
    setSaveDescription("");
    setShowSaveDialog(false);
  }, [saveName, saveDescription, form]);

  const handleDelete = useCallback(
    (name: string) => {
      unregisterTemplate(name);
      saveUserTemplates();
      setTemplates(getTemplates());
      if (selectedName === name) setSelectedName(null);
    },
    [selectedName],
  );

  const isBuiltIn = (name: string) =>
    ["default", "tabs", "grid", "master-detail", "catalog"].includes(name);

  // ── Preview panel -- shows template details on the right ──

  const renderPreview = () => {
    if (!selected) return null;

    const Icon = TEMPLATE_ICONS[selected.template] || Grid3x3;

    return (
      <div className="flex flex-col gap-3 w-[220px] shrink-0 border-l p-3 bg-muted/20">
        <div className="flex items-center justify-center h-24 rounded border bg-background">
          <Icon className="h-10 w-10 text-muted-foreground/40" />
        </div>

        <div>
          <p className="text-[11px] font-semibold text-foreground">{selected.name}</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
            {selected.description}
          </p>
        </div>

        <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Type</span>
            <span className="font-medium text-foreground">
              {TEMPLATE_LABELS[selected.template] || selected.template}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Columns</span>
            <span className="font-medium text-foreground">{selected.layout.columns}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Label size</span>
            <span className="font-medium text-foreground capitalize">
              {selected.layout.labelSize}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Width</span>
            <span className="font-medium text-foreground">{selected.options.width}px</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Header</span>
            <span className="font-medium text-foreground">
              {selected.options.formHeader ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>History</span>
            <span className="font-medium text-foreground">
              {selected.options.showHistory ? "Yes" : "No"}
            </span>
          </div>
          {selected.layout.tabs && selected.layout.tabs.length > 0 && (
            <div className="flex items-center justify-between">
              <span>Tabs</span>
              <span className="font-medium text-foreground">
                {selected.layout.tabs.length}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleApply}
          className="mt-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-foreground text-background rounded hover:opacity-90 transition-opacity"
        >
          <Check className="h-3 w-3" />
          Apply Template
        </button>
      </div>
    );
  };

  // ── Save dialog ──

  const renderSaveDialog = () => {
    if (!showSaveDialog) return null;

    return (
      <div
        className="absolute inset-0 z-10 flex items-center justify-center bg-black/30"
        role="dialog"
        aria-modal="true"
        aria-label="Save template"
      >
        <div className="bg-background border rounded-lg shadow-xl p-4 w-[320px] flex flex-col gap-3">
          <p className="text-[13px] font-semibold text-foreground">Save Current Layout</p>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-muted-foreground">Template name</label>
            <input
              ref={saveInputRef}
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. Order Entry Compact"
              className="px-2 py-1.5 text-[11px] border rounded bg-background text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-foreground/30"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTemplate();
                if (e.key === "Escape") setShowSaveDialog(false);
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-muted-foreground">Description (optional)</label>
            <input
              type="text"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              placeholder="What's this layout for?"
              className="px-2 py-1.5 text-[11px] border rounded bg-background text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-foreground/30"
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowSaveDialog(false);
              }}
            />
          </div>

          <div className="flex items-center justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={() => setShowSaveDialog(false)}
              className="px-3 py-1.5 text-[11px] font-medium border rounded hover:bg-muted transition-colors text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!saveName.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-foreground text-background rounded hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Save className="h-3 w-3" />
              Save
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Render: template card ──

  const renderCard = (tpl: FormTemplate) => {
    const isSelected = selectedName === tpl.name;
    const builtIn = isBuiltIn(tpl.name);
    const Icon = TEMPLATE_ICONS[tpl.template] || Grid3x3;

    return (
      <div
        key={tpl.name}
        role="button"
        tabIndex={0}
        onClick={() => handleSelect(tpl.name)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleSelect(tpl.name);
          }
        }}
        className={cn(
          "flex flex-col gap-1.5 p-3 rounded-lg border text-left transition-all duration-150 cursor-pointer",
          "hover:border-foreground/30 hover:shadow-sm",
          isSelected
            ? "border-foreground/50 ring-1 ring-foreground/20 bg-muted/30"
            : "border-border",
        )}
      >
        {/* Icon area */}
        <div className="flex items-center justify-center h-16 rounded bg-muted/20 border border-border/50">
          <Icon className="h-7 w-7 text-muted-foreground/30" />
        </div>

        {/* Name */}
        <p className="text-[11px] font-semibold text-foreground truncate">
          {tpl.name}
        </p>

        {/* Badge row */}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider",
              builtIn
                ? "bg-muted text-muted-foreground"
                : "bg-blue-500/10 text-blue-600",
            )}
          >
            {TEMPLATE_LABELS[tpl.template] || tpl.template}
          </span>
          {!builtIn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(tpl.name);
              }}
              className="ml-auto flex items-center justify-center w-5 h-5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
              aria-label={`Delete template ${tpl.name}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Description */}
        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
          {tpl.description}
        </p>
      </div>
    );
  };

  // ── Main render ──

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Template Library"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div className="relative bg-background border rounded-lg shadow-2xl flex flex-col w-[760px] max-h-[85vh] overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">
              Template Library
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSaveDialog(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium border rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Save className="h-3 w-3" />
              Save Current Layout
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Close template library"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0">
          {/* Template cards grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {templates.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-[11px] text-muted-foreground">
                No templates available.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {templates.map(renderCard)}
              </div>
            )}
          </div>

          {/* Preview panel */}
          {renderPreview()}
        </div>

        {/* ── Save dialog overlay ── */}
        {renderSaveDialog()}
      </div>
    </div>
  );
}
