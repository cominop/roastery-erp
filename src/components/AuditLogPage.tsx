// AuditLogPage — full-page audit log viewer with filters (table, action, user, date range)
import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Plus,
  Pencil,
  Trash2,
  RotateCw,
  Search,
  X,
  Filter,
  List,
} from "lucide-react";
import { getAuditLog } from "@/lib/api";
import type { AuditEntry } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Helpers (shared with HistoryPanel) ─────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionIcon(action: string) {
  switch (action) {
    case "INSERT": return <Plus className="size-3 text-green-600" />;
    case "UPDATE": return <Pencil className="size-3 text-amber-600" />;
    case "DELETE": return <Trash2 className="size-3 text-red-600" />;
    default: return <Clock className="size-3 text-muted-foreground" />;
  }
}

function actionLabel(action: string) {
  switch (action) {
    case "INSERT": return "Created";
    case "UPDATE": return "Edited";
    case "DELETE": return "Deleted";
    default: return action;
  }
}

function actionColor(action: string) {
  switch (action) {
    case "INSERT": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "UPDATE": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "DELETE": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function changedFieldSummary(entry: AuditEntry): string {
  if (!entry.old_data || !entry.new_data) return "";
  const oldKeys = Object.keys(entry.old_data);
  const newKeys = Object.keys(entry.new_data);
  const allKeys = new Set([...oldKeys, ...newKeys]);
  const changed: string[] = [];
  for (const key of allKeys) {
    const ov = entry.old_data[key];
    const nv = entry.new_data[key];
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      changed.push(key);
    }
  }
  if (changed.length === 0) return "No field changes";
  if (changed.length <= 3) return changed.join(", ");
  return `${changed.slice(0, 3).join(", ")} +${changed.length - 3} more`;
}

// ─── Filter state ──────────────────────────────────────

interface AuditFilters {
  table_name: string;
  action: string;
  changed_by: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: AuditFilters = {
  table_name: "",
  action: "",
  changed_by: "",
  from: "",
  to: "",
};

function hasAnyFilter(f: AuditFilters): boolean {
  return !!(f.table_name || f.action || f.changed_by || f.from || f.to);
}

// ─── Component ─────────────────────────────────────────

interface Props {
  /** List of available table names for the table filter dropdown */
  tables: string[];
}

export default function AuditLogPage({ tables }: Props) {
  const [filters, setFilters] = useState<AuditFilters>({ ...EMPTY_FILTERS });
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(50);

  const fetchEntries = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAuditLog({
        table_name: filters.table_name || undefined,
        action: filters.action || undefined,
        changed_by: filters.changed_by || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        page: pageNum,
        limit: pageSize,
      });
      setEntries(res.rows);
      setTotal(res.total);
      setTotalPages(res.pages);
    } catch (e) {
      setError((e as Error).message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filters, pageSize]);

  // Fetch on mount and when filters change
  useEffect(() => {
    setPage(1);
    fetchEntries(1);
  }, [filters, fetchEntries]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchEntries(newPage);
  };

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
  };

  const updateFilter = (key: keyof AuditFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const hasFilters = hasAnyFilter(filters);

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="px-4 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <List className="size-4" />
          <span>Audit Log</span>
          {total > 0 && !loading && (
            <span className="text-xs text-muted-foreground font-normal">
              ({total.toLocaleString()} entries{hasFilters ? ", filtered" : ""})
            </span>
          )}
        </div>
      </div>

      {/* ─── Filter bar ──────────────────────────────── */}
      <div className="px-4 py-2 border-b bg-background shrink-0">
        <div className="flex flex-wrap items-end gap-2">
          {/* Table filter */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground font-medium">Table</label>
            <Select
              value={filters.table_name}
              onValueChange={(v) => updateFilter("table_name", v)}
            >
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue placeholder="All tables" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All tables</SelectItem>
                {tables.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action filter */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground font-medium">Action</label>
            <Select
              value={filters.action}
              onValueChange={(v) => updateFilter("action", v)}
            >
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All actions</SelectItem>
                <SelectItem value="INSERT">INSERT</SelectItem>
                <SelectItem value="UPDATE">UPDATE</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User filter */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground font-medium">User</label>
            <div className="relative">
              <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50 pointer-events-none" />
              <Input
                placeholder="User name or ID..."
                value={filters.changed_by}
                onChange={(e) => updateFilter("changed_by", e.target.value)}
                className="h-7 w-40 pl-6 text-xs"
              />
            </div>
          </div>

          {/* Date range: From */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground font-medium">From</label>
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => updateFilter("from", e.target.value)}
              className="h-7 w-36 text-xs"
            />
          </div>

          {/* Date range: To */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-muted-foreground font-medium">To</label>
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => updateFilter("to", e.target.value)}
              className="h-7 w-36 text-xs"
            />
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-7 text-xs gap-1"
            >
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ─── Error state ─────────────────────────────── */}
      {error && (
        <div className="mx-4 mt-2 p-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 rounded border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}

      {/* ─── Loading indicator ──────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center gap-1.5 py-12 text-muted-foreground/60 text-xs">
          <RotateCw className="size-3 animate-spin" />
          <span>Loading...</span>
        </div>
      )}

      {/* ─── Empty state ──────────────────────────────── */}
      {!loading && !error && entries.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground/60 text-sm px-4 text-center">
          <div className="space-y-1">
            <p className="text-lg">🔍</p>
            <p>No audit entries found</p>
            {hasFilters && (
              <p className="text-xs text-muted-foreground/40">
                Try adjusting your filters
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Results table ────────────────────────────── */}
      {!loading && !error && entries.length > 0 && (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground w-28">Timestamp</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground">Action</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground">Table</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground">Record</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground">User</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase text-muted-foreground">Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(entry.changed_at)}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight ${actionColor(entry.action)}`}>
                      {actionIcon(entry.action)}
                      {actionLabel(entry.action)}
                    </span>
                  </TableCell>
                  <TableCell className="text-[11px] font-mono">
                    {entry.table_name}
                  </TableCell>
                  <TableCell className="text-[11px] tabular-nums">
                    {entry.record_id}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {entry.changed_by_name || (
                      <span className="italic text-muted-foreground/50">
                        {entry.changed_by != null ? `#${entry.changed_by}` : "System"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground max-w-[300px] truncate" title={entry.action === "UPDATE" ? changedFieldSummary(entry) : ""}>
                    {entry.action === "UPDATE" ? changedFieldSummary(entry) : (
                      entry.action === "INSERT" ? "Record created" : "Record deleted"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Pagination ──────────────────────────────── */}
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t bg-muted/20 shrink-0 text-[11px] text-muted-foreground">
          <span>
            Page {page} of {totalPages} ({total.toLocaleString()} entries)
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="h-6 text-xs px-2"
            >
              ← Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-6 text-xs px-2"
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}