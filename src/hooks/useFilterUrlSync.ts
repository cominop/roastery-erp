// useFilterUrlSync — URL persistence for filter state
// Encodes/decodes FilterItem[] state in the URL query string via the `filters` param.
// Uses history.replaceState so each filter change updates the URL without adding
// browser history entries.
import { useEffect, useRef } from "react";
import type { FilterItem } from "./useFilters";

const FILTERS_PARAM = "filters";

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
 * via `setFilters`. On every filter change, updates the URL via
 * `history.replaceState` so the filter state is shareable/bookmarkable.
 *
 * The hook gracefully handles cycles: it only writes to the URL when
 * the serialized state actually differs from what was last written.
 *
 * @param filters  - Current filter items from useFilters
 * @param setFilters - The bulk-set callback from useFilters
 * @param options.enabled - Whether URL sync is active (default: true).
 *                          Disable for subforms or embedded views where
 *                          URL persistence would be misleading.
 */
export function useFilterUrlSync(
  filters: FilterItem[],
  setFilters: (items: FilterItem[]) => void,
  options?: { enabled?: boolean }
): void {
  const enabled = options?.enabled ?? true;

  // Whether the initial restore-from-URL has been performed
  const initialRestoreDone = useRef(false);

  // Last serialized state we wrote to the URL — guards against loops
  // when the URL triggers a popstate/replaceState that feeds back into state.
  const lastWrittenRef = useRef("");

  useEffect(() => {
    if (!enabled) return;

    // ── First run: restore filters from URL ──
    if (!initialRestoreDone.current) {
      initialRestoreDone.current = true;
      const restored = readFiltersFromUrl();
      if (restored.length > 0) {
        setFilters(restored);
      }
      // Record what we just read so the sync branch doesn't re-write it
      lastWrittenRef.current = serializeFilters(restored);
      return;
    }

    // ── Subsequent runs: sync to URL ──
    const serialized = serializeFilters(filters);
    if (serialized === lastWrittenRef.current) return;
    lastWrittenRef.current = serialized;
    writeFiltersToUrl(filters);
  }, [enabled, filters, setFilters]);
}