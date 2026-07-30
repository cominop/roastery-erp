// ImportDialog — UI for selecting, validating, and importing metadata archives
// Step 87: Export/Import UI dialogs
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileUp,
  HardDrive,
  Clock,
  Eye,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import DiffPreview from "./DiffPreview";

// ─── Types ──────────────────────────────────────────────

interface ArchiveInfo {
  name: string;
  path: string;
  size_bytes: number;
  created_at: string;
}

interface ValidateResult {
  success: boolean;
  hasWarnings: boolean;
  output: string;
  archivePath: string;
}

interface ImportResult {
  success: boolean;
  backupCreated: boolean;
  backup?: { id: string; path: string } | null;
  output: string;
  archivePath: string;
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

export default function ImportDialog() {
  const [archives, setArchives] = useState<ArchiveInfo[]>([]);
  const [loadingArchives, setLoadingArchives] = useState(true);
  const [selectedArchive, setSelectedArchive] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation state
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidateResult | null>(null);

  // Diff state
  const [showDiff, setShowDiff] = useState(false);
  const [diffArchivePath, setDiffArchivePath] = useState<string | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    type: "success" | "error";
    message: string;
    output?: string;
  } | null>(null);

  // Fetch available archives
  const fetchArchives = useCallback(async () => {
    setLoadingArchives(true);
    try {
      const res = await fetch("/api/metadata/archives");
      if (res.ok) {
        const data: ArchiveInfo[] = await res.json();
        setArchives(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingArchives(false);
    }
  }, []);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  // Resolve the effective archive path (selected or uploaded)
  const getEffectiveArchivePath = useCallback((): string | null => {
    if (selectedArchive) return selectedArchive;
    return null;
  }, [selectedArchive]);

  // Handle file upload
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setSelectedArchive("");
      setValidationResult(null);
      setImportResult(null);
      setShowDiff(false);
    }
  }, []);

  // Handle archive selection
  const handleArchiveSelect = useCallback((value: string | null) => {
    if (!value) return;
    setSelectedArchive(value);
    setUploadedFile(null);
    setValidationResult(null);
    setImportResult(null);
    setShowDiff(false);
  }, []);

  // Validate the selected archive
  const handleValidate = useCallback(async () => {
    const archivePath = getEffectiveArchivePath();
    if (!archivePath) return;

    setValidating(true);
    setValidationResult(null);
    setImportResult(null);

    try {
      const res = await fetch("/api/metadata/import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivePath }),
      });
      const data: ValidateResult & { error?: string } = await res.json();
      if (res.ok) {
        setValidationResult(data);
      } else {
        setValidationResult({
          success: false,
          hasWarnings: false,
          output: data.error || "Validation request failed",
          archivePath,
        });
      }
    } catch (err) {
      setValidationResult({
        success: false,
        hasWarnings: false,
        output: err instanceof Error ? err.message : "Network error",
        archivePath: archivePath,
      });
    } finally {
      setValidating(false);
    }
  }, [getEffectiveArchivePath]);

  // Show diff preview
  const handleShowDiff = useCallback(() => {
    const archivePath = getEffectiveArchivePath();
    if (archivePath) {
      setDiffArchivePath(archivePath);
      setShowDiff(true);
    }
  }, [getEffectiveArchivePath]);

  // Run the full import
  const handleImport = useCallback(async () => {
    const archivePath = getEffectiveArchivePath();
    if (!archivePath) return;

    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch("/api/metadata/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivePath }),
      });
      const data: ImportResult = await res.json();

      if (res.ok && data.success) {
        setImportResult({
          type: "success",
          message: `Import completed successfully${data.backupCreated ? " (auto-backup created)" : ""}`,
          output: data.output,
        });
        // Refresh archives list (new backup may appear)
        fetchArchives();
      } else {
        setImportResult({
          type: "error",
          message: data.error || "Import failed",
          output: data.output,
        });
      }
    } catch (err) {
      setImportResult({
        type: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setImporting(false);
    }
  }, [getEffectiveArchivePath, fetchArchives]);

  const hasArchive = !!getEffectiveArchivePath();

  return (
    <div className="space-y-4">
      {/* Archive selection */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Select Archive</CardTitle>
          <CardDescription>
            Choose an existing archive or upload a new one
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing archives dropdown */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Available Archives</Label>
            {loadingArchives ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading archives...
              </div>
            ) : (
              <Select
                value={selectedArchive}
                onValueChange={handleArchiveSelect}
                disabled={!!uploadedFile}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={archives.length === 0 ? "No archives available" : "Select an archive..."} />
                </SelectTrigger>
                <SelectContent>
                  {archives.map((a) => (
                    <SelectItem key={a.path} value={a.path}>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px]">{a.name}</span>
                        <span className="text-muted-foreground">({formatSize(a.size_bytes)})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedArchive && (
              <div className="rounded-lg border bg-muted/30 p-2.5 text-xs space-y-1 mt-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">File:</span>
                  <span className="font-mono truncate ml-2">
                    {archives.find((a) => a.path === selectedArchive)?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <span className="tabular-nums">
                    {formatSize(archives.find((a) => a.path === selectedArchive)?.size_bytes || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span>
                    {formatDate(archives.find((a) => a.path === selectedArchive)?.created_at || "")}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 border-t" />
            <span className="text-[10px] text-muted-foreground">OR</span>
            <div className="flex-1 border-t" />
          </div>

          {/* File upload */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Upload Archive</Label>
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                uploadedFile
                  ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/10"
                  : "border-muted-foreground/20 hover:border-muted-foreground/40"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleFileUpload}
              />
              {uploadedFile ? (
                <div className="text-xs space-y-1">
                  <FileUp className="h-5 w-5 mx-auto text-green-600" />
                  <p className="font-medium text-green-700 dark:text-green-400">{uploadedFile.name}</p>
                  <p className="text-muted-foreground">{formatSize(uploadedFile.size)}</p>
                </div>
              ) : (
                <div className="text-xs space-y-1">
                  <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">Click to upload a .zip archive</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions bar */}
      {hasArchive && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleValidate}
            disabled={validating}
          >
            {validating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
            )}
            {validating ? "Validating..." : "Validate Archive"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleShowDiff}
            disabled={showDiff}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            {showDiff ? "Diff Shown" : "Preview Diff"}
          </Button>

          <Button
            size="sm"
            onClick={handleImport}
            disabled={importing}
            className="ml-auto"
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Upload className="h-3.5 w-3.5 mr-1" />
            )}
            {importing ? "Importing..." : "Import Metadata"}
          </Button>
        </div>
      )}

      {/* Validation result */}
      {validationResult && (
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              {validationResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <CardTitle className="text-sm">
                {validationResult.success ? "Validation Passed" : "Validation Failed"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {validationResult.hasWarnings && (
              <div className="flex items-center gap-2 mb-3 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Archive passed validation but has warnings — review the output below</span>
              </div>
            )}
            <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-3 max-h-64 overflow-y-auto text-muted-foreground">
              {validationResult.output}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Diff preview */}
      {showDiff && diffArchivePath && (
        <DiffPreview
          archivePath={diffArchivePath}
          onCancel={() => setShowDiff(false)}
        />
      )}

      {/* Import result */}
      {importResult && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 text-sm",
            importResult.type === "success"
              ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
          )}
        >
          {importResult.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "font-medium text-sm",
                importResult.type === "success"
                  ? "text-green-800 dark:text-green-300"
                  : "text-red-800 dark:text-red-300"
              )}
            >
              {importResult.type === "success" ? "Import Successful" : "Import Failed"}
            </p>
            <p className="text-xs mt-1 text-muted-foreground">{importResult.message}</p>

            {importResult.output && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  View output log
                </summary>
                <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-3 mt-2 max-h-48 overflow-y-auto text-muted-foreground">
                  {importResult.output}
                </pre>
              </details>
            )}
          </div>
          <button
            onClick={() => setImportResult(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Label shim ─────────────────────────────────────────

function Label({ className, children, ...props }: { className?: string; children: React.ReactNode } & React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("text-xs text-muted-foreground", className)} {...props}>
      {children}
    </label>
  );
}