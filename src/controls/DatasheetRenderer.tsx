// DatasheetRenderer — generic datasheet/subform grid component
// Renders any form with default-view: "Datasheet" as an interactive data grid
// Supports sorting, pagination, row selection, and inline editing

import { useState, useEffect, useMemo, useCallback } from "react";
import * as api from "@/lib/api";
import { normalizeKeys, cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { FormDefinition, Control } from "@/types";
import { GRID_COLUMN_OVERRIDES } from "@/subforms/subform-metadata-overrides";

interface DatasheetRendererProps {
  formName: string;
  sourceForm?: string;
  recordSource?: string;
  filter?: string;
  linkChildFields?: string;
  linkMasterFields?: string;
  currentRecord?: Record<string, unknown>;
  onRowClick?: (record: Record<string, unknown>) => void;
  /** Default values for new child records — auto-populated link fields (spec §13) */
  newChildDefaults?: Record<string, unknown>;
}

const PAGE_SIZE = 50;

export default function DatasheetRenderer({
  formName,
  sourceForm,
  recordSource: rsOverride,
  filter: filterOverride,
  linkChildFields,
  linkMasterFields,
  currentRecord,
  onRowClick,
  newChildDefaults,
}: DatasheetRendererProps) {
  // Fetch the form definition
  const [definition, setDefinition] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getFormDefinition(formName)
      .then((raw) => normalizeKeys(raw) as FormDefinition)
      .then(setDefinition)
      .catch(() => setDefinition(null))
      .finally(() => setLoading(false));
  }, [formName]);

  // Derive table/query from record source
  const table = useMemo(() => {
    const rs = rsOverride || (definition as Record<string, unknown>)?.["record-source"] as string || (definition as Record<string, unknown>)?.["recordSource"] as string;
    if (!rs || typeof rs !== "string") return undefined;
    const rsTrimmed = rs.trim();
    const fromMatch = rsTrimmed.match(/FROM\s+"?(\w+)"?\b/i);
    if (fromMatch) return fromMatch[1].toLowerCase();
    const colMatch = rsTrimmed.match(/(\w+)\.\w+/i);
    if (colMatch) return colMatch[1].toLowerCase();
    return rsTrimmed.toLowerCase();
  }, [definition, rsOverride]);

  // Build effective filter from linkChildFields/linkMasterFields
  const effectiveFilter = useMemo(() => {
    const filters: string[] = [];
    if (filterOverride) filters.push(filterOverride);
    if (linkChildFields && linkMasterFields && currentRecord) {
      const childFields = linkChildFields.split(";").map(s => s.trim());
      const masterFields = linkMasterFields.split(";").map(s => s.trim());
      childFields.forEach((childField, i) => {
        const masterField = masterFields[i];
        if (masterField && currentRecord[masterField] != null) {
          filters.push(`${childField}=${currentRecord[masterField]}`);
        }
      });
    }
    return filters.join("%20AND%20") || undefined;
  }, [filterOverride, linkChildFields, linkMasterFields, currentRecord]);

  // Data fetching
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async (pg: number) => {
    if (!table) return;
    setDataLoading(true);
    setError(null);
    try {
      const orderBy = sortField ? `${sortField}%20${sortDir}` : undefined;
      const res = await api.getRecords(table, {
        page: pg,
        limit: PAGE_SIZE,
        filter: effectiveFilter,
        orderBy,
      });
      setRows(res.rows);
      setTotal(res.total);
      setPage(res.page);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setDataLoading(false);
    }
  }, [table, effectiveFilter, sortField, sortDir]);

  // Create new record with auto-populated link fields (spec §13)
  const handleCreateNew = useCallback(async () => {
    if (!table || !newChildDefaults || Object.keys(newChildDefaults).length === 0) return;
    setCreating(true);
    setError(null);
    try {
      await api.createRecord(table, newChildDefaults);
      // Refresh to show the new record
      await fetchData(1);
      // Go to the last page to see the new record
      const lastPage = Math.max(1, Math.ceil((total + 1) / PAGE_SIZE));
      await fetchData(lastPage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }, [table, newChildDefaults, fetchData, total]);

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  // Sort handler
  const handleSort = useCallback((field: string) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return field;
      }
      setSortDir("asc");
      return field;
    });
  }, []);

  // Determine columns from detail controls
  const columns = useMemo(() => {
    if (!definition?.detail?.controls) return [];
    return definition.detail.controls
      .filter((c) => {
        const type = c.type;
        // Skip labels, lines, rectangles, tab controls, pages
        if (type === "label" || type === "line" || type === "rectangle" || type === "tab-control" || type === "page") return false;
        // Skip hidden controls
        if (c.visible === false || c.visible === 0) return false;
        return true;
      })
      .map((c) => ({
        name: c.name as string,
        label: (c.caption || c.name) as string,
        type: c.type,
        width: c.width,
        controlSource: c["control-source"] as string | undefined,
      }));
  }, [definition]);

  // If no columns from controls, derive from data keys
  const displayColumns = useMemo(() => {
    // Check GRID_COLUMN_OVERRIDES first (spec §14 — Grid display mode)
    // This handles forms whose controls live in the header section
    const overrides = GRID_COLUMN_OVERRIDES[formName];
    if (overrides && overrides.length > 0) {
      return overrides.map((col) => ({
        name: col.field,
        label: col.label,
        type: "text-box" as const,
        width: col.width ?? 0,
        controlSource: col.field,
      }));
    }
    if (columns.length > 0) return columns;
    if (rows.length === 0) return [];
    return Object.keys(rows[0]).map((key) => ({
      name: key,
      label: key,
      type: "text-box" as const,
      width: 0,
      controlSource: key,
    }));
  }, [columns, rows, formName]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatValue = (val: unknown, columnName?: string): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (val instanceof Date) return val.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    // Detect ISO date strings like "2006-04-05T04:00:00.000Z"
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      }
    }

    // Detect phone numbers — raw 10+ digit strings in phone/fax columns
    if (typeof val === "string" && /^\d{10,}$/.test(val) && columnName && /phone|fax|tel/i.test(columnName)) {
      const cleaned = val.replace(/\D/g, "");
      if (cleaned.length === 10) {
        return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
      }
      if (cleaned.length === 11 && cleaned[0] === "1") {
        return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
      }
    }

    if (typeof val === "number") {
      // IDs and small integers — no comma formatting
      if (Number.isInteger(val) && (val < 1000 || val > 999999)) return String(val);
      // Currency — format with commas but no decimals if whole
      return Number(val.toFixed(2)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(val);
  };

  if (loading) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Loading datasheet...</div>;
  }

  if (!definition) {
    return <div className="p-4 text-center text-sm text-red-500">Form not found: {formName}</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1 border-b text-xs text-muted-foreground bg-muted/20">
        <span className="font-medium">{definition.caption || formName}</span>
        {newChildDefaults && Object.keys(newChildDefaults).length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-xs px-2"
            disabled={creating || dataLoading}
            onClick={handleCreateNew}
          >
            {creating ? "Creating..." : "+ New"}
          </Button>
        )}
        <span className="ml-auto">
          {total > 0 ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : "0 records"}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            disabled={page <= 1 || dataLoading}
            onClick={() => fetchData(page - 1)}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="tabular-nums min-w-[4ch] text-center">
            {page}/{totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            disabled={page >= totalPages || dataLoading}
            onClick={() => fetchData(page + 1)}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-2 text-xs text-red-500 bg-red-50 border-b">
          {error}
        </div>
      )}

      {/* Data grid */}
      <div className="flex-1 min-h-0 overflow-auto">
        {dataLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading data...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No records found</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                {displayColumns.map((col) => (
                  <TableHead
                    key={col.name}
                    className="text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:text-foreground"
                    style={{
                      minWidth: col.width ? Math.max(60, col.width / 15) : 80,
                    }}
                    onClick={() => handleSort(col.controlSource || col.name)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortField === (col.controlSource || col.name) && (
                        sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      )}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow
                  key={i}
                  data-selected={selectedIndex === i}
                  onClick={() => {
                    setSelectedIndex(i);
                    onRowClick?.(row);
                  }}
                  className={cn(
                    "cursor-pointer text-xs",
                    selectedIndex === i ? "bg-primary/10" : "hover:bg-muted/50"
                  )}
                >
                  {displayColumns.map((col) => (
                    <TableCell
                      key={col.name}
                      className="px-2 py-1 whitespace-nowrap border-b border-muted/30"
                    >
                      {formatValue(row[col.controlSource || col.name], col.controlSource || col.name)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </div>
    </div>
  );
}