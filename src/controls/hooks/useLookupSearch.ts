// useLookupSearch — debounced typeahead search hook for lookup fields
import { useState, useEffect, useCallback, useRef } from 'react';
import { runLookup } from '@/lib/api';

export interface LookupResult {
  id: string | number;
  displayValue: string;
  raw: Record<string, unknown>;
}

const EMPTY_RESULTS: LookupResult[] = [];

/**
 * Debounced typeahead search hook.
 * @param lookupItem  The database table name to search against.
 * @param displayFields  Column names whose values are concatenated to form the display string.
 *                       The first field is the primary display (lookupField from FieldDefinition),
 *                       followed by lookupField2, lookupField3, etc.
 */
export function useLookupSearch(
  lookupItem: string,
  displayFields: string[],
): {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  results: LookupResult[];
  loading: boolean;
  error: string | null;
  search: (term: string) => void;
} {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<LookupResult[]>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store displayFields in a ref to avoid infinite loops from new array refs on each render
  const displayFieldsRef = useRef(displayFields);
  displayFieldsRef.current = displayFields;

  const doSearch = useCallback(
    async (term: string) => {
      const fields = displayFieldsRef.current;
      if (term.length < 2 || fields.length === 0) {
        setResults(EMPTY_RESULTS);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);

      // Escape single quotes for safe SQL
      const escapedTerm = term.replace(/'/g, "''");
      const orClauses = fields
        .map(f => `${f}::text ILIKE '%${escapedTerm}%'`)
        .join(' OR ');
      const selectFields = ['id', ...fields];
      const sql = `SELECT ${selectFields.join(', ')} FROM ${lookupItem} WHERE ${orClauses} LIMIT 20`;

      try {
        const res = await runLookup(sql);
        const rows: LookupResult[] = res.rows.map(
          (row: Record<string, unknown>) => {
            const displayParts = fields
              .map(f => row[f])
              .filter((v): v is string | number => v != null && v !== '');
            return {
              id: row.id as string | number,
              displayValue: displayParts.join(' - '),
              raw: row,
            };
          },
        );
        setResults(rows);
        setLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Search failed',
        );
        setResults(EMPTY_RESULTS);
        setLoading(false);
      }
    },
    // lookupItem is a primitive string — stable reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookupItem],
  );

  // Debounced auto-search when searchTerm changes (via user typing)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // < 2 chars: don't search, but don't reset state either (avoids re-render loops)
    if (searchTerm.length < 2) return;
    timerRef.current = setTimeout(() => {
      doSearch(searchTerm);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [searchTerm, doSearch]);

  // Immediate search (skip debounce) — for programmatic / browser use
  const search = useCallback(
    (term: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setSearchTerm(term);
      doSearch(term);
    },
    [doSearch],
  );

  return {
    searchTerm,
    setSearchTerm,
    results,
    loading,
    error,
    search,
  };
}
