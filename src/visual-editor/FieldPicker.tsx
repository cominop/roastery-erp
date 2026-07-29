/**
 * FieldPicker — two-list selector (transfer list / dual listbox).
 *
 * Shows "Available Fields" on the left and "Selected Fields" on the right,
 * with buttons to move items between them and up/down reordering on the
 * selected side.
 *
 * Step 71: Used in the visual editor for choosing fields for subforms,
 * combo/list boxes, row sources, and field-binding configuration.
 */

import { useState, useMemo, useCallback } from "react";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────

export interface FieldPickerItem {
  name: string;
  type: string;
}

export interface FieldPickerProps {
  /** All fields available for selection (complete set) */
  availableFields: FieldPickerItem[];
  /** Currently selected fields (subset of availableFields) */
  selectedFields: FieldPickerItem[];
  /** Called when the selected list changes */
  onChange: (selected: FieldPickerItem[]) => void;
  /** Label for the available list (default: "Available Fields") */
  availableLabel?: string;
  /** Label for the selected list (default: "Selected Fields") */
  selectedLabel?: string;
  /** Disable all controls */
  disabled?: boolean;
}

// ─── PostgreSQL type → displayable category ────────────

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

// ─── Main component ────────────────────────────────────

export default function FieldPicker({
  availableFields,
  selectedFields,
  onChange,
  availableLabel = "Available Fields",
  selectedLabel = "Selected Fields",
  disabled = false,
}: FieldPickerProps) {
  const [availSearch, setAvailSearch] = useState("");
  const [selSearch, setSelSearch] = useState("");
  const [availChecked, setAvailChecked] = useState<Set<string>>(new Set());
  const [selChecked, setSelChecked] = useState<Set<string>>(new Set());

  // Fields from availableFields that are NOT already in selectedFields
  const availableOnly = useMemo(
    () =>
      availableFields.filter(
        (f) => !selectedFields.some((s) => s.name === f.name),
      ),
    [availableFields, selectedFields],
  );

  // Search-filtered views
  const filteredAvailable = useMemo(
    () =>
      availSearch
        ? availableOnly.filter((f) =>
            f.name.toLowerCase().includes(availSearch.toLowerCase()),
          )
        : availableOnly,
    [availableOnly, availSearch],
  );

  const filteredSelected = useMemo(
    () =>
      selSearch
        ? selectedFields.filter((f) =>
            f.name.toLowerCase().includes(selSearch.toLowerCase()),
          )
        : selectedFields,
    [selectedFields, selSearch],
  );

  // ── Toggle checkboxes ──
  const toggleAvailChecked = useCallback((name: string) => {
    setAvailChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleSelChecked = useCallback((name: string) => {
    setSelChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // ── Move operations ──
  const moveRight = useCallback(() => {
    const itemsToMove = availableOnly.filter((f) => availChecked.has(f.name));
    if (itemsToMove.length === 0) return;
    onChange([...selectedFields, ...itemsToMove]);
    setAvailChecked(new Set());
  }, [availableOnly, availChecked, onChange, selectedFields]);

  const moveLeft = useCallback(() => {
    const remaining = selectedFields.filter(
      (f) => !selChecked.has(f.name),
    );
    if (remaining.length === selectedFields.length) return;
    onChange(remaining);
    setSelChecked(new Set());
  }, [onChange, selChecked, selectedFields]);

  const moveAllRight = useCallback(() => {
    if (availableOnly.length === 0) return;
    onChange([...selectedFields, ...availableOnly]);
    setAvailChecked(new Set());
  }, [availableOnly, onChange, selectedFields]);

  const moveAllLeft = useCallback(() => {
    if (selectedFields.length === 0) return;
    onChange([]);
    setSelChecked(new Set());
  }, [onChange, selectedFields]);

  // ── Reorder selected (require exactly one checked) ──
  const moveUp = useCallback(() => {
    if (selChecked.size !== 1) return;
    const name = [...selChecked][0];
    const idx = selectedFields.findIndex((f) => f.name === name);
    if (idx <= 0) return;
    const next = [...selectedFields];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
    setSelChecked(new Set([name]));
  }, [onChange, selChecked, selectedFields]);

  const moveDown = useCallback(() => {
    if (selChecked.size !== 1) return;
    const name = [...selChecked][0];
    const idx = selectedFields.findIndex((f) => f.name === name);
    if (idx < 0 || idx >= selectedFields.length - 1) return;
    const next = [...selectedFields];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
    setSelChecked(new Set([name]));
  }, [onChange, selChecked, selectedFields]);

  // ── Inline reorder (no checkbox needed, single-item action) ──
  const inlineMoveUp = useCallback(
    (name: string) => {
      const idx = selectedFields.findIndex((f) => f.name === name);
      if (idx <= 0) return;
      const next = [...selectedFields];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      onChange(next);
    },
    [onChange, selectedFields],
  );

  const inlineMoveDown = useCallback(
    (name: string) => {
      const idx = selectedFields.findIndex((f) => f.name === name);
      if (idx < 0 || idx >= selectedFields.length - 1) return;
      const next = [...selectedFields];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      onChange(next);
    },
    [onChange, selectedFields],
  );

  // ── Reorder button enabled state ──
  const singleSelected = selChecked.size === 1;
  const selIdx =
    singleSelected
      ? selectedFields.findIndex((f) => f.name === [...selChecked][0])
      : -1;
  const canMoveUp = singleSelected && selIdx > 0;
  const canMoveDown = singleSelected && selIdx < selectedFields.length - 1;

  // ── Render helpers ──
  const btnClass =
    "flex items-center justify-center w-7 h-7 border rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none";

  const renderFieldRow = (
    field: FieldPickerItem,
    checked: boolean,
    onToggle: (name: string) => void,
    showReorder = false,
  ) => {
    const cat = typeCategory(field.type);
    return (
      <label
        key={field.name}
        className="group flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50 cursor-pointer transition-colors"
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(field.name)}
          className="h-3 w-3 shrink-0 accent-foreground"
        />
        <span className="flex-1 text-[11px] font-mono truncate leading-tight">
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
        {showReorder && (
          <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inlineMoveUp(field.name);
              }}
              disabled={disabled || selectedFields.findIndex((f) => f.name === field.name) <= 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20"
              title="Move up"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inlineMoveDown(field.name);
              }}
              disabled={
                disabled ||
                selectedFields.findIndex((f) => f.name === field.name) >=
                  selectedFields.length - 1
              }
              className="text-muted-foreground hover:text-foreground disabled:opacity-20"
              title="Move down"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </span>
        )}
      </label>
    );
  };

  return (
    <div
      className={cn(
        "flex gap-0 h-full",
        disabled && "opacity-60 pointer-events-none",
      )}
    >
      {/* ── Available side ── */}
      <div className="flex-1 border rounded-l overflow-hidden bg-background min-w-0 flex flex-col">
        <div className="px-2 py-1.5 border-b shrink-0">
          <div className="text-[11px] font-medium text-foreground mb-1">
            {availableLabel}
            <span className="text-muted-foreground ml-1 font-normal">
              ({availableOnly.length})
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={availSearch}
              onChange={(e) => setAvailSearch(e.target.value)}
              placeholder="Filter..."
              className="w-full h-6 pl-6 pr-2 text-[11px] border rounded bg-background outline-none focus-visible:border-ring"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredAvailable.length === 0 && (
            <div className="px-2 py-4 text-[11px] text-muted-foreground text-center">
              {availSearch
                ? "No fields match filter"
                : "All fields selected"}
            </div>
          )}
          {filteredAvailable.map((field) =>
            renderFieldRow(field, availChecked.has(field.name), toggleAvailChecked),
          )}
        </div>
      </div>

      {/* ── Center buttons ── */}
      <div className="flex flex-col items-center justify-center gap-1 px-1.5 py-2 border-y bg-muted/20 shrink-0">
        <button
          type="button"
          onClick={moveAllRight}
          disabled={disabled || availableOnly.length === 0}
          className={btnClass}
          title="Move all →"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={moveRight}
          disabled={disabled || availChecked.size === 0}
          className={btnClass}
          title="Move selected →"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={moveLeft}
          disabled={disabled || selChecked.size === 0}
          className={btnClass}
          title="← Move selected"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={moveAllLeft}
          disabled={disabled || selectedFields.length === 0}
          className={btnClass}
          title="← Move all"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Selected side ── */}
      <div className="flex-1 border rounded-r overflow-hidden bg-background min-w-0 flex flex-col">
        <div className="px-2 py-1.5 border-b shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-medium text-foreground">
              {selectedLabel}
              <span className="text-muted-foreground ml-1 font-normal">
                ({selectedFields.length})
              </span>
            </div>
            {/* Reorder buttons (top-level, operate on checked items) */}
            {selectedFields.length > 1 && (
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={moveUp}
                  disabled={disabled || !canMoveUp}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                  title="Move selected up"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={moveDown}
                  disabled={disabled || !canMoveDown}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                  title="Move selected down"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={selSearch}
              onChange={(e) => setSelSearch(e.target.value)}
              placeholder="Filter..."
              className="w-full h-6 pl-6 pr-2 text-[11px] border rounded bg-background outline-none focus-visible:border-ring"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredSelected.length === 0 && (
            <div className="px-2 py-4 text-[11px] text-muted-foreground text-center">
              {selSearch ? "No fields match filter" : "No fields selected"}
            </div>
          )}
          {filteredSelected.map((field) =>
            renderFieldRow(
              field,
              selChecked.has(field.name),
              toggleSelChecked,
              true,
            ),
          )}
        </div>
      </div>
    </div>
  );
}