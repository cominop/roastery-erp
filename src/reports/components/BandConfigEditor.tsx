/**
 * BandConfigEditor — visual band row-range configuration for report definitions.
 *
 * Step 94: Edits the 6 band types (cover, title, header, detail, summary, footer)
 * with visual ruler, overlap detection, and toggleable bands.
 *
 * Bands define which row ranges of the .ods template map to which report section.
 * Each band has a start_row and end_row (1-indexed). Overlapping or gapped bands
 * are flagged visually.
 */
import { useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { BandConfig, BandRowRange } from "@/reports/schema/reportSchema";

// ─── Band metadata ─────────────────────────────────────

interface BandMeta {
  key: keyof BandConfig;
  label: string;
  description: string;
  color: string;         // Tailwind bg/border hue
  lightBg: string;       // light background class
  darkBg: string;        // dark background class
  borderColor: string;   // border class
  textColor: string;     // text class for the ruler bar
}

const ALL_BANDS: BandMeta[] = [
  {
    key: "cover",
    label: "Cover",
    description: "Front page / title page — usually a single row",
    color: "violet",
    lightBg: "bg-violet-100",
    darkBg: "dark:bg-violet-900/30",
    borderColor: "border-violet-300 dark:border-violet-700",
    textColor: "text-violet-800 dark:text-violet-200",
  },
  {
    key: "title",
    label: "Title",
    description: "Repeating title region above the header",
    color: "indigo",
    lightBg: "bg-indigo-100",
    darkBg: "dark:bg-indigo-900/30",
    borderColor: "border-indigo-300 dark:border-indigo-700",
    textColor: "text-indigo-800 dark:text-indigo-200",
  },
  {
    key: "header",
    label: "Header",
    description: "Column headers — repeats on every page",
    color: "blue",
    lightBg: "bg-blue-100",
    darkBg: "dark:bg-blue-900/30",
    borderColor: "border-blue-300 dark:border-blue-700",
    textColor: "text-blue-800 dark:text-blue-200",
  },
  {
    key: "detail",
    label: "Detail",
    description: "Data rows — the main repeating body of the report",
    color: "emerald",
    lightBg: "bg-emerald-100",
    darkBg: "dark:bg-emerald-900/30",
    borderColor: "border-emerald-300 dark:border-emerald-700",
    textColor: "text-emerald-800 dark:text-emerald-200",
  },
  {
    key: "summary",
    label: "Summary",
    description: "Aggregate / totals section",
    color: "amber",
    lightBg: "bg-amber-100",
    darkBg: "dark:bg-amber-900/30",
    borderColor: "border-amber-300 dark:border-amber-700",
    textColor: "text-amber-800 dark:text-amber-200",
  },
  {
    key: "footer",
    label: "Footer",
    description: "Page footer — repeats on every page",
    color: "slate",
    lightBg: "bg-slate-100",
    darkBg: "dark:bg-slate-800/40",
    borderColor: "border-slate-300 dark:border-slate-600",
    textColor: "text-slate-800 dark:text-slate-200",
  },
];

// ─── Validation helpers ────────────────────────────────

interface BandIssue {
  band: keyof BandConfig;
  type: "overlap" | "gap" | "inverted" | "zero";
  message: string;
  withBand?: keyof BandConfig;
}

/**
 * Validate a BandConfig and return a list of issues.
 */
function validateBands(
  bands: BandConfig,
  totalRows?: number,
): BandIssue[] {
  const issues: BandIssue[] = [];
  const active = (Object.keys(bands) as (keyof BandConfig)[]).filter(
    (k) => bands[k] !== undefined,
  );

  for (const key of active) {
    const range = bands[key]!;
    if (range.start_row <= 0 || range.end_row <= 0) {
      issues.push({ band: key, type: "zero", message: "Rows must be ≥ 1" });
    }
    if (range.start_row > range.end_row) {
      issues.push({
        band: key,
        type: "inverted",
        message: `Start row (${range.start_row}) is after end row (${range.end_row})`,
      });
    }
  }

  // Check overlap between every pair of active bands
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = bands[active[i]]!;
      const b = bands[active[j]]!;
      if (a.start_row <= b.end_row && b.start_row <= a.end_row) {
        issues.push({
          band: active[i],
          type: "overlap",
          message: `Overlaps with ${active[j]}`,
          withBand: active[j],
        });
      }
    }
  }

  // Check for gaps between bands (if detail is defined, check contiguous)
  if (totalRows && bands.detail) {
    const sorted = [...active]
      .filter((k) => bands[k])
      .sort((a, b) => bands[a]!.start_row - bands[b]!.start_row);

    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = bands[sorted[i]]!;
      const next = bands[sorted[i + 1]]!;
      if (cur.end_row + 1 < next.start_row) {
        issues.push({
          band: sorted[i],
          type: "gap",
          message: `Gap before ${sorted[i + 1]} (rows ${cur.end_row + 1}–${next.start_row - 1})`,
          withBand: sorted[i + 1],
        });
      }
    }
  }

  return issues;
}

