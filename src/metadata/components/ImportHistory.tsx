// ImportHistory — displays a log of past metadata imports
// Step 89: Metadata Deployment 10 — Import history log
import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  RotateCcw,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  FileKey,
  List,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

export interface ImportRecord {
  id: string;
  filename: string;
  checksum: string;
  imported_by: string | null;
  imported_at: string;
  status: "pending" | "importing" | "completed" | "failed" | "rolled_back";
  backup_path: string | null;
  rollback_at: string | null;
  error_log: string | null;
  import_log: string | null;
}

// ─── Helpers ────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateChecksum(checksum: string): string {
  if (!checksum) return "—";
  const hex = checksum.replace(/^sha256:/, "");
  if (hex.length <= 16) return checksum;
  return `sha256:${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

function statusBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    completed: {
      label: "Completed",
      className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
    failed: {
      label: "Failed",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    },
    pending: {
      label: "Pending",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    importing: {
      label: "Importing",
      className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    },
    rolled_back: {
      label: "Rolled Back",
      className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    },
  };
  const c = config[status] || {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
        c.className
      )}
    >
      {c.label}
    </span>
  );
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-600" />;
    case "rolled_back":
      return <RotateCcw className="h-3.5 w-3.5 text-orange-600" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// ─── Detail Modal ───────────────────────────────────────

function ImportDetailModal({
  record,
  onClose,
}: {
  record: ImportRecord | null;
  onClose: () => void;
}) {
  if (!record) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Import detail"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-background border rounded-lg shadow-2xl flex flex-col w-[600px] max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-semibold">Import Details</span>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3 overflow-y-auto">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Filename:</span>
              <span className="font-mono">{record.filename}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span>{statusBadge(record.status)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Imported At:</span>
              <span>{formatDate(record.imported_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Checksum:</span>
              <span className="font-mono text-[10px]">
                {truncateChecksum(record.checksum)}
              </span>
            </div>
            {record.backup_path && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Backup:</span>
                <span className="font-mono text-[10px]">{record.backup_path}</span>
              </div>
            )}
            {record.rollback_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rolled Back At:</span>
                <span>{formatDate(record.rollback_at)}</span>
              </div>
            )}
          </div>

          {record.import_log && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Import Log</p>
              <pre className="rounded-lg border bg-black/5 dark:bg-white/5 p-3 text-[10px] font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">
                {record.import_log}
              </pre>
            </div>
          )}

          {record.error_log && (
            <div>
              <p className="text-xs font-medium text-destructive mb-1">Error Log</p>
              <pre className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-3 text-[10px] font-mono overflow-x-auto max-h-48 whitespace-pre-wrap text-red-800 dark:text-red-300">
                {record.error_log}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────

export default function ImportHistory() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<ImportRecord | null>(null);

  // Fetch imports
  const fetchImports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/metadata/imports?limit=50");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: ImportRecord[] = await res.json();
      setImports(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load import history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  // ── Loading state ─────────────────────────────────

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Loading import history...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error state ──────────────────────────────────

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Failed to load import history</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchImports}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Empty state ──────────────────────────────────

  if (imports.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <Download className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No imports yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Import metadata to see the history here
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Render ───────────────────────────────────────

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Import History</CardTitle>
              <CardDescription>
                {imports.length} import{imports.length !== 1 ? "s" : ""} recorded
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchImports}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Filename</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium hidden md:table-cell">Checksum</th>
                  <th className="pb-2 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-muted/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{formatDate(record.imported_at)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-mono text-[11px] truncate max-w-[200px] inline-block">
                          {record.filename}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        {statusIcon(record.status)}
                        {statusBadge(record.status)}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        <FileKey className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {truncateChecksum(record.checksum)}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailRecord(record)}
                        className="h-7 text-[11px]"
                      >
                        <List className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail modal */}
      <ImportDetailModal
        record={detailRecord}
        onClose={() => setDetailRecord(null)}
      />
    </>
  );
}