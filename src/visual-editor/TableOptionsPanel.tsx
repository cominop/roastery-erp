/**
 * TableOptionsPanel — configure table-level display options for the
 * datasheet/table view of a form.
 *
 * Controls:
 *   - Row height: compact / normal / comfortable
 *   - Alternating row colors toggle
 *   - Grid lines visibility toggle
 *   - Sorting enabled toggle
 *   - Filtering enabled toggle
 *   - Row selection enabled toggle
 *   - Page size (numeric input, 10–500)
 *
 * Step 75: Visual Editor 5 — TableFieldPicker + TableOptionsPanel.
 */

import { useCallback, useId } from "react";
import {
  Rows3,
  Grid3x3,
  ArrowUpDown,
  Filter,
  MousePointer2,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────

export type TableRowHeight = "compact" | "normal" | "comfortable";

export interface TableOptions {
  /** Row height preset */
  rowHeight?: TableRowHeight;
  /** Show alternating row background colors */
  alternatingRows?: boolean;
  /** Show grid lines between cells */
  showGridLines?: boolean;
  /** Allow sorting by clicking column headers */
  allowSorting?: boolean;
  /** Show filter controls in column headers */
  allowFiltering?: boolean;
  /** Allow clicking rows to select them */
  allowRowSelection?: boolean;
  /** Number of records per page */
  pageSize?: number;
}

export interface TableOptionsPanelProps {
  /** Current table options */
  options: TableOptions;
  /** Called when any option changes */
  onChange: (changes: Partial<TableOptions>) => void;
  /** Disable all controls */
  disabled?: boolean;
}

// ─── Constants ─────────────────────────────────────────

const ROW_HEIGHT_OPTIONS: { value: TableRowHeight; label: string; desc: string }[] = [
  { value: "compact",     label: "Compact",     desc: "Dense rows" },
  { value: "normal",      label: "Normal",      desc: "Default spacing" },
  { value: "comfortable", label: "Comfortable", desc: "Extra padding" },
];

const PAGE_SIZE_MIN = 10;
const PAGE_SIZE_MAX = 500;
const PAGE_SIZE_STEP = 10;

// ─── Component ─────────────────────────────────────────

export default function TableOptionsPanel({
  options,
  onChange,
  disabled = false,
}: TableOptionsPanelProps) {
  const rowHeightId = useId();

  // ── Handlers ──
  const setRowHeight = useCallback(
    (value: TableRowHeight) => {
      onChange({ rowHeight: value });
    },
    [onChange],
  );

  const toggleAltRows = useCallback(() => {
    onChange({ alternatingRows: !(options.alternatingRows ?? true) });
  }, [onChange, options.alternatingRows]);

  const toggleGridLines = useCallback(() => {
    onChange({ showGridLines: !(options.showGridLines ?? true) });
  }, [onChange, options.showGridLines]);

  const toggleSorting = useCallback(() => {
    onChange({ allowSorting: !(options.allowSorting ?? true) });
  }, [onChange, options.allowSorting]);

  const toggleFiltering = useCallback(() => {
    onChange({ allowFiltering: !(options.allowFiltering ?? true) });
  }, [onChange, options.allowFiltering]);

  const toggleRowSelection = useCallback(() => {
    onChange({ allowRowSelection: !(options.allowRowSelection ?? true) });
  }, [onChange, options.allowRowSelection]);

  const currentRowHeight = options.rowHeight ?? "normal";

  // ── Render helpers ──
  const rowClass = "flex items-center justify-between min-h-[28px]";
  const labelClass =
    "text-[11px] font-medium text-muted-foreground shrink-0";
  const sectionLabelClass =
    "text-[11px] font-semibold text-foreground flex items-center gap-1.5";

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 px-3 py-2.5",
        disabled && "opacity-60 pointer-events-none",
      )}
      role="region"
      aria-label="Table options"
    >
      {/* ── Section: Row height ── */}
      <div className="flex flex-col gap-1.5">
        <span className={sectionLabelClass}>
          <Rows3 className="h-3.5 w-3.5 text-muted-foreground" />
          Row height
        </span>

        <div
          className="flex gap-1"
          role="radiogroup"
          aria-labelledby={rowHeightId}
        >
          {ROW_HEIGHT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              id={rowHeightId}
              type="button"
              role="radio"
              aria-checked={currentRowHeight === opt.value}
              onClick={() => setRowHeight(opt.value)}
              disabled={disabled}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] border rounded transition-colors",
                currentRowHeight === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted text-muted-foreground",
                disabled && "opacity-30 pointer-events-none",
              )}
              title={opt.desc}
            >
              <span className="font-medium">{opt.label}</span>
              <span className="opacity-70">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t my-0.5" />

      {/* ── Section: Display toggles ── */}
      <div className="flex flex-col gap-1.5">
        <span className={sectionLabelClass}>
          <Grid3x3 className="h-3.5 w-3.5 text-muted-foreground" />
          Display
        </span>

        {/* Alternating rows */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={options.alternatingRows ?? true}
            onChange={toggleAltRows}
            disabled={disabled}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <span className="text-[11px] text-foreground">
            Alternating row colors
          </span>
        </label>

        {/* Grid lines */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={options.showGridLines ?? true}
            onChange={toggleGridLines}
            disabled={disabled}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <span className="text-[11px] text-foreground">
            Show grid lines
          </span>
        </label>
      </div>

      {/* ── Divider ── */}
      <div className="border-t my-0.5" />

      {/* ── Section: Interaction ── */}
      <div className="flex flex-col gap-1.5">
        <span className={sectionLabelClass}>
          <MousePointer2 className="h-3.5 w-3.5 text-muted-foreground" />
          Interaction
        </span>

        {/* Sorting */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={options.allowSorting ?? true}
            onChange={toggleSorting}
            disabled={disabled}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-foreground">
            Allow sorting
          </span>
        </label>

        {/* Filtering */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={options.allowFiltering ?? true}
            onChange={toggleFiltering}
            disabled={disabled}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <Filter className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-foreground">
            Allow filtering
          </span>
        </label>

        {/* Row selection */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={options.allowRowSelection ?? true}
            onChange={toggleRowSelection}
            disabled={disabled}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <ListChecks className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-foreground">
            Row selection
          </span>
        </label>
      </div>

      {/* ── Divider ── */}
      <div className="border-t my-0.5" />

      {/* ── Section: Pagination ── */}
      <div className="flex flex-col gap-1.5">
        <span className={sectionLabelClass}>
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
          Pagination
        </span>

        <div className={rowClass}>
          <span className={labelClass}>Page size</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                onChange({
                  pageSize: Math.max(
                    PAGE_SIZE_MIN,
                    (options.pageSize ?? 50) - PAGE_SIZE_STEP,
                  ),
                })
              }
              disabled={
                disabled || (options.pageSize ?? 50) <= PAGE_SIZE_MIN
              }
              className="flex items-center justify-center w-6 h-6 border rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
              title="Decrease page size"
              aria-label="Decrease page size"
            >
              <span className="text-[13px] leading-none">−</span>
            </button>

            <input
              type="number"
              value={options.pageSize ?? 50}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (
                  !isNaN(v) &&
                  v >= PAGE_SIZE_MIN &&
                  v <= PAGE_SIZE_MAX
                ) {
                  onChange({ pageSize: v });
                }
              }}
              disabled={disabled}
              min={PAGE_SIZE_MIN}
              max={PAGE_SIZE_MAX}
              aria-label="Records per page"
              className="w-14 h-6 text-center text-[11px] font-medium tabular-nums border rounded bg-background outline-none focus-visible:border-ring"
            />

            <button
              type="button"
              onClick={() =>
                onChange({
                  pageSize: Math.min(
                    PAGE_SIZE_MAX,
                    (options.pageSize ?? 50) + PAGE_SIZE_STEP,
                  ),
                })
              }
              disabled={
                disabled || (options.pageSize ?? 50) >= PAGE_SIZE_MAX
              }
              className="flex items-center justify-center w-6 h-6 border rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none"
              title="Increase page size"
              aria-label="Increase page size"
            >
              <span className="text-[13px] leading-none">+</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
