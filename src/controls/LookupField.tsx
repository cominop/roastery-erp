// LookupField — renders LOOKUP field type with typeahead debounced search
import { useState, useEffect, useRef, useCallback } from 'react';
import type { FieldDefinition, FormFieldProps } from './schema/controlSchema';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLookupSearch, type LookupResult } from './hooks/useLookupSearch';
import { runLookup } from '@/lib/api';
import { Loader2, Search } from 'lucide-react';

function getDisplayFields(field: FieldDefinition): string[] {
  return [field.lookupField, field.lookupField2, field.lookupField3].filter(
    (f): f is string => f != null && f !== '',
  );
}

export default function LookupField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
}: FormFieldProps) {
  const lookupItem = field.lookupItem ?? '';
  const displayFields = getDisplayFields(field);
  const isReadOnly = readOnly ?? field.readOnly ?? false;

  const { searchTerm, setSearchTerm, results, loading, error: searchError, search } =
    useLookupSearch(lookupItem, displayFields);

  // Resolved display text from the current ID value
  const [displayText, setDisplayText] = useState('');
  const [resolving, setResolving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevValue = useRef(value);

  // ── Resolve display value from ID on mount / value change ──────────
  useEffect(() => {
    if (prevValue.current === value && displayText) return;
    prevValue.current = value;

    if (value == null || value === '') {
      setDisplayText('');
      return;
    }

    async function resolveDisplay() {
      if (displayFields.length === 0) return;
      setResolving(true);
      try {
        const selectFields = ['id', ...displayFields];
        const sql = `SELECT ${selectFields.join(', ')} FROM ${lookupItem} WHERE id = ${typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value} LIMIT 1`;
        const res = await runLookup(sql);
        if (res.rows.length > 0) {
          const parts = displayFields
            .map(f => res.rows[0][f])
            .filter((v): v is string | number => v != null && v !== '');
          setDisplayText(parts.join(' - '));
        }
      } catch {
        // Silent — display stays empty
      } finally {
        setResolving(false);
      }
    }
    resolveDisplay();
    // Only run when value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, lookupItem]);

  // ── Sync searchTerm back to displayText while user is typing ──────
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) return;
      const term = e.target.value;
      setSearchTerm(term);
      setDisplayText(term); // show what the user typed
      if (term.length >= 2) {
        setDropdownOpen(true);
        setActiveIndex(-1);
      } else {
        setDropdownOpen(false);
      }
    },
    [isReadOnly, setSearchTerm],
  );

  // Open dropdown when results arrive
  useEffect(() => {
    if (results.length > 0 && searchTerm.length >= 2) {
      setDropdownOpen(true);
      setActiveIndex(-1);
    }
  }, [results, searchTerm]);

  // ── Select a result ──────────────────────────────────────────────
  const selectResult = useCallback(
    (result: LookupResult) => {
      setDisplayText(result.displayValue);
      setSearchTerm('');
      setDropdownOpen(false);
      onChange(result.id);
      inputRef.current?.focus();
    },
    [setSearchTerm, onChange],
  );

  // ── Keyboard navigation ──────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!dropdownOpen) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(prev =>
            prev < results.length - 1 ? prev + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(prev =>
            prev > 0 ? prev - 1 : results.length - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) {
            selectResult(results[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setDropdownOpen(false);
          break;
      }
    },
    [dropdownOpen, results, activeIndex, selectResult],
  );

  // ── Click outside to close ────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Focus input to reset display text (let user type fresh) ──────
  const handleFocus = useCallback(() => {
    if (!isReadOnly && value != null && value !== '') {
      setDisplayText('');
    }
  }, [isReadOnly, value]);

  // ── Blur: restore display value if search box is empty ────────────
  const handleBlur = useCallback(() => {
    // If user cleared the field and didn't select anything, restore
    if (displayText === '' && value != null && value !== '') {
      // re-trigger display resolution via value change detection
      prevValue.current = undefined; // force re-resolve
    }
  }, [displayText, value]);

  // ── Open browser modal (placeholder) ─────────────────────────────
  const openBrowser = useCallback(() => {
    // Placeholder: for now, just do a full search
    if (isReadOnly) return;
    search('');
  }, [isReadOnly, search]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={field.id}
        className="text-xs font-medium text-foreground"
      >
        {field.caption}
        {field.required && (
          <span className="text-destructive ml-0.5">*</span>
        )}
      </label>
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Input
            ref={inputRef}
            id={field.id}
            type="text"
            className={cn(
              'w-full text-xs rounded-[var(--app-field-border-radius,6px)] pr-8',
              field.alignment === 'center' && 'text-center',
              field.alignment === 'right' && 'text-right',
            )}
            value={
              resolving
                ? displayText
                : isReadOnly
                  ? displayText
                  : dropdownOpen && !resolving
                    ? displayText
                    : displayText
            }
            readOnly={isReadOnly}
            placeholder={
              isReadOnly
                ? displayText || ''
                : `Search ${lookupItem}...`
            }
            tabIndex={tabIndex ?? field.tabIndex}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
          {!isReadOnly && (
            <button
              type="button"
              className="absolute right-0 top-0 h-full px-2.5 flex items-center text-muted-foreground hover:text-foreground transition-colors"
              onClick={openBrowser}
              tabIndex={-1}
              aria-label="Search"
            >
              {resolving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Typeahead dropdown */}
        {dropdownOpen && !isReadOnly && (
          <div className="absolute top-full left-0 w-full bg-white border border-border rounded shadow-lg z-50 max-h-48 overflow-y-auto mt-0.5">
            {loading && results.length === 0 && (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching...
              </div>
            )}
            {searchError && (
              <div className="px-3 py-2 text-xs text-destructive">
                {searchError}
              </div>
            )}
            {!loading && !searchError && results.length === 0 && searchTerm.length >= 2 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No results found
              </div>
            )}
            {results.map((result, idx) => (
              <div
                key={result.id}
                className={cn(
                  'px-3 py-2 text-xs cursor-pointer transition-colors',
                  idx === activeIndex
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-gray-100',
                )}
                onMouseDown={() => selectResult(result)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                {result.displayValue}
              </div>
            ))}
          </div>
        )}
      </div>
      {field.help && !error && (
        <p className="text-[10px] text-muted-foreground">{field.help}</p>
      )}
      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}
