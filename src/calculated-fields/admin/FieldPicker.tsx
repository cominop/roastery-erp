/**
 * FieldPicker — shows fields from a selected table that can be clicked to
 * insert a field reference into the expression.
 *
 * Fetches column metadata from /api/schema/:table.
 */

import { useEffect, useState, useCallback } from "react";
import { Search, Table2, Columns, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

interface FieldPickerProps {
  /** Current table name */
  tableName: string;
  /** Available table names for switching */
  tables: string[];
  onTableChange: (table: string) => void;
  /** Called when user clicks a field to insert */
  onInsertField: (ref: string) => void;
  /** Called when user clicks a table-qualified field */
  onInsertTableField: (table: string, field: string) => void;
}

// ─── PostgreSQL type → displayable category ────────────

function typeCategory(type: string): string {
  const lower = type.toLowerCase();
  if (lower.includes("int") || lower.includes("numeric") || lower.includes("float") || lower.includes("double") || lower.includes("decimal") || lower.includes("serial") || lower.includes("money") || lower.includes("real")) return "number";
  if (lower.includes("char") || lower.includes("text") || lower.includes("varchar")) return "text";
  if (lower.includes("timestamp") || lower.includes("date") || lower.includes("time")) return "date";
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

// ─── Component ─────────────────────────────────────────

export default function FieldPicker({
  tableName,
  tables,
  onTableChange,
  onInsertField,
  onInsertTableField,
}: FieldPickerProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!tableName) {
      setColumns([]);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`/api/schema/${encodeURIComponent(tableName)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load schema`);
        return r.json();
      })
      .then((data: ColumnInfo[]) => {
        setColumns(data);
      })
      .catch((err: Error) => {
        setError(err.message);
        setColumns([]);
      })
      .finally(() => setLoading(false));
  }, [tableName]);

  const filtered = search
    ? columns.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : columns;

  const handleFieldClick = useCallback(
    (col: ColumnInfo) => {
      // Insert as {field_name}
      onInsertField(`{${col.name}}`);
    },
    [onInsertField],
  );

  const handleTableQualifiedClick = useCallback(
    (col: ColumnInfo) => {
      onInsertTableField(tableName, col.name);
    },
    [tableName, onInsertTableField],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground mb-1.5">
          <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
          Fields
        </div>

        {/* Table selector */}
        {tables.length > 0 && (
          <select
            value={tableName}
            onChange={(e) => onTableChange(e.target.value)}
            className="w-full h-7 text-xs border rounded px-2 bg-background mb-1.5"
          >
            <option value="">-- Select table --</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter fields..."
            className="w-full h-7 pl-6 pr-2 text-xs border rounded bg-background outline-none focus-visible:border-ring"
          />
        </div>
      </div>

      {/* Column list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-xs">Loading fields...</span>
          </div>
        )}

        {error && (
          <div className="px-3 py-4 text-xs text-destructive">{error}</div>
        )}

        {!loading && !error && tableName && filtered.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            {search
              ? "No fields match your filter"
              : "No columns found for this table"}
          </div>
        )}

        {!loading &&
          !error &&
          filtered.map((col) => {
            const cat = typeCategory(col.type);
            return (
              <div
                key={col.name}
                className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
              >
                {/* Field name — click to insert */}
                <button
                  onClick={() => handleFieldClick(col)}
                  className="flex-1 text-left text-xs font-mono truncate"
                  title={`Insert {${col.name}}`}
                >
                  {col.name}
                </button>

                {/* Type badge */}
                <span
                  className={cn(
                    "text-[10px] font-medium shrink-0",
                    CATEGORY_COLORS[cat],
                  )}
                >
                  {cat}
                </span>

                {/* Table-qualified insert (on hover) */}
                <button
                  onClick={() => handleTableQualifiedClick(col)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-foreground transition-opacity shrink-0"
                  title={`Insert {${tableName}.${col.name}}`}
                >
                  <Columns className="h-3 w-3" />
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}
