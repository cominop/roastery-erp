/**
 * FieldEditorDialog — modal dialog for creating or editing field (control)
 * definitions in the visual form editor.
 *
 * Provides a comprehensive property sheet organised into sections:
 *   - General: name, type, caption, position, visibility, enabled, locked
 *   - Data: control source, row source, bound column, default value, format
 *   - Style: colors, border, font, alignment
 *   - Behavior: tab index, scroll bars, multi-select, auto-tab, input mask
 *   - Validation: rule, validation text
 *
 * Step 76: Visual Editor 6 — FieldEditorDialog.
 */

import { useState, useCallback, useEffect, useId, useRef } from "react";
import {
  Type,
  Square,
  FileSpreadsheet,
  Paintbrush,
  Settings2,
  AlertTriangle,
  Zap,
  X,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  VisualEditorControl,
  VisualEditorControlType,
  TextAlignment,
  BorderStyle,
  EventBindings,
  VisualStyle,
  DataBinding,
  Validation,
} from "./types";

// ─── Control type options ──────────────────────────

const CONTROL_TYPE_OPTIONS: { value: VisualEditorControlType; label: string }[] =
  [
    { value: "text-box", label: "Text Box" },
    { value: "label", label: "Label" },
    { value: "command-button", label: "Button" },
    { value: "combo-box", label: "Combo Box" },
    { value: "list-box", label: "List Box" },
    { value: "check-box", label: "Check Box" },
    { value: "option-button", label: "Option Button" },
    { value: "toggle-button", label: "Toggle Button" },
    { value: "option-group", label: "Option Group" },
    { value: "tab-control", label: "Tab Control" },
    { value: "subform", label: "Subform" },
    { value: "image", label: "Image" },
    { value: "line", label: "Line" },
    { value: "rectangle", label: "Rectangle" },
    { value: "attachment", label: "Attachment" },
  ];

const TEXT_ALIGN_OPTIONS: { value: TextAlignment; label: string }[] = [
  { value: "general", label: "General" },
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const BORDER_STYLE_OPTIONS: { value: BorderStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "none", label: "None" },
];

const SCROLL_BAR_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
  { value: "both", label: "Both" },
];

// ─── Default values for a new control ──────────────

function createDefaultControl(
  overrides?: Partial<VisualEditorControl>,
): VisualEditorControl {
  return {
    id: crypto.randomUUID(),
    type: "text-box",
    name: "",
    caption: "",
    left: 300,
    top: 300,
    width: 1440,
    height: 270,
    visible: true,
    enabled: true,
    locked: false,
    tabIndex: 0,
    ...overrides,
  };
}

// ─── Props ─────────────────────────────────────────

export interface FieldEditorDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called to close the dialog without saving */
  onClose: () => void;
  /** Called when the user saves the control definition */
  onSave: (control: VisualEditorControl) => void;
  /** Existing control to edit (omit for create mode) */
  control?: VisualEditorControl;
}

// ─── Helpers ───────────────────────────────────────

type SectionKey = "general" | "data" | "style" | "behavior" | "validation" | "events";

interface SectionDef {
  key: SectionKey;
  label: string;
  icon: typeof Type;
}

const SECTIONS: SectionDef[] = [
  { key: "general",   label: "General",   icon: Type },
  { key: "data",      label: "Data",      icon: FileSpreadsheet },
  { key: "style",     label: "Style",     icon: Paintbrush },
  { key: "behavior",  label: "Behavior",  icon: Settings2 },
  { key: "validation", label: "Validation", icon: AlertTriangle },
  { key: "events",     label: "Events",   icon: Zap },
];

const sectionLabelClass =
  "text-[11px] font-semibold text-foreground flex items-center gap-1.5";
const rowClass = "flex items-center justify-between min-h-[28px]";
const labelClass = "text-[11px] font-medium text-muted-foreground shrink-0";
const inputClass =
  "h-6 px-1.5 text-[10px] border rounded bg-background outline-none focus-visible:border-ring";
