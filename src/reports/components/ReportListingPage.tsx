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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportDefinition } from "@/reports/schema/reportSchema";
import ReportParameterForm from "@/reports/components/ReportParameterForm";

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

// ─── Category group — collapsible section ──────────────

function CategorySection({
  category,
  reports,
  onRunReport,
  searchQuery,
}: {
  category: string;
  reports: ReportDefinition[];
  onRunReport: (report: ReportDefinition) => void;
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
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
      // No parameters needed — trigger render directly
      // For now, open the dialog anyway so the user has a "Run" confirmation
      // since the render endpoint expects a POST with parameters.
      setSelectedReport(report);
      setDialogOpen(true);
    }
  }, []);

  const handleRenderComplete = useCallback((_result: { url: string; output: string }) => {
    // Step 94+ will add download/toast notification
    // For now, the dialog closes and the report is rendered
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
