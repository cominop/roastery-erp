/**
 * TableFieldPicker — configure which database fields appear as columns in
 * the datasheet/table view of a form.
 *
 * Shows all available fields from the record source with visibility toggles.
 * Visible columns can be reordered with inline up/down buttons and have
 * per-column settings: display label override, width in pixels, and text
 * alignment.
 *
 * Step 75: Visual Editor 5 — TableFieldPicker + TableOptionsPanel.
 */

import { useState, useCallback, useId } from "react";
import {
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Settings2,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldPickerItem } from "./FieldPicker";

// ─── Types ─────────────────────────────────────────────

export interface TableColumnConfig {
  /** Database field name that maps to a column in the data source */
  field: string;
  /** Display label shown in the column header (defaults to field name) */
  label?: string;
  /** Column width in CSS pixels */
  width?: number;
  /** Whether the column is visible in the table */
  visible: boolean;
  /** Text alignment within the column */
  align?: "left" | "center" | "right";
  /** Whether the column can be sorted by clicking its header */
  sortable?: boolean;
}

export interface TableFieldPickerProps {
  /** All fields available from the record source */
  availableFields: FieldPickerItem[];
  /** Current column configuration */
  columns: TableColumnConfig[];
  /** Called when columns change (add/remove/reorder/edit) */
  onChange: (columns: TableColumnConfig[]) => void;
  /** Disable all controls */
  disabled?: boolean;
}

// ─── Helpers ───────────────────────────────────────────

function typeCategory(type: string): string {
  const lower = type.toLowerCase();
  if (
    lower.includes("int") ||
    lower.includes("numeric") ||
    lower.includes("float") ||
    lower.includes("double") ||
    lower.includes("decimal") ||
    lower.includes("serial") ||
    lower.includes("money") ||
    lower.includes("real")
  )
    return "number";
  if (
    lower.includes("char") ||
    lower.includes("text") ||
    lower.includes("varchar")
  )
    return "text";
  if (
    lower.includes("timestamp") ||
    lower.includes("date") ||
    lower.includes("time")
  )
    return "date";
  if (lower.includes("bool")) return "boolean";
  return "other";
}

const CATEGORY_COLORS: Record<string, string> = {
  number: "text-emerald-600 dark:text-emerald-400",
  text: "text-blue-600 dark:text-blue-400",
  date: "text-violet-600 dark:text-violet-400",
  boolean: "text-amber-600 dark:text-amber-400",
  other: "text-muted-foreground",
};

const ALIGN_OPTIONS: { value: string; label: string }[] = [
  { value: "left", label: "L" },
  { value: "center", label: "C" },
  { value: "right", label: "R" },
];

// ─── Component ─────────────────────────────────────────