const selectClass =
  "h-6 text-[10px] border rounded px-1 bg-background outline-none focus-visible:border-ring";
const numberInputClass =
  "h-6 px-1 text-[10px] text-right font-mono tabular-nums border rounded bg-background outline-none focus-visible:border-ring";

// ─── Component ─────────────────────────────────────

export default function FieldEditorDialog({
  open,
  onClose,
  onSave,
  control,
}: FieldEditorDialogProps) {
  const isEdit = !!control;
  const [activeSection, setActiveSection] = useState<SectionKey>("general");
  const [draft, setDraft] = useState<VisualEditorControl>(() =>
    control ? { ...control } : createDefaultControl(),
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const sectionId = useId();

  // Reset draft when dialog opens/control changes
  useEffect(() => {
    if (open) {
      setDraft(control ? { ...control } : createDefaultControl());
      setActiveSection("general");
    }
  }, [open, control]);

  // Trap focus / close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // ── Draft updaters ──

  const patchDraft = useCallback(
    (changes: Partial<VisualEditorControl>) => {
      setDraft((prev) => ({ ...prev, ...changes }));
    },
    [],
  );

  const patchStyle = useCallback(
    (changes: Partial<VisualStyle>) => {
      setDraft((prev) => ({
        ...prev,
        style: { ...(prev.style ?? {}), ...changes },
      }));
    },
    [],
  );

  const patchDataBinding = useCallback(
    (changes: Partial<DataBinding>) => {
      setDraft((prev) => ({
        ...prev,
        dataBinding: { ...(prev.dataBinding ?? {}), ...changes },
      }));
    },
    [],
  );

  const patchValidation = useCallback(
    (changes: Partial<Validation>) => {
      setDraft((prev) => ({
        ...prev,
        validation: { ...(prev.validation ?? {}), ...changes },
      }));
    },
    [],
  );

  const patchEvents = useCallback(
    (changes: Partial<EventBindings>) => {
      setDraft((prev) => ({
        ...prev,
        events: { ...(prev.events ?? {}), ...changes },
      }));
    },
    [],
  );

  // ── Save handler ──

  const handleSave = useCallback(() => {
    onSave(draft);
  }, [draft, onSave]);

  // ── Render: section nav ──

  const renderNav = () => (
    <div className="flex flex-wrap gap-px border-b px-3 pt-1.5 pb-0" role="tablist" aria-label="Property sections">
      {SECTIONS.map((sec) => {
        const isActive = activeSection === sec.key;
        const SecIcon = sec.icon;
        return (
          <button
            key={sec.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveSection(sec.key)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium border rounded-t transition-colors",
              isActive
                ? "border-b-background bg-background text-foreground -mb-px"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30",
            )}
          >
            <SecIcon className="h-3 w-3" />
            {sec.label}
          </button>
        );
      })}
    </div>
  );

  // ── Render: General tab ──

  const renderGeneral = () => (
    <div className="flex flex-col gap-2">
      {/* Name */}
      <div className={rowClass}>
        <span className={labelClass}>Name</span>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => patchDraft({ name: e.target.value })}
          placeholder="FieldName"
          className={cn(inputClass, "w-36")}
          aria-label="Field name"
        />
      </div>

      {/* Type */}
      <div className={rowClass}>
        <span className={labelClass}>Type</span>
        <select
          value={draft.type}
          onChange={(e) =>
            patchDraft({ type: e.target.value as VisualEditorControlType })
          }
          className={cn(selectClass, "w-32")}
          aria-label="Control type"
        >
          {CONTROL_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Caption */}
      <div className={rowClass}>
        <span className={labelClass}>Caption</span>
        <input
          type="text"
          value={draft.caption ?? ""}
          onChange={(e) => patchDraft({ caption: e.target.value })}
          placeholder="Display label"
          className={cn(inputClass, "w-36")}
          aria-label="Caption"
        />
      </div>

      {/* Position grid */}
      <div className="border-t my-0.5" />
      <span className={sectionLabelClass}>Position</span>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between gap-1">
          <span className={labelClass}>Left</span>
          <input
            type="number"
            value={draft.left}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) patchDraft({ left: v });
            }}
            className={cn(numberInputClass, "w-16")}
            aria-label="Left position"
          />
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className={labelClass}>Top</span>
          <input
            type="number"
            value={draft.top}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) patchDraft({ top: v });
            }}
            className={cn(numberInputClass, "w-16")}
            aria-label="Top position"
          />
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className={labelClass}>Width</span>
          <input
            type="number"
            value={draft.width}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1) patchDraft({ width: v });
            }}
            min={1}
            className={cn(numberInputClass, "w-16")}
            aria-label="Width"
          />
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className={labelClass}>Height</span>
          <input
            type="number"
            value={draft.height}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1) patchDraft({ height: v });
            }}
            min={1}
            className={cn(numberInputClass, "w-16")}
            aria-label="Height"
          />
        </div>
      </div>

      {/* Z-Index */}
      <div className={rowClass}>
        <span className={labelClass}>Z-Index</span>
        <input
          type="number"
          value={draft.zIndex ?? 0}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) patchDraft({ zIndex: v });
          }}
          className={cn(numberInputClass, "w-16")}
          aria-label="Z-index"
        />
      </div>
    </div>
  );

  // ── Render: Data tab ──

  const renderData = () => (
    <div className="flex flex-col gap-2">
      {/* Control source */}
      <div className={rowClass}>
        <span className={labelClass}>Control source</span>
        <input
          type="text"
          value={draft.dataBinding?.controlSource ?? ""}
          onChange={(e) => patchDataBinding({ controlSource: e.target.value })}
          placeholder="table.field"
          className={cn(inputClass, "w-36")}
          aria-label="Control source"
        />
      </div>

      {/* Row source */}
      <div className={rowClass}>
        <span className={labelClass}>Row source</span>
        <input
          type="text"
          value={draft.dataBinding?.rowSource ?? ""}
          onChange={(e) => patchDataBinding({ rowSource: e.target.value })}
          placeholder="SQL or table name"
          className={cn(inputClass, "w-36")}
          aria-label="Row source"
        />
      </div>

      {/* Row source type */}
      <div className={rowClass}>
        <span className={labelClass}>Row source type</span>
        <input
          type="text"
          value={draft.rowSourceType ?? ""}
          onChange={(e) => patchDraft({ rowSourceType: e.target.value })}
          placeholder="Table/Value List"
          className={cn(inputClass, "w-36")}
          aria-label="Row source type"
        />
      </div>

      {/* Bound column */}
      <div className={rowClass}>
        <span className={labelClass}>Bound column</span>
        <input
          type="number"
          value={draft.dataBinding?.boundColumn ?? 0}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 0) patchDataBinding({ boundColumn: v });
          }}
          min={0}
          className={cn(numberInputClass, "w-16")}
          aria-label="Bound column"
        />
      </div>

      {/* Default value */}
      <div className={rowClass}>
        <span className={labelClass}>Default value</span>
        <input
          type="text"
          value={draft.dataBinding?.defaultValue ?? ""}
          onChange={(e) => patchDataBinding({ defaultValue: e.target.value })}
          placeholder="Expression or literal"
          className={cn(inputClass, "w-36")}
          aria-label="Default value"
        />
      </div>

      {/* Input mask */}
      <div className={rowClass}>
        <span className={labelClass}>Input mask</span>
        <input
          type="text"
          value={draft.inputMask ?? ""}
          onChange={(e) => patchDraft({ inputMask: e.target.value })}
          placeholder="000-000-0000"
          className={cn(inputClass, "w-36")}
          aria-label="Input mask"
        />
      </div>

      {/* Format */}
      <div className={rowClass}>
        <span className={labelClass}>Format</span>
        <input
          type="text"
          value={draft.format ?? ""}
          onChange={(e) => patchDraft({ format: e.target.value })}
          placeholder="#,##0.00"
          className={cn(inputClass, "w-36")}
          aria-label="Format string"
        />
      </div>

      {/* Decimal places */}
      <div className={rowClass}>
        <span className={labelClass}>Decimal places</span>
        <input
          type="number"
          value={draft.decimalPlaces ?? ""}
          onChange={(e) => {
            const v = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
            if (v === undefined || (!isNaN(v) && v >= 0 && v <= 15)) {
              patchDraft({ decimalPlaces: v });
            }
          }}
          min={0}
          max={15}
          className={cn(numberInputClass, "w-16")}
          aria-label="Decimal places"
        />
      </div>

      {/* Calculated */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.isCalculated ?? false}
          onChange={() => patchDraft({ isCalculated: !draft.isCalculated })}
          className="h-3 w-3 accent-foreground cursor-pointer"
        />
        <span className="text-[11px] text-foreground">Calculated field</span>
      </label>

      {draft.isCalculated && (
        <div className={rowClass}>
          <span className={labelClass}>Expression</span>
          <input
            type="text"
            value={draft.expression ?? ""}
            onChange={(e) => patchDraft({ expression: e.target.value })}
            placeholder="= field1 + field2"
            className={cn(inputClass, "w-36")}
            aria-label="Expression"
          />
        </div>
      )}
    </div>
  );

  // ── Render: Style tab ──

  const renderStyle = () => {
    const style = draft.style ?? {};

    return (
      <div className="flex flex-col gap-2">
        {/* Colors */}
        <span className={sectionLabelClass}>Colors</span>

        <div className={rowClass}>
          <span className={labelClass}>Background</span>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={style.backColor ?? "#ffffff"}
              onChange={(e) => patchStyle({ backColor: e.target.value })}
              className="w-7 h-6 p-0 border rounded cursor-pointer"
              aria-label="Background color"
            />
            <span className="text-[9px] text-muted-foreground font-mono w-14 truncate">
              {style.backColor ?? "default"}
            </span>
          </div>
        </div>

        <div className={rowClass}>
          <span className={labelClass}>Foreground</span>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={style.foreColor ?? "#000000"}
              onChange={(e) => patchStyle({ foreColor: e.target.value })}
              className="w-7 h-6 p-0 border rounded cursor-pointer"
              aria-label="Foreground color"
            />
            <span className="text-[9px] text-muted-foreground font-mono w-14 truncate">
              {style.foreColor ?? "default"}
            </span>
          </div>
        </div>

        <div className={rowClass}>
          <span className={labelClass}>Border color</span>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={style.borderColor ?? "#000000"}
              onChange={(e) => patchStyle({ borderColor: e.target.value })}
              className="w-7 h-6 p-0 border rounded cursor-pointer"
              aria-label="Border color"
            />
            <span className="text-[9px] text-muted-foreground font-mono w-14 truncate">
              {style.borderColor ?? "default"}
            </span>
          </div>
        </div>

        {/* Border */}
        <div className="border-t my-0.5" />
        <span className={sectionLabelClass}>Border</span>

        <div className={rowClass}>
          <span className={labelClass}>Style</span>
          <select
            value={style.borderStyle ?? "solid"}
            onChange={(e) =>
              patchStyle({ borderStyle: e.target.value as BorderStyle })
            }
            className={cn(selectClass, "w-24")}
            aria-label="Border style"
          >
            {BORDER_STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className={rowClass}>
          <span className={labelClass}>Width</span>
          <input
            type="number"
            value={style.borderWidth ?? 1}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 0) patchStyle({ borderWidth: v });
            }}
            min={0}
            max={10}
            className={cn(numberInputClass, "w-16")}
            aria-label="Border width"
          />
        </div>

        {/* Font */}
        <div className="border-t my-0.5" />
        <span className={sectionLabelClass}>Font</span>

        <div className={rowClass}>
          <span className={labelClass}>Name</span>
          <input
            type="text"
            value={style.fontName ?? ""}
            onChange={(e) => patchStyle({ fontName: e.target.value })}
            placeholder="Segoe UI"
            className={cn(inputClass, "w-36")}
            aria-label="Font name"
          />
        </div>

        <div className={rowClass}>
          <span className={labelClass}>Size</span>
          <input
            type="number"
            value={style.fontSize ?? 8}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1 && v <= 72)
                patchStyle({ fontSize: v });
            }}
            min={1}
            max={72}
            className={cn(numberInputClass, "w-16")}
            aria-label="Font size"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={style.fontBold ?? false}
              onChange={() => patchStyle({ fontBold: !style.fontBold })}
              className="h-3 w-3 accent-foreground cursor-pointer"
            />
            <span className="text-[11px] text-foreground font-semibold">Bold</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={style.fontItalic ?? false}
              onChange={() => patchStyle({ fontItalic: !style.fontItalic })}
              className="h-3 w-3 accent-foreground cursor-pointer"
            />
            <span className="text-[11px] text-foreground italic">Italic</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={style.fontUnderline ?? false}
              onChange={() => patchStyle({ fontUnderline: !style.fontUnderline })}
              className="h-3 w-3 accent-foreground cursor-pointer"
            />
            <span className="text-[11px] text-foreground underline">Underline</span>
          </label>
        </div>

        {/* Text alignment */}
        <div className={rowClass}>
          <span className={labelClass}>Text align</span>
          <select
            value={style.textAlign ?? "general"}
            onChange={(e) =>
              patchStyle({ textAlign: e.target.value as TextAlignment })
            }
            className={cn(selectClass, "w-24")}
            aria-label="Text alignment"
          >
            {TEXT_ALIGN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  // ── Render: Behavior tab ──

  const renderBehavior = () => (
    <div className="flex flex-col gap-2">
      {/* Toggles */}
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.visible ?? true}
            onChange={() => patchDraft({ visible: !(draft.visible ?? true) })}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <span className="text-[11px] text-foreground">Visible</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.enabled ?? true}
            onChange={() => patchDraft({ enabled: !(draft.enabled ?? true) })}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <span className="text-[11px] text-foreground">Enabled</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.locked ?? false}
            onChange={() => patchDraft({ locked: !(draft.locked ?? false) })}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <span className="text-[11px] text-foreground">Locked</span>
        </label>
      </div>

      {/* Tab index */}
      <div className={rowClass}>
        <span className={labelClass}>Tab index</span>
        <input
          type="number"
          value={draft.tabIndex ?? 0}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 0) patchDraft({ tabIndex: v });
          }}
          min={0}
          className={cn(numberInputClass, "w-16")}
          aria-label="Tab index"
        />
      </div>

      {/* Scroll bars */}
      <div className={rowClass}>
        <span className={labelClass}>Scroll bars</span>
        <select
          value={draft.scrollBars ?? "none"}
          onChange={(e) =>
            patchDraft({ scrollBars: e.target.value as VisualEditorControl["scrollBars"] })
          }
          className={cn(selectClass, "w-24")}
          aria-label="Scroll bars"
        >
          {SCROLL_BAR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Additional toggles (shown for relevant control types) */}
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.multiSelect ?? false}
            onChange={() => patchDraft({ multiSelect: !(draft.multiSelect ?? false) })}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <span className="text-[11px] text-foreground">Multi-select</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.autoTab ?? false}
            onChange={() => patchDraft({ autoTab: !(draft.autoTab ?? false) })}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <span className="text-[11px] text-foreground">Auto-tab</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.enterKeyBehavior ?? false}
            onChange={() =>
              patchDraft({ enterKeyBehavior: !(draft.enterKeyBehavior ?? false) })
            }
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <span className="text-[11px] text-foreground">Enter moves focus</span>
        </label>
      </div>

      {/* Text format (rich text) */}
      <div className={rowClass}>
        <span className={labelClass}>Text format</span>
        <select
          value={String(draft.textFormat ?? 0)}
          onChange={(e) =>
            patchDraft({ textFormat: e.target.value === "1" ? 1 : 0 })
          }
          className={cn(selectClass, "w-24")}
          aria-label="Text format"
        >
          <option value="0">Plain text</option>
          <option value="1">Rich text</option>
        </select>
      </div>
    </div>
  );

  // ── Render: Validation tab ──

  const renderValidation = () => (
    <div className="flex flex-col gap-2">
      <div className={rowClass}>
        <span className={labelClass}>Validation rule</span>
        <input
          type="text"
          value={draft.validation?.rule ?? ""}
          onChange={(e) => patchValidation({ rule: e.target.value })}
          placeholder="> 0 AND < 100"
          className={cn(inputClass, "w-36")}
          aria-label="Validation rule"
        />
      </div>
      <div className={rowClass}>
        <span className={labelClass}>Validation text</span>
        <input
          type="text"
          value={draft.validation?.text ?? ""}
          onChange={(e) => patchValidation({ text: e.target.value })}
          placeholder="Value must be between 0 and 100"
          className={cn(inputClass, "w-36")}
          aria-label="Validation text"
        />
      </div>
    </div>
  );

  // ── Render: Events tab ──

  const EVENT_FIELDS: { key: keyof EventBindings; label: string }[] = [
    { key: "onClick", label: "On Click" },
    { key: "onDblClick", label: "On Double Click" },
    { key: "onMouseDown", label: "On Mouse Down" },
    { key: "onMouseUp", label: "On Mouse Up" },
    { key: "onMouseMove", label: "On Mouse Move" },
    { key: "onBeforeUpdate", label: "On Before Update" },
    { key: "onAfterUpdate", label: "On After Update" },
    { key: "onChange", label: "On Change" },
    { key: "onEnter", label: "On Enter" },
    { key: "onExit", label: "On Exit" },
    { key: "onGotFocus", label: "On Got Focus" },
    { key: "onLostFocus", label: "On Lost Focus" },
    { key: "onKeyDown", label: "On Key Down" },
    { key: "onKeyUp", label: "On Key Up" },
    { key: "onKeyPress", label: "On Key Press" },
  ];

  const renderEvents = () => (
    <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto">
      {EVENT_FIELDS.map((ev) => (
        <div key={ev.key} className={rowClass}>
          <span className={labelClass}>{ev.label}</span>
          <input
            type="text"
            value={(draft.events?.[ev.key] as string) ?? ""}
            onChange={(e) => patchEvents({ [ev.key]: e.target.value })}
            placeholder="[Event procedure]"
            className={cn(inputClass, "w-36")}
            aria-label={ev.label}
          />
        </div>
      ))}
    </div>
  );

  // ── Render: section content ──

  const sectionContent: Record<SectionKey, () => React.ReactNode> = {
    general: renderGeneral,
    data: renderData,
    style: renderStyle,
    behavior: renderBehavior,
    validation: renderValidation,
    events: renderEvents,
  };

  // ── Render: dialog ──

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit field" : "New field"}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div
        ref={dialogRef}
        className="relative bg-background border rounded-lg shadow-2xl flex flex-col w-[520px] max-h-[85vh] overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Square className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">
              {isEdit ? `Edit: ${control?.name || "Untitled"}` : "New Field"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── Section nav ── */}
        {renderNav()}

        {/* ── Body — scrollable section content ── */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3"
          role="tabpanel"
          aria-labelledby={`${sectionId}-${activeSection}`}
        >
          {sectionContent[activeSection]()}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] font-medium border rounded hover:bg-muted transition-colors text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-foreground text-background rounded hover:opacity-90 transition-opacity"
          >
            <Save className="h-3 w-3" />
            {isEdit ? "Update Field" : "Create Field"}
          </button>
        </div>
      </div>
    </div>
  );
}