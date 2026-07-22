// useFilters — filter state management hook
// Manages a collection of named filters with active toggles,
// composing them into a single SQL WHERE clause string.
import { useState, useCallback, useMemo } from "react";

let nextId = 1;
function generateId(): string {
  return `filter_${nextId++}`;
}

export interface FilterItem {
  id: string;
  name: string;
  expression: string;
  active: boolean;
}

export interface UseFiltersOptions {
  /** Base filter string from the form definition (always applied, not toggleable) */
  baseFilter?: string;
}

export interface UseFiltersReturn {
  /** All registered filters */
  filters: FilterItem[];
  /** Only the active (enabled) filters */
  activeFilters: FilterItem[];
  /** Combined SQL WHERE clause from all active filters + baseFilter (AND'd together), or undefined if none */
  combinedFilter: string | undefined;
  /** Whether any user-defined filter is active (excludes baseFilter) */
  hasActiveFilters: boolean;
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

    // Add all active user-defined filter expressions
    for (const f of activeFilters) {
      if (f.expression) {
        parts.push(f.expression);
      }
    }

    return parts.length > 0 ? parts.join(" AND ") : undefined;
  }, [options?.baseFilter, activeFilters]);

  return {
    filters,
    activeFilters,
    combinedFilter,
    hasActiveFilters,
    addFilter,
    removeFilter,
    toggleFilter,
    setFilterActive,
    clearFilters,
    updateFilter,
    setFilters,
  };
}