// ─── Ruler visual ──────────────────────────────────────

function RulerBar({
  bands,
  totalRows,
  issues,
}: {
  bands: BandConfig;
  totalRows: number;
  issues: BandIssue[];
}) {
  const active = (Object.keys(bands) as (keyof BandConfig)[]).filter(
    (k) => bands[k] !== undefined,
  );

  const metaMap = Object.fromEntries(ALL_BANDS.map((m) => [m.key, m]));

  // Build segments for the ruler
  const segments = useMemo(() => {
    const segs: {
      band: keyof BandConfig;
      startPct: number;
      endPct: number;
      label: string;
      className: string;
      textClass: string;
      hasIssue: boolean;
    }[] = [];

    if (totalRows <= 0) return segs;

    for (const key of active) {
      const range = bands[key]!;
      const meta = metaMap[key];
      const hasIssue = issues.some((i) => i.band === key);
      const startPct = ((range.start_row - 1) / totalRows) * 100;
      const endPct = (range.end_row / totalRows) * 100;

      segs.push({
        band: key,
        startPct,
        endPct,
        label: meta.label,
        className: cn(
          "absolute h-full rounded-sm border transition-colors",
          meta.lightBg,
          meta.darkBg,
          meta.borderColor,
          hasIssue && "ring-2 ring-destructive/50",
        ),
        textClass: cn(
          "text-[9px] font-medium leading-none whitespace-nowrap px-1",
          meta.textColor,
        ),
        hasIssue,
      });
    }

    return segs;
  }, [bands, totalRows, issues, active]);

  if (totalRows <= 0) return null;

  // Tick marks every 5 rows
  const ticks: number[] = [];
  for (let i = 1; i <= totalRows; i++) {
    const pct = ((i - 1) / totalRows) * 100;
    ticks.push(pct);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Row 1</span>
        <span>Row {totalRows}</span>
      </div>
      <div className="relative h-7 w-full rounded-md bg-muted/30 border overflow-hidden">
        {/* Tick marks */}
        {totalRows <= 60 &&
          Array.from({ length: totalRows }, (_, i) => (
            <div
              key={i}
              className="absolute top-0 h-full w-px bg-muted-foreground/10"
              style={{ left: `${((i) / totalRows) * 100}%` }}
            />
          ))}
        {/* Numbered tick labels */}
        {totalRows <= 30 &&
          Array.from({ length: totalRows }, (_, i) => (
            <div
              key={`label-${i}`}
              className="absolute bottom-0 text-[7px] text-muted-foreground/40"
              style={{ left: `${((i) / totalRows) * 100}%` }}
            >
              {i + 1}
            </div>
          ))}
        {/* Band segments */}
        {segments.map((seg) => (
          <div
            key={seg.band}
            className={seg.className}
            style={{
              left: `${seg.startPct}%`,
              width: `${seg.endPct - seg.startPct}%`,
              minWidth: seg.endPct - seg.startPct < 3 ? "12px" : undefined,
            }}
            title={`${seg.label}: rows ${bands[seg.band]!.start_row}–${bands[seg.band]!.end_row}`}
          >
            <span className={seg.textClass}>{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Individual band row card ──────────────────────────

function BandRowCard({
  band,
  meta,
  range,
  onChange,
  onToggle,
  enabled,
  issues,
}: {
  band: keyof BandConfig;
  meta: BandMeta;
  range: BandRowRange | undefined;
  onChange: (band: keyof BandConfig, range: BandRowRange | undefined) => void;
  onToggle: (band: keyof BandConfig, enabled: boolean) => void;
  enabled: boolean;
  issues: BandIssue[];
}) {
  const bandIssues = issues.filter((i) => i.band === band);

  const handleStartChange = useCallback(
    (value: string) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      onChange(band, { start_row: num, end_row: range?.end_row ?? num });
    },
    [band, onChange, range],
  );

  const handleEndChange = useCallback(
    (value: string) => {
      const num = parseInt(value, 10);
      if (isNaN(num)) return;
      onChange(band, { start_row: range?.start_row ?? num, end_row: num });
    },
    [band, onChange, range],
  );

  return (
    <div
      className={cn(
        "relative rounded-lg border p-3 transition-colors",
        enabled
          ? "border-border bg-card"
          : "border-dashed border-muted-foreground/20 bg-muted/10",
        bandIssues.length > 0 && "border-destructive/40 bg-destructive/[0.02]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: toggle + label */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => onToggle(band, checked)}
            className="shrink-0"
          />
          <div className="min-w-0">
            <Label
              className={cn(
                "text-xs font-semibold cursor-pointer",
                enabled ? "text-foreground" : "text-muted-foreground line-through",
              )}
            >
              {meta.label}
            </Label>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              {meta.description}
            </p>
          </div>
        </div>

        {/* Right: row inputs */}
        {enabled && (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-1">
              <Label className="text-[10px] text-muted-foreground">Row</Label>
              <Input
                type="number"
                min={1}
                value={range?.start_row ?? 1}
                onChange={(e) => handleStartChange(e.target.value)}
                className="h-7 w-14 text-[11px] text-center tabular-nums"
                aria-label={`${meta.label} start row`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">&ndash;</span>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                value={range?.end_row ?? 1}
                onChange={(e) => handleEndChange(e.target.value)}
                className="h-7 w-14 text-[11px] text-center tabular-nums"
                aria-label={`${meta.label} end row`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Validation messages */}
      {bandIssues.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {bandIssues.map((issue, idx) => (
            <p
              key={idx}
              className={cn(
                "text-[10px] leading-tight",
                issue.type === "inverted" || issue.type === "zero"
                  ? "text-destructive"
                  : "text-amber-600 dark:text-amber-400",
              )}
            >
              {issue.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BandConfigEditor ──────────────────────────────────

export interface BandConfigEditorProps {
  /** Current band configuration (partial OK — missing = disabled) */
  bands: BandConfig;
  /** Called whenever any band value or enabled state changes */
  onChange: (bands: BandConfig) => void;
  /** Optional total row count in the template for validation */
  templateRowCount?: number;
  /** Optional visual max row for the ruler */
  maxRowCount?: number;
}

export default function BandConfigEditor({
  bands,
  onChange,
  templateRowCount,
  maxRowCount,
}: BandConfigEditorProps) {
  // Compute the visible row range for the ruler
  const rulerMaxRows = useMemo(() => {
    if (maxRowCount) return maxRowCount;
    if (templateRowCount) return templateRowCount;

    // Auto-detect from bands
    let max = 0;
    for (const key of Object.keys(bands) as (keyof BandConfig)[]) {
      const r = bands[key];
      if (r && r.end_row > max) max = r.end_row;
    }
    return Math.max(max, 10); // At least 10 rows for display
  }, [bands, templateRowCount, maxRowCount]);

  const issues = useMemo(
    () => validateBands(bands, templateRowCount),
    [bands, templateRowCount],
  );

  const handleBandChange = useCallback(
    (key: keyof BandConfig, range: BandRowRange | undefined) => {
      onChange({ ...bands, [key]: range });
    },
    [bands, onChange],
  );

  const handleToggle = useCallback(
    (key: keyof BandConfig, enabled: boolean) => {
      if (enabled) {
        // Enable with a sensible default range (first unused row range)
        onChange({ ...bands, [key]: { start_row: 1, end_row: 1 } });
      } else {
        const next = { ...bands };
        delete next[key];
        onChange(next);
      }
    },
    [bands, onChange],
  );

  // Count active bands
  const activeCount = useMemo(
    () => (Object.keys(bands) as (keyof BandConfig)[]).filter((k) => bands[k] !== undefined).length,
    [bands],
  );

  const hasErrors = useMemo(() => issues.some((i) => i.type === "inverted" || i.type === "zero"), [issues]);
  const hasWarnings = issues.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Band Configuration</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Map template rows to report sections — {activeCount} of {ALL_BANDS.length} active
            {hasWarnings && (
              <span
                className={cn(
                  "ml-2",
                  hasErrors ? "text-destructive" : "text-amber-500",
                )}
              >
                · {issues.length} issue{issues.length !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Visual ruler */}
      <RulerBar bands={bands} totalRows={rulerMaxRows} issues={issues} />

      {/* Band cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ALL_BANDS.map((meta) => (
          <BandRowCard
            key={meta.key}
            band={meta.key}
            meta={meta}
            range={bands[meta.key]}
            onChange={handleBandChange}
            onToggle={handleToggle}
            enabled={bands[meta.key] !== undefined}
            issues={issues}
          />
        ))}
      </div>

      {/* Footer info */}
      {templateRowCount && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
          <span>
            Template has <strong className="tabular-nums">{templateRowCount}</strong> rows
          </span>
          {activeCount > 0 && (
            <>
              <span>·</span>
              <span>
                Coverage:{" "}
                <strong className="tabular-nums">
                  {(() => {
                    const covered = new Set<number>();
                    for (const key of Object.keys(bands) as (keyof BandConfig)[]) {
                      const r = bands[key];
                      if (r) {
                        for (let i = r.start_row; i <= r.end_row; i++) {
                          if (i >= 1 && i <= templateRowCount) covered.add(i);
                        }
                      }
                    }
                    const pct = Math.round((covered.size / templateRowCount) * 100);
                    return `${covered.size} / ${templateRowCount} rows (${pct}%)`;
                  })()}
                </strong>
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}