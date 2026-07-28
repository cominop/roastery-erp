// HistoryPanel — slide-out panel showing audit log entries for a record
import { useState, useEffect, useCallback } from "react";
import { X, RotateCw, Clock, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import { getAuditLog, restoreAuditEntry } from "@/lib/api";
import type { AuditEntry } from "@/lib/api";
import AuditDiffView from "@/components/AuditDiffView";

interface Props {
  /** Table name for the current record */
  table: string | undefined;
  /** Primary key value of the current record */
  recordId: number | string | undefined | null;
  /** Whether the current record is a new (unsaved) record */
  isNew: boolean;
  /** Whether the panel is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────

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
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

// ─── Component ───────────────────────────────────────

export default function HistoryPanel({ table, recordId, isNew, open, onClose }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<{ entryId: string; message: string; error?: boolean } | null>(null);

  const fetchHistory = useCallback(async (pageNum: number) => {
    if (!table || recordId == null || isNew) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getAuditLog({
        table_name: table,
        record_id: typeof recordId === "string" ? Number(recordId) : recordId,
        page: pageNum,
        limit: 20,
      });
      setEntries(res.rows);
      setTotalPages(res.pages);
    } catch (e) {
      setError((e as Error).message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [table, recordId, isNew]);

  const handleRestore = async (entry: AuditEntry) => {
    if (!table || recordId == null) return;
    setRestoringId(entry.id);
    setRestoreMsg(null);
    try {
      const result = await restoreAuditEntry({
        table_name: table,
        record_id: typeof recordId === "string" ? Number(recordId) : recordId,
        timestamp: entry.changed_at,
      });
      setRestoreMsg({ entryId: entry.id, message: result.message });
      // Refresh history
      fetchHistory(page);
    } catch (e) {
      setRestoreMsg({ entryId: entry.id, message: (e as Error).message, error: true });
    } finally {
      setRestoringId(null);
    }
  };

  // Re-fetch when panel opens or record changes
  useEffect(() => {
    if (open && table && recordId != null && !isNew) {
      setPage(1);
      fetchHistory(1);
    } else if (open) {
      setEntries([]);
      setError(null);
    }
  }, [open, table, recordId, isNew, fetchHistory]);

  if (!open) return null;

  const canShow = table && recordId != null && !isNew;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-72 border-l bg-background shadow-lg z-20 flex flex-col text-xs overflow-hidden"
      style={{ minHeight: 0 }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Clock className="size-3" />
          <span>Record History</span>
        </div>
        <div className="flex items-center gap-1">
          {canShow && (
            <button
              type="button"
              onClick={() => fetchHistory(page)}
              disabled={loading}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-30"
              title="Refresh"
            >
              <RotateCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground/60 hover:text-muted-foreground"
            title="Close"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto">
        {!canShow && (
          <div className="flex items-center justify-center h-full text-muted-foreground/60 px-4 text-center">
            {isNew
              ? "Save this record to view history"
              : "No record selected"
            }
          </div>
        )}

        {loading && canShow && (
          <div className="flex items-center justify-center gap-1.5 py-12 text-muted-foreground/60">
            <RotateCw className="size-3 animate-spin" />
            <span>Loading...</span>
          </div>
        )}

        {error && canShow && !loading && (
          <div className="p-3 text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 m-2 rounded border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        {!loading && !error && canShow && entries.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground/60 px-4 text-center">
            No history entries found for this record
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="relative">
            {/* Timeline vertical line */}
            <div className="absolute left-5 top-1 bottom-1 w-px bg-border" />

            {entries.map((entry) => (
              <div key={entry.id} className="relative">
                <div
                  className="relative flex gap-2.5 px-2.5 py-2 cursor-pointer hover:bg-muted/20 rounded-sm"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  {/* Timeline dot */}
                  <div className="relative z-10 mt-0.5 flex items-center justify-center size-4 rounded-full bg-background border shrink-0">
                    {actionIcon(entry.action)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-medium leading-tight ${actionColor(entry.action)}`}>
                        {actionLabel(entry.action)}
                      </span>
                      <span className="text-muted-foreground/50 text-[10px]">
                        {formatTimestamp(entry.changed_at)}
                      </span>
                      {/* Expand indicator */}
                      {(entry.old_data || entry.new_data) && (
                        <span className="ml-auto text-muted-foreground/30">
                          {expandedId === entry.id
                            ? <ChevronDown className="size-3" />
                            : <ChevronRight className="size-3" />
                          }
                        </span>
                      )}
                    </div>

                    <div className="text-[10px] text-muted-foreground/80 leading-tight">
                      {entry.changed_by_name && (
                        <span className="font-medium text-muted-foreground">
                          {entry.changed_by_name}
                        </span>
                      )}
                    </div>

                    {entry.action === "UPDATE" && entry.old_data && entry.new_data && (
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5 truncate" title={changedFieldSummary(entry)}>
                        {changedFieldSummary(entry)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded diff */}
                {expandedId === entry.id && (entry.old_data || entry.new_data) && (
                  <div className="ml-9 pb-2 pr-2.5 pl-0.5 space-y-1.5">
                    <AuditDiffView entry={entry} compact />

                    {/* Restore message */}
                    {restoreMsg && restoreMsg.entryId === entry.id && (
                      <div className={`text-[10px] px-1.5 py-1 rounded ${
                        restoreMsg.error
                          ? "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-900"
                          : "text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 border border-green-200 dark:border-green-900"
                      }`}>
                        {restoreMsg.error ? "❌ " : "✅ "}{restoreMsg.message}
                      </div>
                    )}

                    {/* Restore button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestore(entry);
                      }}
                      disabled={restoringId === entry.id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                      title="Restore record to this point in time"
                    >
                      {restoringId === entry.id ? (
                        <RotateCw className="size-2.5 animate-spin" />
                      ) : (
                        <Undo2 className="size-2.5" />
                      )}
                      Restore to this point
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-between px-2.5 py-1.5 border-t bg-muted/20 shrink-0 text-[10px] text-muted-foreground/60">
          <button
            type="button"
            onClick={() => {
              const prev = page - 1;
              setPage(prev);
              fetchHistory(prev);
            }}
            disabled={page <= 1}
            className="px-1 py-0.5 rounded hover:bg-muted disabled:opacity-30"
          >
            ← Prev
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            type="button"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              fetchHistory(next);
            }}
            disabled={page >= totalPages}
            className="px-1 py-0.5 rounded hover:bg-muted disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}