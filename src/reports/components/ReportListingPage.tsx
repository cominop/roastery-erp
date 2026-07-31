/**
 * ReportListingPage — browse all report definitions grouped by category.
 *
 * Step 92: Fetches /api/reports, groups by category, displays with
 * search/filter and a "Run" action per report.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Play,
  Search,
  X,
  FileDown,
  Table2,
  FileSpreadsheet,
  Code,
  LayoutPanelTop,
  Loader2,
  Check,
  AlertTriangle,
  Clock,
  CalendarDays,
  Calendar,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportDefinition, BandConfig, ScheduleConfig } from "@/reports/schema/reportSchema";
import ReportParameterForm from "@/reports/components/ReportParameterForm";
import BandConfigEditor from "@/reports/components/BandConfigEditor";
import ScheduleDialog from "@/reports/components/ScheduleDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// ─── Format icon map ──────────────────────────────────

const FORMAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pdf: FileDown,
  csv: Table2,
  xlsx: FileSpreadsheet,
  html: Code,
  ods: FileSpreadsheet,
};

function FormatBadge({ format }: { format: string }) {
  const Icon = FORMAT_ICONS[format.toLowerCase()];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
        format === "pdf"
          ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
          : format === "csv"
            ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
            : format === "xlsx"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
              : format === "html"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                : "bg-muted text-muted-foreground"
      )}
    >
      {Icon && <Icon className="h-2.5 w-2.5" />}
      {format}
    </span>
  );
}

// ─── Cron schedule badge ───────────────────────────────

const CRON_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  daily: CalendarDays,
  weekly: Calendar,
  monthly: CalendarRange,
};

const CRON_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function CronBadge({ schedule }: { schedule: ScheduleConfig | null }) {
  if (!schedule?.cron) return null;
  const cron = schedule.cron;
  const Icon = CRON_ICONS[cron];
  const label = CRON_LABELS[cron];
  if (!label) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        {cron}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
      {Icon && <Icon className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

// ─── Category group — collapsible section ──────────────

function CategorySection({
  category,
  reports,
  onRunReport,
  onEditBands,
  onEditSchedule,
  searchQuery,
}: {
  category: string;
  reports: ReportDefinition[];
  onRunReport: (report: ReportDefinition) => void;
  onEditBands: (report: ReportDefinition) => void;
  onEditSchedule: (report: ReportDefinition) => void;
  searchQuery: string;
}) {
  const [open, setOpen] = useState(true);
  const isFiltered = searchQuery.length > 0;

  return (
    <div className="border-b last:border-b-0">
      {/* Category header */}
      <button
        onClick={() => !isFiltered && setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-muted/30"
        )}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span>{category}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {reports.length} report{reports.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Report rows */}
      {(open || isFiltered) && (
        <div className="pb-1">
          {reports.map((report) => (
            <div
              key={report.id}
              className="group flex items-start gap-3 px-8 py-2 hover:bg-muted/20 transition-colors"
            >
              {/* Report info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {report.caption}
                  </span>
                  {!report.enabled && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                      Disabled
                    </span>
                  )}
                </div>
                {report.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                    {report.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {/* Template file */}
                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                    {report.template_file}
                  </span>

                  {/* Separator */}
                  {report.output_formats.length > 0 && (
                    <span className="text-muted-foreground/20">·</span>
                  )}

                  {/* Output format badges */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {report.output_formats.map((fmt) => (
                      <FormatBadge key={fmt} format={fmt} />
                    ))}
                  </div>

                  {/* Source table */}
                  {report.source_table && (
                    <>
                      <span className="text-muted-foreground/20">·</span>
                      <span className="text-[10px] text-muted-foreground/60">
                        from <span className="font-mono">{report.source_table}</span>
                      </span>
                    </>
                  )}

                  {/* Schedule badge */}
                  {report.auto_generate && (
                    <>
                      <span className="text-muted-foreground/20">·</span>
                      <CronBadge schedule={report.auto_generate} />
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onEditSchedule(report)}
                  title="Configure auto-generation schedule"
                >
                  <Clock className="h-3 w-3" />
                  Schedule
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onEditBands(report)}
                  title="Edit band row ranges (cover/title/header/detail/summary/footer)"
                >
                  <LayoutPanelTop className="h-3 w-3" />
                  Bands
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onRunReport(report)}
                >
                  <Play className="h-3 w-3" />
                  Run
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Fuzzy match (shared with SidebarTree) ──────────────

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ─── ReportListingPage ─────────────────────────────────

export default function ReportListingPage() {
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Parameter dialog state
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Band editor state
  const [bandEditReport, setBandEditReport] = useState<ReportDefinition | null>(null);
  const [bandEditOpen, setBandEditOpen] = useState(false);
  const [bandEditBands, setBandEditBands] = useState<BandConfig | undefined>(undefined);
  const [bandSaveLoading, setBandSaveLoading] = useState(false);
  const [bandSaveError, setBandSaveError] = useState<string | null>(null);
  const [bandSaveSuccess, setBandSaveSuccess] = useState(false);

  // Schedule dialog state
  const [scheduleReport, setScheduleReport] = useState<ReportDefinition | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Fetch all reports on mount
  useEffect(() => {
    setLoading(true);
    fetch("/api/reports")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ReportDefinition[]) => {
        setReports(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Group reports by category, filter by search
  const grouped = useMemo(() => {
    const filtered = searchQuery
      ? reports.filter(
          (r) =>
            fuzzyMatch(searchQuery, r.caption) ||
            fuzzyMatch(searchQuery, r.description || "") ||
            fuzzyMatch(searchQuery, r.category) ||
            fuzzyMatch(searchQuery, r.name)
        )
      : reports;

    const groups: Record<string, ReportDefinition[]> = {};
    for (const report of filtered) {
      const cat = report.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(report);
    }

    // Sort categories alphabetically, reports by name within category
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, items]) => ({
        category,
        reports: items.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [reports, searchQuery]);

  // Count totals
  const totalEnabled = useMemo(
    () => reports.filter((r) => r.enabled).length,
    [reports]
  );

  const handleRunReport = useCallback((report: ReportDefinition) => {
    // If filterable or has parameters, open the parameter dialog
    if (report.filterable || (report.parameters && report.parameters.length > 0)) {
      setSelectedReport(report);
      setDialogOpen(true);
    } else {
      // No parameters needed — open with confirmation
      setSelectedReport(report);
      setDialogOpen(true);
    }
  }, []);

  const handleEditBands = useCallback((report: ReportDefinition) => {
    setBandEditReport(report);
    setBandEditBands(report.bands ? { ...report.bands } : undefined);
    setBandSaveError(null);
    setBandSaveSuccess(false);
    setBandEditOpen(true);
  }, []);

  // Schedule dialog state
  const handleEditSchedule = useCallback((report: ReportDefinition) => {
    setScheduleReport(report);
    setScheduleOpen(true);
  }, []);

  const handleScheduleUpdated = useCallback((updated: ReportDefinition) => {
    setReports((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r)),
    );
  }, []);

  const handleRenderComplete = useCallback((result: { url: string; output: string }) => {
    // Open the rendered file URL in a new tab to trigger download
    window.open(result.url, '_blank');
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      // Clear selected report after dialog closes
      setTimeout(() => setSelectedReport(null), 200);
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  // ─── Loading state ─────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <HeaderBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClear={handleClearSearch}
          totalEnabled={totalEnabled}
          totalCount={reports.length}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            Loading reports...
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ───────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <HeaderBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClear={handleClearSearch}
          totalEnabled={totalEnabled}
          totalCount={reports.length}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-sm text-red-500">Failed to load reports</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setLoading(true);
                fetch("/api/reports")
                  .then((r) => r.json())
                  .then((data: ReportDefinition[]) => {
                    setReports(data);
                    setLoading(false);
                  })
                  .catch((err) => {
                    setError(err.message);
                    setLoading(false);
                  });
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Empty state ───────────────────────────────────
  if (reports.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <HeaderBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClear={handleClearSearch}
          totalEnabled={totalEnabled}
          totalCount={0}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No reports defined</p>
            <p className="text-xs text-muted-foreground/60">
              Report definitions will appear here once created via the API or
              seed data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── No search results ─────────────────────────────
  const hasResults = grouped.some((g) => g.reports.length > 0);

  if (!hasResults) {
    return (
      <div className="flex flex-col h-full">
        <HeaderBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClear={handleClearSearch}
          totalEnabled={totalEnabled}
          totalCount={reports.length}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Search className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No reports match "{searchQuery}"
            </p>
            <p className="text-xs text-muted-foreground/60">
              Try a different search term
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Normal render ─────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <HeaderBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClear={handleClearSearch}
        totalEnabled={totalEnabled}
        totalCount={reports.length}
      />
      <div className="flex-1 overflow-y-auto">
        {grouped.map(
          ({ category, reports: catReports }) =>
            catReports.length > 0 && (
              <CategorySection
                key={category}
                category={category}
                reports={catReports}
                onRunReport={handleRunReport}
                onEditBands={handleEditBands}
                onEditSchedule={handleEditSchedule}
                searchQuery={searchQuery}
              />
            )
        )}
      </div>

      {/* Parameter form dialog */}
      {selectedReport && (
        <ReportParameterForm
          report={selectedReport}
          open={dialogOpen}
          onOpenChange={handleDialogOpenChange}
          onRenderComplete={handleRenderComplete}
        />
      )}

      {/* Band editor dialog */}
      {bandEditReport && (
        <Dialog
          open={bandEditOpen}
          onOpenChange={(open) => {
            setBandEditOpen(open);
            if (!open) {
              setTimeout(() => setBandEditReport(null), 200);
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LayoutPanelTop className="h-4 w-4" />
                Band Configuration — {bandEditReport.caption}
              </DialogTitle>
              <DialogDescription>
                Define which row ranges in the template map to each report section.
                Bands are processed in order: Cover → Title → Header → Detail → Summary → Footer.
              </DialogDescription>
            </DialogHeader>

            {bandEditBands !== undefined && (
              <BandConfigEditor
                bands={bandEditBands}
                onChange={(newBands) => {
                  setBandEditBands(newBands);
                  setBandSaveError(null);
                  setBandSaveSuccess(false);
                }}
                templateRowCount={bandEditReport.template_file ? undefined : undefined}
              />
            )}

            {bandSaveError && (
              <div className="flex items-center gap-2 text-[11px] text-destructive bg-destructive/5 p-2 rounded">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {bandSaveError}
              </div>
            )}

            {bandSaveSuccess && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded">
                <Check className="h-3.5 w-3.5 shrink-0" />
                Band configuration saved successfully.
              </div>
            )}

            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBandEditOpen(false)}
                disabled={bandSaveLoading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  if (!bandEditReport || !bandEditBands) return;
                  setBandSaveLoading(true);
                  setBandSaveError(null);
                  setBandSaveSuccess(false);
                  try {
                    const res = await fetch(
                      `/api/reports/${encodeURIComponent(bandEditReport.id)}`,
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ bands: bandEditBands }),
                      },
                    );
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({ error: res.statusText }));
                      throw new Error(err.error || `HTTP ${res.status}`);
                    }
                    const updated = await res.json();
                    // Update the report in the local list
                    setReports((prev) =>
                      prev.map((r) => (r.id === updated.id ? updated : r)),
                    );
                    setBandSaveSuccess(true);
                    setBandSaveLoading(false);
                    // Auto-close after a short delay
                    setTimeout(() => setBandEditOpen(false), 1200);
                  } catch (err) {
                    setBandSaveError(
                      err instanceof Error ? err.message : "Failed to save band configuration",
                    );
                    setBandSaveLoading(false);
                  }
                }}
                disabled={bandSaveLoading}
              >
                {bandSaveLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Save Bands
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Schedule dialog */}
      {scheduleReport && (
        <ScheduleDialog
          report={scheduleReport}
          open={scheduleOpen}
          onOpenChange={(open) => {
            setScheduleOpen(open);
            if (!open) {
              setTimeout(() => setScheduleReport(null), 200);
            }
          }}
          onScheduleUpdated={handleScheduleUpdated}
        />
      )}
    </div>
  );
}

// ─── Header bar with search ─────────────────────────────

function HeaderBar({
  searchQuery,
  onSearchChange,
  onClear,
  totalEnabled,
  totalCount,
}: {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onClear: () => void;
  totalEnabled: number;
  totalCount: number;
}) {
  return (
    <div className="px-4 py-2 border-b shrink-0 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
        <FileText className="h-4 w-4 shrink-0" />
        <span>Reports</span>
        {totalCount > 0 && (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            ({totalEnabled} enabled · {totalCount} total)
          </span>
        )}
      </div>
      <div className="relative w-48 shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search reports…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-7 pl-7 pr-7 text-xs"
        />
        {searchQuery && (
          <button
            onClick={onClear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
            tabIndex={-1}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
