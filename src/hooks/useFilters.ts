// useFilters — filter state management hook
// Manages a collection of named filters with active toggles,
// composing them into a single SQL WHERE clause string.
import { useState, useCallback, useMemo } from "react";

let nextId = 1;
function generateId(): string {
  return `filter_${nextId++}`;
}

export type FilterLogic = "AND" | "OR";

export interface FilterItem {
  id: string;
  name: string;
  expression: string;
  active: boolean;
}

export interface UseFiltersOptions {
  /** Base filter string from the form definition (always applied, not toggleable) */
  baseFilter?: string;
  /** Initial filter logic (default: 'AND') */
  filterLogic?: FilterLogic;
}

export interface UseFiltersReturn {
  /** All registered filters */
  filters: FilterItem[];
  /** Only the active (enabled) filters */
  activeFilters: FilterItem[];
  /** Combined SQL WHERE clause from all active filters + baseFilter, or undefined if none */
  combinedFilter: string | undefined;
  /** Whether any user-defined filter is active (excludes baseFilter) */
  hasActiveFilters: boolean;
  /** Current filter combination logic: AND or OR */
  filterLogic: FilterLogic;
  /** Change the filter combination logic */
  setFilterLogic: (logic: FilterLogic) => void;
  /** Add a new named filter. Returns the generated id. */
  addFilter: (name: string, expression: string) => string;
  /** Remove a filter by id */
  removeFilter: (id: string) => void;
  /** Toggle a filter's active state */
  toggleFilter: (id: string) => void;
  /** Set a filter's active state explicitly */
  setFilterActive: (id: string, active: boolean) => void;
  /** Remove all user-defined filters */
  clearFilters: () => void;
  /** Update a filter's name and/or expression */
  updateFilter: (id: string, updates: Partial<Pick<FilterItem, "name" | "expression">>) => void;
  /** Replace all filters (bulk set) */
  setFilters: (items: FilterItem[]) => void;
}

/**
 * Hook that manages a collection of named filters, each with an active toggle.
 * Combines active filters + optional baseFilter into a single AND'd SQL WHERE clause.
 *
 * @param options - Optional base filter (always applied, not toggleable)
 */
export function useFilters(options?: UseFiltersOptions): UseFiltersReturn {
  const [filters, setFiltersState] = useState<FilterItem[]>([]);
  const [filterLogic, setFilterLogic] = useState<FilterLogic>(
    options?.filterLogic ?? "AND"
  );

  const addFilter = useCallback((name: string, expression: string): string => {
    const id = generateId();
    setFiltersState((prev) => [...prev, { id, name, expression, active: true }]);
    return id;
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFiltersState((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const toggleFilter = useCallback((id: string) => {
    setFiltersState((prev) =>
      prev.map((f) => (f.id === id ? { ...f, active: !f.active } : f))
    );
  }, []);

  const setFilterActive = useCallback((id: string, active: boolean) => {
    setFiltersState((prev) =>
      prev.map((f) => (f.id === id ? { ...f, active } : f))
    );
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState([]);
  }, []);

  const updateFilter = useCallback(
    (id: string, updates: Partial<Pick<FilterItem, "name" | "expression">>) => {
      setFiltersState((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
      );
    },
    []
  );

  const setFilters = useCallback((items: FilterItem[]) => {
    setFiltersState(items);
  }, []);

  const activeFilters = useMemo(
    () => filters.filter((f) => f.active),
    [filters]
  );

  const hasActiveFilters = useMemo(
    () => activeFilters.length > 0,
    [activeFilters]
  );

  const combinedFilter = useMemo(() => {
    const parts: string[] = [];

    // Base filter is always included (not user-toggleable)
    if (options?.baseFilter) {
      parts.push(options.baseFilter);
    }

    // Collect active user-defined filter expressions
    const userParts: string[] = [];
    for (const f of activeFilters) {
      if (f.expression) {
        userParts.push(f.expression);
      }
    }

    if (userParts.length === 0) {
      return parts.length > 0 ? parts.join(" AND ") : undefined;
    }

    // If filterLogic is OR and there are multiple user filters, wrap in parens
    const userClause =
      filterLogic === "OR" && userParts.length > 1
        ? `(${userParts.join(" OR ")})`
        : userParts.join(` ${filterLogic} `);

    if (parts.length === 0) return userClause;
    return `${parts.join(" AND ")} AND ${userClause}`;
  }, [options?.baseFilter, activeFilters, filterLogic]);

  return {
    filters,
    activeFilters,
    combinedFilter,
    hasActiveFilters,
    filterLogic,
    setFilterLogic,
    addFilter,
    removeFilter,
    toggleFilter,
    setFilterActive,
    clearFilters,
    updateFilter,
    setFilters,
  };
}