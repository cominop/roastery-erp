/**
 * ScheduleDialog — configure auto-generation schedule for a report.
 *
 * Step 97: Allows setting daily/weekly/monthly cron schedules, selecting
 * output format, and viewing the last-run log for a report.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Clock,
  Calendar,
  CalendarDays,
  CalendarRange,
  Play,
  Trash2,
  Check,
  AlertTriangle,
  FileDown,
  History,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportDefinition, ScheduleConfig, ScheduleLogEntry } from "@/reports/schema/reportSchema";
import {
  updateReportSchedule,
  deleteReportSchedule,
  generateReportNow,
  fetchReportScheduleLog,
} from "@/reports/api/reportsApi";

// ─── Cron alias display ─────────────────────────────────

const CRON_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; caption: string }> = {
  daily: { label: "Daily", icon: CalendarDays, caption: "Every day at 6:00 AM" },
  weekly: { label: "Weekly", icon: Calendar, caption: "Every Monday at 6:00 AM" },
  monthly: { label: "Monthly", icon: CalendarRange, caption: "1st of every month at 6:00 AM" },
};

function CronBadge({ cron }: { cron: string }) {
  const info = CRON_LABELS[cron];
  if (!info) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        {cron}
      </span>
    );
  }
  const Icon = info.icon;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
      <Icon className="h-2.5 w-2.5" />
      {info.label}
    </span>
  );
}

// ─── Status badge ───────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    error: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
    running: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    pending: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", styles[status] || styles.pending)}>
      {status === "running" && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
      {status === "success" && <Check className="h-2.5 w-2.5 mr-1" />}
      {status === "error" && <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
      {status}
    </span>
  );
}

// ─── ScheduleDialog ─────────────────────────────────────

export interface ScheduleDialogProps {
  report: ReportDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduleUpdated?: (report: ReportDefinition) => void;
}

export default function ScheduleDialog({
  report,
  open,
  onOpenChange,
  onScheduleUpdated,
}: ScheduleDialogProps) {
  const existingSchedule = report.auto_generate;

  // Form state
  const [enabled, setEnabled] = useState(!!existingSchedule);
  const [cron, setCron] = useState(existingSchedule?.cron || "daily");
  const [format, setFormat] = useState(existingSchedule?.format || report.output_formats[0] || "pdf");
  const [recipientsText, setRecipientsText] = useState(
    existingSchedule?.recipients?.join(", ") || "",
  );
  const [subject, setSubject] = useState(existingSchedule?.subject || "");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Generate-now state
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<{ url: string; outputFileName: string } | null>(null);

  // Log state
  const [logEntries, setLogEntries] = useState<ScheduleLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      const s = report.auto_generate;
      setEnabled(!!s);
      setCron(s?.cron || "daily");
      setFormat(s?.format || report.output_formats[0] || "pdf");
      setRecipientsText(s?.recipients?.join(", ") || "");
      setSubject(s?.subject || "");
      setSaveError(null);
      setSaveSuccess(false);
      setGenerateError(null);
      setGenerateResult(null);
      // Fetch log
      setLogLoading(true);
      fetchReportScheduleLog(report.id, 10)
        .then((entries) => setLogEntries(entries))
        .catch(() => {})
        .finally(() => setLogLoading(false));
    }
  }, [open, report.id, report.auto_generate, report.output_formats]);

  const handleSave = useCallback(async () => {
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      if (!enabled) {
        // Clear the schedule
        const updated = await deleteReportSchedule(report.id);
        const dummyReport = { ...report, auto_generate: null };
        onScheduleUpdated?.(dummyReport);
        setSaveSuccess(true);
      } else {
        const recipients = recipientsText
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);

        const schedule = {
          cron,
          format,
          recipients,
          ...(subject ? { subject } : {}),
        };

        const updated = await updateReportSchedule(report.id, schedule);
        onScheduleUpdated?.(updated);
        setSaveSuccess(true);
      }

      setTimeout(() => onOpenChange(false), 1200);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSaveLoading(false);
    }
  }, [enabled, cron, format, recipientsText, subject, report.id, report, onScheduleUpdated, onOpenChange]);

  const handleGenerateNow = useCallback(async () => {
    setGenerateLoading(true);
    setGenerateError(null);
    setGenerateResult(null);

    try {
      const result = await generateReportNow(report.id, { format });
      setGenerateResult({ url: result.url, outputFileName: result.outputFileName });
      // Refresh log
      const entries = await fetchReportScheduleLog(report.id, 10);
      setLogEntries(entries);
      // Open in new tab
      window.open(result.url, "_blank");
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGenerateLoading(false);
    }
  }, [report.id, format]);

  const handleFormatChange = useCallback((value: string) => {
    setFormat(value);
  }, []);

  const handleCronChange = useCallback((value: string) => {
    setCron(value);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Schedule — {report.caption}
          </DialogTitle>
          <DialogDescription>
            Configure automatic report generation. Generated files are saved to
            the server output directory and accessible via the reports page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Enable toggle ── */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Auto-generation</Label>
              <p className="text-[11px] text-muted-foreground">
                {enabled
                  ? "Report will be generated automatically on schedule"
                  : "No schedule configured — run manually"}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {enabled && (
            <>
              <Separator />

              {/* ── Cron frequency ── */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Frequency</Label>
                <Select value={cron} onValueChange={handleCronChange}>
                  <SelectTrigger className="h-8 text-xs w-full">
                    <SelectValue placeholder="Select frequency…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">
                      <span className="flex items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Daily — every day at 6:00 AM
                      </span>
                    </SelectItem>
                    <SelectItem value="weekly">
                      <span className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        Weekly — every Monday at 6:00 AM
                      </span>
                    </SelectItem>
                    <SelectItem value="monthly">
                      <span className="flex items-center gap-2">
                        <CalendarRange className="h-3.5 w-3.5" />
                        Monthly — 1st of month at 6:00 AM
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ── Output format ── */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Output format</Label>
                <Select value={format} onValueChange={handleFormatChange}>
                  <SelectTrigger className="h-8 text-xs w-full">
                    <SelectValue placeholder="Select format…" />
                  </SelectTrigger>
                  <SelectContent>
                    {report.output_formats.map((fmt) => (
                      <SelectItem key={fmt} value={fmt}>
                        <span className="flex items-center gap-2">
                          <FileDown className="h-3.5 w-3.5" />
                          {fmt.toUpperCase()}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── Email recipients ── */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Email recipients <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  type="text"
                  placeholder="email1@example.com, email2@example.com"
                  value={recipientsText}
                  onChange={(e) => setRecipientsText(e.target.value)}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Comma-separated email addresses to receive the generated report.
                </p>
              </div>

              {/* ── Email subject ── */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Email subject <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  type="text"
                  placeholder={`${report.caption} — {date}`}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </>
          )}

          <Separator />

          {/* ── Generate Now section ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Generate Now</Label>
                <p className="text-[11px] text-muted-foreground">
                  Trigger an immediate report generation
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleGenerateNow}
                disabled={generateLoading}
              >
                {generateLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {generateLoading ? "Generating…" : "Generate Now"}
              </Button>
            </div>

            {generateError && (
              <div className="flex items-center gap-2 text-[11px] text-destructive bg-destructive/5 p-2 rounded">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {generateError}
              </div>
            )}

            {generateResult && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded">
                <Check className="h-3.5 w-3.5 shrink-0" />
                Generated: {generateResult.outputFileName}
              </div>
            )}
          </div>

          <Separator />

          {/* ── Generation log ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs font-medium">Recent runs</Label>
            </div>

            {logLoading ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading history…
              </div>
            ) : logEntries.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                No generation runs yet. Click "Generate Now" to create the first one.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {logEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 p-2 rounded bg-muted/30 text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusBadge status={entry.status} />
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {new Date(entry.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-muted-foreground/60 font-mono text-[10px]">
                        .{entry.format}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.triggered_by === "manual" && (
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
                          Manual
                        </span>
                      )}
                      {entry.status === "error" && entry.error_message && (
                        <span
                          className="text-[9px] text-destructive max-w-[120px] truncate"
                          title={entry.error_message}
                        >
                          {entry.error_message}
                        </span>
                      )}
                      {entry.status === "success" && entry.output_size && (
                        <span className="text-[9px] text-muted-foreground/60">
                          {formatSize(entry.output_size)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Error / Success messages */}
        {saveError && (
          <div className="flex items-center gap-2 text-[11px] text-destructive bg-destructive/5 p-2 rounded">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded">
            <Check className="h-3.5 w-3.5 shrink-0" />
            Schedule saved successfully.
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saveLoading}
          >
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveLoading}
          >
            {saveLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 mr-1" />
                {enabled ? "Save Schedule" : "Disable Schedule"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}