/**
 * ColumnLayoutConfig — configure columns, label width, and panel visibility
 * for the visual editor's form design surface.
 *
 * Step 72: Controls the grid layout of the form sections:
 *   - Number of columns (1–6)
 *   - Label size as a percentage of the column width
 *   - Toggle visibility of form panels (header, detail, footer)
 */

import { useCallback, useId } from "react";
import {
  Columns2,
  Columns3,
  Columns4,
  Minus,
  Plus,
  PanelLeft,
  PanelRightClose,
  PanelBottomClose,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────

export type LayoutPanel = "header" | "detail" | "footer";

export interface ColumnLayoutConfigProps {
  /** Number of columns (1–6) */
  columns: number;
  /** Called when columns change */
  onColumnsChange: (columns: number) => void;
  /** Label width as percentage (0–50) */
  labelWidth: number;
  /** Called when label width changes */
  onLabelWidthChange: (width: number) => void;
  /** Panel visibility state */
  panels: Record<LayoutPanel, boolean>;
  /** Called when a panel's visibility changes */
  onPanelToggle: (panel: LayoutPanel, visible: boolean) => void;
  /** Disable all controls */
  disabled?: boolean;
}

// ─── Label width presets ───────────────────────────────

interface LabelWidthOption {
  value: number;
  label: string;
}

const LABEL_WIDTH_OPTIONS: LabelWidthOption[] = [
  { value: 20, label: "20%" },
  { value: 30, label: "30%" },
  { value: 40, label: "40%" },
];

// ─── Panel config ──────────────────────────────────────

interface PanelDef {
  key: LayoutPanel;
  label: string;
  icon: typeof PanelLeft;
}

const PANEL_DEFS: PanelDef[] = [
  { key: "header", label: "Header", icon: PanelLeft },
  { key: "detail", label: "Detail", icon: PanelRightClose },
  { key: "footer", label: "Footer", icon: PanelBottomClose },
];

// ─── Column icons ──────────────────────────────────────

const COLUMN_COUNT_ICONS: Record<number, typeof Columns2> = {
  1: Columns2,  // single column = two vertical bars side by side? Actually just use Columns3 as default
  2: Columns2,
  3: Columns3,
  4: Columns4,
};

// ─── Component ─────────────────────────────────────────

export default function ColumnLayoutConfig({
  columns,
  onColumnsChange,
  labelWidth,
  onLabelWidthChange,
  panels,
  onPanelToggle,
  disabled = false,
}: ColumnLayoutConfigProps) {
  const colId = useId();
  const labelId = useId();
  const panelId = useId();

  // ── Clamp helpers ──
  const clampColumns = useCallback(
    (n: number) => Math.max(1, Math.min(6, n)),
    [],
  );

  const decColumns = useCallback(() => {
    onColumnsChange(clampColumns(columns - 1));
  }, [columns, onColumnsChange, clampColumns]);

  const incColumns = useCallback(() => {
    onColumnsChange(clampColumns(columns + 1));
  }, [columns, onColumnsChange, clampColumns]);

  // ── Render ──
  const rowClass =
    "flex items-center justify-between min-h-[32px]";
  const labelClass =
    "text-[11px] font-medium text-muted-foreground shrink-0";
  const btnClass = (active = false) =>
    cn(
      "flex items-center justify-center w-7 h-7 border rounded transition-colors",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "hover:bg-muted",
      disabled && "opacity-30 pointer-events-none",
    );

  const ColumnCountIcon = COLUMN_COUNT_ICONS[columns] ?? Columns2;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-3 py-2.5",
        disabled && "opacity-60 pointer-events-none",
      )}
      role="group"
      aria-label="Column layout configuration"
    >
      {/* ── Columns ── */}
      <div className={rowClass}>
        <label
          htmlFor={colId}
          className={labelClass}
        >
          Columns
        </label>
        <div className="flex items-center gap-1.5">
          <button
            id={colId}
            type="button"
            onClick={decColumns}
            disabled={disabled || columns <= 1}
            className={cn(
              btnClass(),
              "disabled:opacity-30 disabled:pointer-events-none",
            )}
            title="Decrease columns"
            aria-label="Decrease columns"
          >
            <Minus className="h-3 w-3" />
          </button>

          <span
            className="flex items-center justify-center w-9 h-7 text-[13px] font-semibold tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            <ColumnCountIcon className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            {columns}
          </span>

          <button
            type="button"
            onClick={incColumns}
            disabled={disabled || columns >= 6}
            className={cn(
              btnClass(),
              "disabled:opacity-30 disabled:pointer-events-none",
            )}
            title="Increase columns"
            aria-label="Increase columns"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ── Label width ── */}
      <div className={rowClass}>
        <span
          id={labelId}
          className={labelClass}
        >
          Label width
        </span>
        <div className="flex gap-1" role="radiogroup" aria-labelledby={labelId}>
          {LABEL_WIDTH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={labelWidth === opt.value}
              onClick={() => onLabelWidthChange(opt.value)}
              disabled={disabled}
              className={cn(
                "px-2 py-0.5 text-[11px] border rounded transition-colors",
                labelWidth === opt.value
                  ? "bg-primary text-primary-foreground border-primary font-medium"
                  : "hover:bg-muted text-muted-foreground",
                disabled && "opacity-30 pointer-events-none",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t my-0.5" />

      {/* ── Panel toggles ── */}
      <div className="flex flex-col gap-1.5" role="group" aria-labelledby={panelId}>
        <span
          id={panelId}
          className={cn(labelClass, "mb-0.5")}
        >
          Visible panels
        </span>
        {PANEL_DEFS.map((def) => {
          const visible = panels[def.key];
          const PanelIcon = def.icon;
          return (
            <label
              key={def.key}
              className="group flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={visible}
                onChange={() => onPanelToggle(def.key, !visible)}
                disabled={disabled}
                className="h-3 w-3 accent-foreground cursor-pointer"
              />
              <PanelIcon
                className={cn(
                  "h-3 w-3 transition-colors",
                  visible
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "text-[11px] transition-colors",
                  visible ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {def.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}