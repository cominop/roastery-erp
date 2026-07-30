// ExportDialog — UI for triggering metadata export + package pipeline
// Step 87: Export/Import UI dialogs
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Archive,
  FileDown,
  HardDrive,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

interface ExportResult {
  success: boolean;
  archive?: {
    path: string;
    name: string;
    size_bytes: number;
    created_at: string;
  };
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────

function formatSize(bytes: number): string {
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

// ─── Component ──────────────────────────────────────────

export default function ExportDialog() {
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("development");
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
    archive?: ExportResult["archive"];
  } | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setResult(null);
    try {
      const res = await fetch("/api/metadata/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim() || "UI export",
          source: source || "development",
        }),
      });
      const data: ExportResult = await res.json();
      if (res.ok && data.success && data.archive) {
        setResult({
          type: "success",
          message: `Archive created: ${data.archive.name} (${formatSize(data.archive.size_bytes)})`,
          archive: data.archive,
        });
      } else {
        setResult({ type: "error", message: data.error || "Export failed" });
      }
    } catch (err) {
      setResult({
        type: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setExporting(false);
    }
  }, [description, source]);

  const handleDownload = useCallback(() => {
    if (!result?.archive?.path) return;
    // Trigger a download via the server
    const link = document.createElement("a");
    link.href = `/api/metadata/download?file=${encodeURIComponent(result.archive.path)}`;
    link.download = result.archive.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [result]);

  return (
    <div className="space-y-4">
      {/* Export form */}
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Export Metadata</CardTitle>
              <CardDescription>
                Export all metadata definitions to a deployable .zip archive
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Invoice form fix"
                className="h-7 text-xs"
                disabled={exporting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Source</Label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="h-7 text-xs border rounded px-2 bg-background w-full"
                disabled={exporting}
              >
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>

          <Button
            onClick={handleExport}
            disabled={exporting}
            className="w-full"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Exporting metadata...
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 mr-1" />
                Run Export & Package
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Result banner */}
      {result && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 text-sm",
            result.type === "success"
              ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
          )}
        >
          {result.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "font-medium text-sm",
                result.type === "success"
                  ? "text-green-800 dark:text-green-300"
                  : "text-red-800 dark:text-red-300"
              )}
            >
              {result.type === "success" ? "Export Successful" : "Export Failed"}
            </p>
            <p className="text-xs mt-1 text-muted-foreground">{result.message}</p>

            {/* Archive details */}
            {result.archive && (
              <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">File:</span>
                  <span className="font-mono truncate ml-2">{result.archive.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <span className="tabular-nums">{formatSize(result.archive.size_bytes)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{formatDate(result.archive.created_at)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Download button */}
      {result?.archive && (
        <Button variant="outline" className="w-full" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-1" />
          Download Archive ({result.archive.name})
        </Button>
      )}
    </div>
  );
}