export default function TableFieldPicker({
  availableFields,
  columns,
  onChange,
  disabled = false,
}: TableFieldPickerProps) {
  const colId = useId();
  const [expandedField, setExpandedField] = useState<string | null>(null);

  // Build a map of field → column config for quick lookup
  const columnMap = new Map<string, TableColumnConfig>();
  for (const col of columns) {
    columnMap.set(col.field, col);
  }

  // Visible columns in order, plus invisible ones alphabetically
  const visibleColumns = columns.filter((c) => c.visible);
  const invisibleFields = availableFields.filter(
    (f) => !columnMap.has(f.name) || !columnMap.get(f.name)!.visible,
  );

  // ── Toggle visibility ──
  const toggleVisibility = useCallback(
    (field: string) => {
      const existing = columnMap.get(field);
      if (existing) {
        onChange(
          columns.map((c) =>
            c.field === field ? { ...c, visible: !c.visible } : c,
          ),
        );
      } else {
        // Add as a new visible column
        const src = availableFields.find((f) => f.name === field);
        onChange([
          ...columns,
          {
            field,
            label: field,
            width: 120,
            visible: true,
            align: "left",
            sortable: true,
          },
        ]);
      }
    },
    [columnMap, columns, onChange, availableFields],
  );

  // ── Update single column property ──
  const updateColumn = useCallback(
    (field: string, changes: Partial<TableColumnConfig>) => {
      onChange(
        columns.map((c) => (c.field === field ? { ...c, ...changes } : c)),
      );
    },
    [columns, onChange],
  );

  // ── Reorder ──
  const moveUp = useCallback(
    (field: string) => {
      const idx = visibleColumns.findIndex((c) => c.field === field);
      if (idx <= 0) return;
      const fieldName = visibleColumns[idx].field;
      const aboveName = visibleColumns[idx - 1].field;
      // Swap positions in the full columns array
      const fullIdx = columns.findIndex((c) => c.field === fieldName);
      const aboveFullIdx = columns.findIndex((c) => c.field === aboveName);
      if (fullIdx < 0 || aboveFullIdx < 0) return;
      const next = [...columns];
      [next[aboveFullIdx], next[fullIdx]] = [next[fullIdx], next[aboveFullIdx]];
      onChange(next);
    },
    [visibleColumns, columns, onChange],
  );

  const moveDown = useCallback(
    (field: string) => {
      const idx = visibleColumns.findIndex((c) => c.field === field);
      if (idx < 0 || idx >= visibleColumns.length - 1) return;
      const fieldName = visibleColumns[idx].field;
      const belowName = visibleColumns[idx + 1].field;
      const fullIdx = columns.findIndex((c) => c.field === fieldName);
      const belowFullIdx = columns.findIndex((c) => c.field === belowName);
      if (fullIdx < 0 || belowFullIdx < 0) return;
      const next = [...columns];
      [next[fullIdx], next[belowFullIdx]] = [next[belowFullIdx], next[fullIdx]];
      onChange(next);
    },
    [visibleColumns, columns, onChange],
  );

  // ── Toggle expand for inline config ──
  const toggleExpand = useCallback(
    (field: string) => {
      setExpandedField((prev) => (prev === field ? null : field));
    },
    [],
  );

  // ── Render helpers ──
  const btnClass =
    "flex items-center justify-center w-6 h-6 border rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none";
  const rowClass = "flex items-center justify-between min-h-[26px]";
  const labelClass =
    "text-[11px] font-medium text-muted-foreground shrink-0";

  // ── Render ──

  return (
    <div
      className={cn(
        "flex flex-col",
        disabled && "opacity-60 pointer-events-none",
      )}
      role="region"
      aria-label="Table column picker"
    >
      {/* ── Column list ── */}
      <div className="flex flex-col gap-px">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            Table columns
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {visibleColumns.length} visible
          </span>
        </div>

        {/* Visible columns */}
        {visibleColumns.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
            No columns selected — all fields hidden
          </div>
        )}

        {visibleColumns.map((col, idx) => {
          const src = availableFields.find((f) => f.name === col.field);
          const cat = src ? typeCategory(src.type) : "other";
          const isExpanded = expandedField === col.field;

          return (
            <div key={col.field} className="flex flex-col">
              {/* Main row */}
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 hover:bg-muted/30 transition-colors",
                  isExpanded && "bg-muted/20",
                )}
              >
                {/* Visibility toggle */}
                <button
                  type="button"
                  onClick={() => toggleVisibility(col.field)}
                  disabled={disabled}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                  title={
                    col.visible ? "Hide column" : "Show column"
                  }
                  aria-label={
                    col.visible
                      ? `Hide column ${col.field}`
                      : `Show column ${col.field}`
                  }
                >
                  {col.visible ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                </button>

                {/* Field name */}
                <span className="flex-1 text-[11px] font-mono truncate leading-tight">
                  {col.field}
                </span>

                {/* Type badge */}
                {src && (
                  <span
                    className={cn(
                      "text-[10px] font-medium shrink-0 leading-tight",
                      CATEGORY_COLORS[cat],
                    )}
                  >
                    {cat}
                  </span>
                )}

                {/* Reorder buttons */}
                <span className="flex gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveUp(col.field)}
                    disabled={disabled || idx <= 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                    title="Move column up"
                    aria-label={`Move ${col.field} up`}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(col.field)}
                    disabled={disabled || idx >= visibleColumns.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                    title="Move column down"
                    aria-label={`Move ${col.field} down`}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </span>

                {/* Expand config button */}
                <button
                  type="button"
                  onClick={() => toggleExpand(col.field)}
                  disabled={disabled}
                  className={cn(
                    "shrink-0 transition-colors disabled:opacity-30",
                    isExpanded
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Column settings"
                  aria-label={`Settings for ${col.field}`}
                  aria-expanded={isExpanded}
                >
                  <Settings2 className="h-3 w-3" />
                </button>
              </div>

              {/* Expanded inline config */}
              {isExpanded && (
                <div className="flex flex-col gap-1.5 px-6 py-1.5 bg-muted/10 border-b border-muted/30">
                  {/* Label override */}
                  <div className={rowClass}>
                    <span className={labelClass}>Label</span>
                    <input
                      type="text"
                      value={col.label ?? col.field}
                      onChange={(e) =>
                        updateColumn(col.field, { label: e.target.value })
                      }
                      disabled={disabled}
                      placeholder={col.field}
                      className="w-24 h-5 px-1 text-[10px] border rounded bg-background outline-none focus-visible:border-ring text-right font-mono"
                    />
                  </div>

                  {/* Width */}
                  <div className={rowClass}>
                    <span className={labelClass}>Width (px)</span>
                    <input
                      type="number"
                      value={col.width ?? 120}
                      onChange={(e) => {
                        const w = parseInt(e.target.value, 10);
                        if (!isNaN(w) && w >= 20 && w <= 800) {
                          updateColumn(col.field, { width: w });
                        }
                      }}
                      disabled={disabled}
                      min={20}
                      max={800}
                      className="w-16 h-5 px-1 text-[10px] border rounded bg-background outline-none focus-visible:border-ring text-right tabular-nums"
                    />
                  </div>

                  {/* Alignment */}
                  <div className={rowClass}>
                    <span className={labelClass}>Align</span>
                    <div
                      className="flex gap-0.5"
                      role="radiogroup"
                      aria-label={`Alignment for ${col.field}`}
                    >
                      {ALIGN_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={(col.align ?? "left") === opt.value}
                          onClick={() =>
                            updateColumn(col.field, {
                              align: opt.value as "left" | "center" | "right",
                            })
                          }
                          disabled={disabled}
                          className={cn(
                            "w-5 h-5 text-[10px] font-medium border rounded transition-colors",
                            (col.align ?? "left") === opt.value
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-muted text-muted-foreground",
                            disabled && "opacity-30 pointer-events-none",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sortable toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={col.sortable ?? true}
                      onChange={() =>
                        updateColumn(col.field, {
                          sortable: !(col.sortable ?? true),
                        })
                      }
                      disabled={disabled}
                      className="h-3 w-3 accent-foreground cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      Allow sorting
                    </span>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Separator ── */}
      {invisibleFields.length > 0 && visibleColumns.length > 0 && (
        <div className="border-t mx-3 my-1" />
      )}

      {/* ── Hidden fields section (available but not visible) ── */}
      {invisibleFields.length > 0 && (
        <div className="flex flex-col gap-px">
          <div className="px-3 py-1">
            <span className="text-[10px] font-medium text-muted-foreground">
              Hidden fields ({invisibleFields.length})
            </span>
          </div>
          {invisibleFields.map((field) => {
            const cat = typeCategory(field.type);
            return (
              <div
                key={field.name}
                className="flex items-center gap-1.5 px-3 py-1 hover:bg-muted/30 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleVisibility(field.name)}
                  disabled={disabled}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                  title="Show column"
                  aria-label={`Show column ${field.name}`}
                >
                  <EyeOff className="h-3 w-3 opacity-50" />
                </button>
                <span className="flex-1 text-[11px] font-mono truncate leading-tight text-muted-foreground">
                  {field.name}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium shrink-0 leading-tight",
                    CATEGORY_COLORS[cat],
                  )}
                >
                  {cat}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
