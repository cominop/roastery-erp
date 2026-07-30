// MetadataManager — main metadata management page
// Step 87: Export/Import UI dialogs
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Archive, Database, Upload, DownloadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import BackupList from "./components/BackupList";
import ExportDialog from "./components/ExportDialog";
import ImportDialog from "./components/ImportDialog";

// ─── Types ──────────────────────────────────────────────

interface BackupResult {
  success: boolean;
  error?: string;
  backup?: {
    id: string;
    path: string;
    created_at: string;
    size_bytes: number;
    checksum: string;
  };
}

// ─── Component ──────────────────────────────────────────

export default function MetadataManager() {
  const [activeTab, setActiveTab] = useState("export");

  // Backup creation state
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupResult, setBackupResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleCreateBackup = async () => {
    setBackupCreating(true);
    setBackupResult(null);
    try {
      const res = await fetch("/api/metadata/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "manual" }),
      });
      const data: BackupResult = await res.json();
      if (res.ok && data.backup) {
        setBackupResult({
          type: "success",
          message: `Backup created: ${data.backup.id.slice(0, 8)}… (${(data.backup.size_bytes / 1024).toFixed(0)} KB)`,
        });
      } else {
        setBackupResult({ type: "error", message: data.error || "Backup failed" });
      }
    } catch (err) {
      setBackupResult({
        type: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setBackupCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="px-4 py-2 border-b shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Database className="h-4 w-4" />
          Metadata Manager
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreateBackup}
          disabled={backupCreating}
        >
          {backupCreating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Archive className="h-3.5 w-3.5 mr-1" />
          )}
          {backupCreating ? "Creating..." : "Create Backup"}
        </Button>
      </div>

      {/* Backup result banner */}
      {backupResult && (
        <div
          className={cn(
            "mx-4 mt-2 flex items-start gap-3 rounded-lg border p-3 text-sm",
            backupResult.type === "success"
              ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
          )}
        >
          {backupResult.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            <p
              className={cn(
                "font-medium text-xs",
                backupResult.type === "success"
                  ? "text-green-800 dark:text-green-300"
                  : "text-red-800 dark:text-red-300"
              )}
            >
              {backupResult.type === "success" ? "Backup Created" : "Backup Failed"}
            </p>
            <p className="text-[11px] mt-0.5 text-muted-foreground">
              {backupResult.message}
            </p>
          </div>
          <button
            onClick={() => setBackupResult(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Tab content */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="px-4 py-1 border-b shrink-0 overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="export">
              <DownloadCloud className="h-3.5 w-3.5" />
              Export
            </TabsTrigger>
            <TabsTrigger value="import">
              <Upload className="h-3.5 w-3.5" />
              Import
            </TabsTrigger>
            <TabsTrigger value="backups">
              <Archive className="h-3.5 w-3.5" />
              Backups
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="export" className="flex-1 overflow-y-auto m-0 p-4">
          <ExportDialog />
        </TabsContent>

        <TabsContent value="import" className="flex-1 overflow-y-auto m-0 p-4">
          <ImportDialog />
        </TabsContent>

        <TabsContent value="backups" className="flex-1 overflow-y-auto m-0 p-4">
          <BackupList onRollbackComplete={() => {}} />
        </TabsContent>
      </Tabs>
    </div>
  );
}