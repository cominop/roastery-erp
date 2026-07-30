// DiffPreview — Before/after comparison UI for metadata archive imports
// Step 84: Metadata Deployment 5 — Diff Preview
import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Pencil,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export interface DiffDetailItem {
  name: string;
  key_field: string;
  status: "added" | "removed" | "changed" | "unchanged";
  changes: string[];
}

export type DiffDetails = Record<string, DiffDetailItem[] | Record<string, DiffDetailItem[]>>;

export interface DiffResult {
  summary: Record<string, DiffSummary>;
  details: DiffDetails;
}

export interface DiffPreviewProps {
  archivePath: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

// ─── Status helpers ─────────────────────────────────────

const statusConfig = {
  added: { icon: Plus, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20", label: "Added" },
  removed: { icon: Minus, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20", label: "Removed" },
  changed: { icon: Pencil, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20", label: "Changed" },
  unchanged: { icon: ChevronRight, color: "text-muted-foreground", bg: "", label: "Unchanged" },
} as const;

type FilterMode = "all" | "added" | "removed" | "changed";

// ─── Section accordion state ────────────────────────────

interface SectionState {
  [key: string]: boolean;
}

// ─── Component ──────────────────────────────────────────

export default function DiffPreview({ archivePath, onConfirm, onCancel }: DiffPreviewProps) {
  const [data, setData] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expanded, setExpanded] = useState<SectionState>({});

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ archive: archivePath });

    fetch(`/api/metadata/diff?${params}`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error(e.error || `HTTP ${r.status}`); });
        return r.json();
      })
      .then((result: DiffResult) => {
        setData(result);
        // Auto-expand only sections with changes
        const initial: SectionState = {};
        for (const [key, summary] of Object.entries(result.summary)) {
          if (summary.added > 0 || summary.removed > 0 || summary.changed > 0) {
            initial[key] = true;
          }
        }
        setExpanded(initial);
      })
      .catch((err) => {
        setError(err.message || "Failed to load diff data");
      })
      .finally(() => setLoading(false));
  }, [archivePath]);

  // ── Derived data (computed before early returns for hook consistency) ──

  const sectionKeys = data ? Object.keys(data.summary) : [];

  // Count total changes across all sections
  const totalChanges = useMemo(() => {
    if (!data) return { added: 0, removed: 0, changed: 0 };
    let added = 0, removed = 0, changed = 0;
    for (const s of Object.values(data.summary)) {
      added += s.added;
      removed += s.removed;
      changed += s.changed;
    }
    return { added, removed, changed };
  }, [data]);

  const hasChanges = totalChanges.added > 0 || totalChanges.removed > 0 || totalChanges.changed > 0;

  // ── Loading state ──────────────────────────────────

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Computing metadata diff...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Error state ────────────────────────────────────

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Diff failed</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
            {onCancel && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                Go Back
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  // ── Render ─────────────────────────────────────────

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Diff Preview</CardTitle>
        <CardDescription>
          Compare current metadata with the incoming archive
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Added" count={totalChanges.added} color="text-green-600" bg="bg-green-50 dark:bg-green-950/20" />
          <SummaryCard label="Removed" count={totalChanges.removed} color="text-red-600" bg="bg-red-50 dark:bg-red-950/20" />
          <SummaryCard label="Changed" count={totalChanges.changed} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/20" />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filter:</span>
          <Select
            value={filter}
            onValueChange={(v: string | null) => {
              if (v === "all" || v === "added" || v === "removed" || v === "changed") {
                setFilter(v);
              }
            }}
          >
            <SelectTrigger className="h-7 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All items</SelectItem>
              <SelectItem value="added">Added only</SelectItem>
              <SelectItem value="removed">Removed only</SelectItem>
              <SelectItem value="changed">Changed only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Per-section breakdown */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {sectionKeys.map((sectionKey) => {
            const summary = data.summary[sectionKey];
            const details = data.details[sectionKey];

            // Skip sections with no visible items based on filter
            const visibleItems = getVisibleItems(details, filter, summary);

            if (visibleItems.length === 0 && filter !== "all") return null;
            // Only show the section header if there's nothing at all
            if (summary.added === 0 && summary.removed === 0 && summary.changed === 0 && filter === "all") {
              return null;
            }

            const isExpanded = expanded[sectionKey] ?? false;

            return (
              <div key={sectionKey} className="rounded-lg border overflow-hidden">
                {/* Section header */}
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }))}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="capitalize">{sectionKey.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground/60 font-normal">
                      ({summary.added > 0 && <span className="text-green-600">+{summary.added}</span>}
                      {summary.added > 0 && summary.removed > 0 && ", "}
                      {summary.removed > 0 && <span className="text-red-600">-{summary.removed}</span>}
                      {(summary.added > 0 || summary.removed > 0) && summary.changed > 0 && ", "}
                      {summary.changed > 0 && <span className="text-amber-600">~{summary.changed}</span>}
                      {summary.added === 0 && summary.removed === 0 && summary.changed === 0 && (
                        <span className="text-muted-foreground/50">No changes</span>
                      )})
                    </span>
                  </div>
                  <StatusBadge summary={summary} />
                </button>

                {/* Section content */}
                {isExpanded && (
                  <div className="border-t divide-y divide-muted/50">
                    {visibleItems.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-muted-foreground/50 italic text-center">
                        No items match the current filter
                      </div>
                    ) : (
                      visibleItems.map((item, idx) => (
                        <DiffItemRow key={`${item.name}-${idx}`} item={item} />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {onConfirm && (
          <Button
            onClick={onConfirm}
            disabled={!hasChanges}
            title={!hasChanges ? "No changes to import" : "Proceed with import"}
          >
            {hasChanges ? "Proceed with Import" : "No Changes"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

// ─── Sub-components ─────────────────────────────────────

function SummaryCard({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <div className={cn("rounded-lg px-3 py-2 text-center", bg)}>
      <div className={cn("text-lg font-semibold tabular-nums", color)}>{count}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function StatusBadge({ summary }: { summary: DiffSummary }) {
  if (summary.changed > 0) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">~{summary.changed} changed</span>;
  }
  if (summary.added > 0) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">+{summary.added} new</span>;
  }
  if (summary.removed > 0) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">-{summary.removed} removed</span>;
  }
  return null;
}

function DiffItemRow({ item }: { item: DiffDetailItem }) {
  const cfg = statusConfig[item.status];
  const Icon = cfg.icon;

  return (
    <div className={cn("px-3 py-2 text-xs", cfg.bg)}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3 w-3 shrink-0", cfg.color)} />
        <span className="font-mono text-foreground/80 truncate">{item.name}</span>
        <span className={cn("text-[10px] font-medium", cfg.color)}>({cfg.label})</span>
      </div>
      {item.changes.length > 0 && (
        <ul className="mt-1 ml-5 space-y-0.5">
          {item.changes.map((change, ci) => (
            <li key={ci} className="text-[10px] text-muted-foreground leading-relaxed">
              {change}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────

function getVisibleItems(
  details: DiffDetailItem[] | Record<string, DiffDetailItem[]> | undefined,
  filter: FilterMode,
  summary: DiffSummary,
): DiffDetailItem[] {
  if (!details) return [];

  // If details is a record (permissions), flatten it
  if (!Array.isArray(details)) {
    const items: DiffDetailItem[] = [];
    for (const subItems of Object.values(details)) {
      if (Array.isArray(subItems)) {
        items.push(...subItems);
      }
    }
    return applyFilter(items, filter, summary);
  }

  return applyFilter(details, filter, summary);
}

function applyFilter(items: DiffDetailItem[], filter: FilterMode, summary: DiffSummary): DiffDetailItem[] {
  if (filter === "all") {
    // Hide unchanged items unless they're the only type
    const changed = items.filter((i) => i.status !== "unchanged");
    if (changed.length > 0) return changed;
    return items.slice(0, 5); // show at most 5 unchanged items
  }
  return items.filter((i) => i.status === filter);
}