// LookupBrowser — modal "browse" dialog for LOOKUP fields
// Shows a searchable table of records from the referenced table
import { useState, useEffect, useCallback, useRef } from 'react';
import { runLookup } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Loader2, Search, X } from 'lucide-react';
import type { LookupResult } from './hooks/useLookupSearch';

interface LookupBrowserProps {
  lookupItem: string;
  displayFields: string[];
  onSelect: (result: LookupResult) => void;
  onClose: () => void;
}

const EMPTY_RESULTS: LookupResult[] = [];

export default function LookupBrowser({
  lookupItem,
  displayFields,
  onSelect,
  onClose,
}: LookupBrowserProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<LookupResult[]>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchIssued, setSearchIssued] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectButtonRef = useRef<HTMLButtonElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Debounced search (300ms)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (searchTerm.length < 2) {
      setResults(EMPTY_RESULTS);
      setSelectedIndex(-1);
      setSearchIssued(false);
      return;
    }

    setSearchIssued(false);

    searchTimerRef.current = setTimeout(async () => {
      const fields = displayFields;
      setLoading(true);
      setError(null);
      setSelectedIndex(-1);
      setSearchIssued(true);

      const escapedTerm = searchTerm.replace(/'/g, "''");
      const orClauses = fields
        .map(f => `${f}::text ILIKE '%${escapedTerm}%'`)
        .join(' OR ');
      const selectFields = ['id', ...fields];
      const sql = `SELECT ${selectFields.join(', ')} FROM ${lookupItem} WHERE ${orClauses} LIMIT 50`;

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
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Search failed',
        );
        setResults(EMPTY_RESULTS);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchTerm, lookupItem, displayFields]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        modalRef.current &&
        !modalRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev < results.length - 1 ? prev + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : results.length - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            onSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, onSelect, onClose],
  );

  // Select button click
  const handleSelectClick = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      onSelect(results[selectedIndex]);
    }
  }, [selectedIndex, results, onSelect]);

  const hasSelection =
    selectedIndex >= 0 && selectedIndex < results.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="lookup-browser-overlay"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-[640px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onKeyDown={handleKeyDown}
        data-testid="lookup-browser-modal"
      >
        {/* ── Header ──────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">
            Browse {lookupItem}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Search bar ──────────────────────────────── */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              data-testid="lookup-browser-search"
            />
          </div>
        </div>

        {/* ── Results table ───────────────────────────── */}
        <div className="flex-1 overflow-auto min-h-0">
          {/* Loading spinner */}
          {loading && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gray-500">
              <Loader2
                className="h-5 w-5 animate-spin"
                data-testid="loading-spinner"
              />
              Searching...
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="px-4 py-8 text-sm text-red-500 text-center">
              {error}
            </div>
          )}

          {/* Empty results */}
          {!loading && !error && searchIssued && results.length === 0 && (
            <div className="px-4 py-8 text-sm text-gray-500 text-center">
              No results found
            </div>
          )}

          {/* Results table */}
          {!loading && !error && results.length > 0 && (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  {displayFields.map(field => (
                    <th
                      key={field}
                      className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200"
                    >
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((result, idx) => (
                  <tr
                    key={result.id}
                    className={cn(
                      'cursor-pointer transition-colors',
                      idx === selectedIndex
                        ? 'bg-blue-100'
                        : 'hover:bg-gray-50',
                    )}
                    onClick={() => {
                      setSelectedIndex(idx);
                    }}
                    onDoubleClick={() => onSelect(result)}
                    data-testid={`lookup-row-${idx}`}
                    data-selected={idx === selectedIndex}
                  >
                    {displayFields.map(field => (
                      <td
                        key={field}
                        className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100"
                      >
                        {String(result.raw[field] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Initial prompt (no search yet) */}
          {!loading && !error && !searchIssued && results.length === 0 && (
            <div className="px-4 py-8 text-sm text-gray-400 text-center">
              Type at least 2 characters to search
            </div>
          )}
        </div>

        {/* ── Footer actions ──────────────────────────── */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            data-testid="lookup-browser-cancel"
          >
            Cancel
          </button>
          <button
            ref={selectButtonRef}
            type="button"
            disabled={!hasSelection}
            onClick={handleSelectClick}
            className={cn(
              'px-4 py-1.5 text-sm rounded-md transition-colors',
              hasSelection
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            )}
            data-testid="lookup-browser-select"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}