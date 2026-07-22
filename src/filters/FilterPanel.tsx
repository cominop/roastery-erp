// FilterPanel — collapsible filter management UI
// Integrates with the useFilters hook to let users view, add, remove,
// toggle, and search filters.
// When columns are provided, the "Add Filter" section uses type-specific
// filter controls (text ILIKE, number range, date range, boolean, lookup).
import { useState, useCallback } from "react";
import {
  Filter,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { UseFiltersReturn } from "@/hooks/useFilters";
import type { FilterColumn } from "./types";
import FilterControlFactory from "./FilterControlFactory";
import FilterSummary from "./FilterSummary";

type FilterPanelProps = Omit<UseFiltersReturn, "activeFilters" | "combinedFilter" | "hasActiveFilters" | "setFilterActive" | "updateFilter" | "setFilters"> & {
  /** Active filters (for collapsed summary display) */
  activeFilters: UseFiltersReturn["activeFilters"];
  /** Whether any user-defined filter is active */
  hasActiveFilters: boolean;
  /** Set a filter's active state explicitly */
  setFilterActive: UseFiltersReturn["setFilterActive"];
  /** Update a filter's name and/or expression */
  updateFilter: UseFiltersReturn["updateFilter"];
  /** Replace all filters (bulk set) */
  setFilters: UseFiltersReturn["setFilters"];
  /** Optional column definitions for type-specific filter controls.
   *  When provided, the "Add Filter" section shows a column picker
   *  followed by the appropriate control (text ILIKE, number range,
   *  date range, boolean dropdown, or lookup).
   *  When omitted, the old free-form name + expression inputs are used. */
  columns?: FilterColumn[];
};

export default function FilterPanel({
  filters,
  activeFilters,
  hasActiveFilters,
  addFilter,
  removeFilter,
  toggleFilter,
  setFilterActive,
  clearFilters,
  updateFilter,
  setFilters,
  columns,
}: FilterPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Column-based add flow state
  const [selectedColumn, setSelectedColumn] = useState<FilterColumn | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Legacy free-form add flow state
  const [newName, setNewName] = useState("");
  const [newExpression, setNewExpression] = useState("");

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // ── Legacy free-form add handler ──
  const handleAddFilter = useCallback(() => {
    const name = newName.trim();
    const expression = newExpression.trim();
    if (!name || !expression) return;
    addFilter(name, expression);
    setNewName("");
    setNewExpression("");
  }, [newName, newExpression, addFilter]);

  // ── Column-based add handler ──
  const handleColumnApply = useCallback(
    (name: string, expression: string) => {
      addFilter(name, expression);
      setSelectedColumn(null);
      setShowColumnPicker(false);
    },
    [addFilter]
  );

  const handleColumnCancel = useCallback(() => {
    setSelectedColumn(null);
    setShowColumnPicker(false);
  }, []);

  const handleColumnSelect = useCallback(
    (field: string) => {
      const col = columns?.find((c) => c.field === field) ?? null;
      setSelectedColumn(col);
    },
    [columns]
  );

  const handleClearAll = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const filteredFilters = filters.filter((f) =>
    searchQuery
      ? f.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  // Determine if we should show the column-based add flow
  const hasColumns = columns && columns.length > 0;

  return (
    <div
      className="border-t border-border"
      data-testid="filter-panel"
    >
      {/* Collapsed bar / Header bar */}
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer",
          expanded && "border-b border-border bg-muted/30"
        )}
        data-testid="filter-panel-toggle"
        aria-expanded={expanded}
      >
        <Filter className="size-3.5 shrink-0" />
        <span className="font-medium text-foreground">Filters</span>

        {/* Active filter count badge */}
        {hasActiveFilters && (
          <span
            data-testid="filter-count-badge"
            className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary min-w-5 h-5 px-1.5 text-[10px] font-semibold"
          >
            {activeFilters.length}
          </span>
        )}

        {/* Summary chips (collapsed only) */}
        {!expanded && hasActiveFilters && (
          <div className="flex-1 min-w-0 ml-1">
            <FilterSummary
              filters={activeFilters}
              onRemove={removeFilter}
              onToggle={toggleFilter}
            />
          </div>
        )}

        <div className="ml-auto shrink-0">
          {expanded ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div
          className="px-3 pb-3 pt-2 space-y-3"
          data-testid="filter-panel-content"
        >
          {/* Search + Clear All row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                data-testid="filter-search-input"
                className="h-7 pl-7 text-xs"
                placeholder="Search filters..."
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>
            {filters.length > 0 && (
              <Button
                data-testid="filter-clear-all"
                variant="ghost"
                size="xs"
                onClick={handleClearAll}
                className="shrink-0 text-muted-foreground"
              >
                Clear All
              </Button>
            )}
          </div>

          {/* Active filter list */}
          {filteredFilters.length > 0 && (
            <div
              className="space-y-1"
              data-testid="filter-list"
            >
              {filteredFilters.map((f) => (
                <div
                  key={f.id}
                  data-testid={`filter-item-${f.id}`}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  {/* Toggle switch */}
                  <Switch
                    data-testid={`filter-toggle-${f.id}`}
                    checked={f.active}
                    onCheckedChange={(checked) =>
                      setFilterActive(f.id, checked)
                    }
                    className="shrink-0"
                  />

                  {/* Name + expression */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground leading-tight truncate">
                      {f.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      {f.expression}
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    data-testid={`filter-remove-${f.id}`}
                    type="button"
                    className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                    onClick={() => removeFilter(f.id)}
                    aria-label={`Remove filter: ${f.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {filteredFilters.length === 0 && filters.length > 0 && (
            <p
              className="text-xs text-muted-foreground text-center py-2"
              data-testid="filter-no-matches"
            >
              No filters match your search.
            </p>
          )}

          {/* Add Filter section */}
          <div
            className="rounded-md border border-dashed border-border bg-muted/30 p-2.5 space-y-2"
            data-testid="filter-add-form"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Plus className="size-3" />
              <span>Add Filter</span>
            </div>

            {hasColumns ? (
              // ── Column-based add flow ──
              <>
                {!showColumnPicker ? (
                  <Button
                    data-testid="filter-add-column-btn"
                    size="xs"
                    variant="outline"
                    onClick={() => setShowColumnPicker(true)}
                    className="w-full"
                  >
                    <Plus className="size-3" />
                    Choose a column to filter...
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Select
                      value={selectedColumn?.field ?? ""}
                      onValueChange={handleColumnSelect}
                    >
                      <SelectTrigger
                        data-testid="filter-column-picker"
                        className="w-full h-7 text-xs"
                      >
                        <SelectValue placeholder="Select a column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((col) => (
                          <SelectItem
                            key={col.field}
                            value={col.field}
                            data-testid={`filter-column-option-${col.field}`}
                          >
                            <span className="flex items-center gap-1.5">
                              {col.label}
                              <span className="text-[10px] text-muted-foreground">
                                {col.type === "text"
                                  ? "text"
                                  : col.type === "number"
                                    ? "num"
                                    : col.type === "date"
                                      ? "date"
                                      : col.type === "boolean"
                                        ? "bool"
                                        : "lookup"}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedColumn && (
                      <FilterControlFactory
                        column={selectedColumn}
                        onApply={handleColumnApply}
                        onCancel={handleColumnCancel}
                      />
                    )}
                  </div>
                )}
              </>
            ) : (
              // ── Legacy free-form add flow ──
              <>
                <div className="flex flex-col gap-1.5">
                  <Input
                    data-testid="filter-new-name"
                    className="h-7 text-xs"
                    placeholder="Filter name..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddFilter();
                    }}
                  />
                  <Input
                    data-testid="filter-new-expression"
                    className="h-7 text-xs font-mono"
                    placeholder="SQL expression (e.g., status = 'Active')"
                    value={newExpression}
                    onChange={(e) => setNewExpression(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddFilter();
                    }}
                  />
                </div>
                <Button
                  data-testid="filter-add-button"
                  size="xs"
                  variant="outline"
                  onClick={handleAddFilter}
                  disabled={!newName.trim() || !newExpression.trim()}
                  className="w-full"
                >
                  <Plus className="size-3" />
                  Add Filter
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}