// useFilterUrlSync — URL persistence for filter state
// Encodes/decodes FilterItem[] state and filter logic in the URL query string
// via the `filters` and `filterLogic` params.
// Uses history.replaceState so each filter change updates the URL without adding
// browser history entries.
import { useEffect, useRef } from "react";
import type { FilterItem, FilterLogic } from "../hooks/useFilters";

const FILTERS_PARAM = "filters";
const LOGIC_PARAM = "filterLogic";

// ─── Serialization ────────────────────────────────────

/**
 * Compact serialization format for URL query params.
 * Uses short keys (n, e, a) to keep URLs manageable.
 */
interface UrlFilter {
  n: string; // name
  e: string; // expression
  a: boolean; // active
}

/**
 * Serialize FilterItem[] to a compact JSON string for the URL.
 */
export function serializeFilters(filters: FilterItem[]): string {
  return JSON.stringify(
    filters.map(
      (f): UrlFilter => ({ n: f.name, e: f.expression, a: f.active })
    )
  );
}

/**
 * Deserialize URL-stored filter data back to FilterItem[].
 * Generates temporary stable ids (url_filter_0, url_filter_1, ...).
 * Returns empty array on parse failure.
 */
export function deserializeFilters(raw: string): FilterItem[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: UrlFilter, i: number) => ({
      id: `url_filter_${i}`,
      name: typeof item.n === "string" ? item.n : "",
      expression: typeof item.e === "string" ? item.e : "",
      active: typeof item.a === "boolean" ? item.a : true,
    }));
  } catch {
    return [];
  }
}

/**
 * Read filter logic from the URL query string.
 * Returns 'AND' when not present or invalid.
 */
export function readLogicFromUrl(): FilterLogic {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(LOGIC_PARAM);
  if (raw === "OR") return "OR";
  return "AND";
}

/**
 * Write filter logic to the URL query string using replaceState.
 * Removes the param entirely when logic is 'AND' (the default).
 */
export function writeLogicToUrl(logic: FilterLogic): void {
  const url = new URL(window.location.href);
  if (logic === "AND") {
    url.searchParams.delete(LOGIC_PARAM);
  } else {
    url.searchParams.set(LOGIC_PARAM, logic);
  }
  window.history.replaceState(null, "", url.toString());
}

// ─── URL helpers ───────────────────────────────────────

/**
 * Read filter state from the current URL query string.
 * Returns empty array when no `filters` param is present.
 */
export function readFiltersFromUrl(): FilterItem[] {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(FILTERS_PARAM);
  if (!raw) return [];
  return deserializeFilters(raw);
}

/**
 * Write filter state to the current URL query string using replaceState.
 * Removes the param entirely when filters are empty.
 */
export function writeFiltersToUrl(filters: FilterItem[]): void {
  const url = new URL(window.location.href);
  if (filters.length === 0) {
    url.searchParams.delete(FILTERS_PARAM);
  } else {
    url.searchParams.set(FILTERS_PARAM, serializeFilters(filters));
  }
  window.history.replaceState(null, "", url.toString());
}

// ─── Hook ──────────────────────────────────────────────

/**
 * Hook that synchronises filter state to/from the URL query string.
 *
 * On mount, reads the `filters` query param and restores filter state
 * via `setFilters`, and reads the `filterLogic` param to restore the
 * filter combination logic.
 * On every filter change, updates the URL via `history.replaceState`
 * so the filter state is shareable/bookmarkable.
 *
 * The hook gracefully handles cycles: it only writes to the URL when
 * the serialized state actually differs from what was last written.
 *
 * @param filters  - Current filter items from useFilters
 * @param setFilters - The bulk-set callback from useFilters
 * @param filterLogic - Current filter logic from useFilters
 * @param setFilterLogic - The setter for filter logic from useFilters
 * @param options.enabled - Whether URL sync is active (default: true).
 *                          Disable for subforms or embedded views where
 *                          URL persistence would be misleading.
 */
export function useFilterUrlSync(
  filters: FilterItem[],
  setFilters: (items: FilterItem[]) => void,
  filterLogic: FilterLogic,
  setFilterLogic: (logic: FilterLogic) => void,
  options?: { enabled?: boolean }
): void {
  const enabled = options?.enabled ?? true;

  // Whether the initial restore-from-URL has been performed
  const initialRestoreDone = useRef(false);

  // Last serialized state we wrote to the URL — guards against loops
  // when the URL triggers a popstate/replaceState that feeds back into state.
  const lastWrittenRef = useRef("");
  const lastLogicRef = useRef<FilterLogic>("AND");

  useEffect(() => {
    if (!enabled) return;

    // ── First run: restore filters and logic from URL ──
    if (!initialRestoreDone.current) {
      initialRestoreDone.current = true;
      const restored = readFiltersFromUrl();
      if (restored.length > 0) {
        setFilters(restored);
      }
      // Restore logic
      const restoredLogic = readLogicFromUrl();
      if (restoredLogic !== "AND") {
        setFilterLogic(restoredLogic);
      }
      // Record what we just read so the sync branch doesn't re-write it
      lastWrittenRef.current = serializeFilters(restored);
      lastLogicRef.current = restoredLogic;
      return;
    }

    // ── Subsequent runs: sync to URL ──
    const serialized = serializeFilters(filters);
    const changed = serialized !== lastWrittenRef.current;
    const logicChanged = filterLogic !== lastLogicRef.current;
    if (!changed && !logicChanged) return;
    lastWrittenRef.current = serialized;
    lastLogicRef.current = filterLogic;
    writeFiltersToUrl(filters);
    writeLogicToUrl(filterLogic);
  }, [enabled, filters, setFilters, filterLogic, setFilterLogic]);
}