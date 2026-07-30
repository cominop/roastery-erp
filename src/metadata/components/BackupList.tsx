// BackupList — displays available metadata backups with rollback capability
// Step 86: Metadata Deployment 7 — Rollback from backup
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
  HardDrive,
  FileKey,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

export interface BackupRecord {
  id: string;
  path: string;
  created_at: string;
  reason: string | null;
  size_bytes: number | null;
  checksum: string | null;
}

interface BackupListProps {
  onRollbackComplete?: () => void;
}

// ─── Helpers ────────────────────────────────────────────

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

function truncateChecksum(checksum: string | null): string {
  if (!checksum) return "—";
  const hex = checksum.replace(/^sha256:/, "");
  if (hex.length <= 16) return checksum;
  return `sha256:${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

function reasonLabel(reason: string | null): string {
  switch (reason) {
    case "pre_import": return "Before Import";
    case "manual": return "Manual";
    case "scheduled": return "Scheduled";
    default: return reason || "—";
  }
}

// ─── Sub-components ─────────────────────────────────────

function ConfirmDialog({
  backup,
  onConfirm,
  onCancel,
}: {
  backup: BackupRecord | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!backup) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm rollback"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative bg-background border rounded-lg shadow-2xl flex flex-col w-[460px] max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="text-sm font-semibold">Rollback to Backup?</span>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            ⚠️ This will replace ALL current metadata with the state from this backup.
          </p>
          <p className="text-xs text-muted-foreground">
            Current metadata will be backed up automatically before the rollback.
          </p>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Backup ID:</span>
              <span className="font-mono">{backup.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created:</span>
              <span>{formatDate(backup.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Size:</span>
              <span>{formatSize(backup.size_bytes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reason:</span>
              <span>{reasonLabel(backup.reason)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>This action cannot be undone</strong> — the rollback itself
            will create a new backup of the current state.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Rollback
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProgressDialog({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Rollback in progress"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative bg-background border rounded-lg shadow-2xl flex flex-col w-[380px]">
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Rolling back metadata...</span>
          <span className="text-xs text-muted-foreground/60">This may take a minute</span>
        </div>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────

export default function BackupList({ onRollbackComplete }: BackupListProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rollback state
  const [rollbackTarget, setRollbackTarget] = useState<BackupRecord | null>(null);
  const [rollbackRunning, setRollbackRunning] = useState(false);
  const [rollbackResult, setRollbackResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Fetch backups
  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/metadata/backups?limit=50");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: BackupRecord[] = await res.json();
      setBackups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load backups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Rollback handler
  const handleRollback = useCallback(async () => {
    if (!rollbackTarget) return;

    setRollbackRunning(true);
    setRollbackResult(null);
    const target = rollbackTarget;
    setRollbackTarget(null);

    try {
      const res = await fetch(`/api/metadata/rollback/${target.id}`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setRollbackResult({ type: "success", message: "Rollback completed successfully. Metadata has been restored from the backup." });
        // Refresh the backup list
        fetchBackups();
        if (onRollbackComplete) onRollbackComplete();
      } else {
        setRollbackResult({ type: "error", message: data.error || "Rollback failed" });
      }
    } catch (err) {
      setRollbackResult({
        type: "error",
        message: err instanceof Error ? err.message : "Network error during rollback",
      });
    } finally {
      setRollbackRunning(false);
    }
  }, [rollbackTarget, fetchBackups, onRollbackComplete]);

  // ── Loading state ─────────────────────────────────

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Loading backups...</span>
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
              <p className="text-sm font-medium text-destructive">Failed to load backups</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchBackups}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Empty state ──────────────────────────────────

  if (backups.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <Archive className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No backups yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Create a backup first to see it here
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
              <CardTitle>Metadata Backups</CardTitle>
              <CardDescription>
                {backups.length} backup{backups.length !== 1 ? "s" : ""} available
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchBackups}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Rollback result banner */}
          {rollbackResult && (
            <div
              className={cn(
                "mb-4 flex items-start gap-3 rounded-lg border p-3 text-sm",
                rollbackResult.type === "success"
                  ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
              )}
            >
              {rollbackResult.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              )}
              <div className="flex-1">
                <p
                  className={cn(
                    "font-medium",
                    rollbackResult.type === "success"
                      ? "text-green-800 dark:text-green-300"
                      : "text-red-800 dark:text-red-300"
                  )}
                >
                  {rollbackResult.type === "success" ? "Rollback Successful" : "Rollback Failed"}
                </p>
                <p className="text-xs mt-0.5 text-muted-foreground">
                  {rollbackResult.message}
                </p>
              </div>
              <button
                onClick={() => setRollbackResult(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Backups table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Reason</th>
                  <th className="pb-2 pr-3 font-medium text-right">Size</th>
                  <th className="pb-2 pr-3 font-medium hidden md:table-cell">Checksum</th>
                  <th className="pb-2 pr-3 font-medium hidden md:table-cell">ID</th>
                  <th className="pb-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr
                    key={backup.id}
                    className="border-b border-muted/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span>{formatDate(backup.created_at)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted">
                        {reasonLabel(backup.reason)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        <HardDrive className="h-3 w-3 text-muted-foreground" />
                        <span>{formatSize(backup.size_bytes)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        <FileKey className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {truncateChecksum(backup.checksum)}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 hidden md:table-cell">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {backup.id.slice(0, 8)}…
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setRollbackTarget(backup)}
                        className="h-7 text-[11px]"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Rollback
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <ConfirmDialog
        backup={rollbackTarget}
        onConfirm={handleRollback}
        onCancel={() => setRollbackTarget(null)}
      />

      {/* In-progress dialog */}
      <ProgressDialog visible={rollbackRunning} />
    </>
  );
}