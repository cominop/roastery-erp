// AuditDiffView — old/new value diff per field for a single audit entry
// Used inline (HistoryPanel) and as a dialog (AuditLogPage)
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { AuditEntry } from "@/lib/api";

interface Props {
  entry: AuditEntry;
  /** Compact mode for inline display inside timeline entries */
  compact?: boolean;
}

// ─── Value formatting ─────────────────────────────────

function fmt(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") {
    const t = val.trim();
    if (t === "") return "(empty)";
    // Try to pretty-print ISO dates
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) {
      try {
        return new Date(t).toLocaleString("en-CA", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return t;
      }
    }
    return t.length > 120 ? t.slice(0, 120) + "…" : t;
  }
  if (Array.isArray(val)) return JSON.stringify(val).slice(0, 120);
  if (typeof val === "object") return JSON.stringify(val).slice(0, 120);
  return String(val).slice(0, 120);
}

// ─── Diff rows computation ────────────────────────────

interface DiffRow {
  field: string;
  oldVal: string | null;  // null = no old value (INSERT)
  newVal: string | null;  // null = no new value (DELETE)
  changed: boolean;
}

function computeDiff(entry: AuditEntry): DiffRow[] {
  const oldKeys = entry.old_data ? Object.keys(entry.old_data) : [];
  const newKeys = entry.new_data ? Object.keys(entry.new_data) : [];
  const allKeys = new Set([...oldKeys, ...newKeys]);
  const rows: DiffRow[] = [];

  for (const key of allKeys) {
    // Skip internal/pseudo fields
    if (key === "id" || key.endsWith("_id") && key !== "record_id") continue;

    const ov = entry.old_data?.[key] ?? null;
    const nv = entry.new_data?.[key] ?? null;
    rows.push({
      field: key,
      oldVal: ov !== null ? fmt(ov) : null,
      newVal: nv !== null ? fmt(nv) : null,
      changed: JSON.stringify(ov) !== JSON.stringify(nv),
    });
  }

  return rows;
}

// ─── Entry header ─────────────────────────────────────

function entryIcon(action: string) {
  switch (action) {
    case "INSERT": return <Plus className="size-3 text-green-600" />;
    case "UPDATE": return <Pencil className="size-3 text-amber-600" />;
    case "DELETE": return <Trash2 className="size-3 text-red-600" />;
    default: return null;
  }
}

function entryColor(action: string) {
  switch (action) {
    case "INSERT": return "text-green-600";
    case "UPDATE": return "text-amber-600";
    case "DELETE": return "text-red-600";
    default: return "text-muted-foreground";
  }
}

// ─── Component ────────────────────────────────────────

export default function AuditDiffView({ entry, compact }: Props) {
  const rows = computeDiff(entry);

  if (compact) {
    return <CompactDiff rows={rows} entry={entry} />;
  }

  return <FullDiff rows={rows} entry={entry} />;
}

// ─── Full diff (dialog / standalone) ──────────────────

function FullDiff({ rows, entry }: { rows: DiffRow[]; entry: AuditEntry }) {
  const changedCount = rows.filter((r) => r.changed).length;

  return (
    <div className="text-xs">
      {/* Entry metadata bar */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b text-[11px] text-muted-foreground">
        <span className={`inline-flex items-center gap-1 font-medium ${entryColor(entry.action)}`}>
          {entryIcon(entry.action)}
          {entry.action === "INSERT" ? "Created" : entry.action === "UPDATE" ? "Edited" : "Deleted"}
        </span>
        <span>{entry.table_name} #{entry.record_id}</span>
        {entry.changed_by_name && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{entry.changed_by_name}</span>
          </>
        )}
        <span className="text-muted-foreground/40">·</span>
        <span>{new Date(entry.changed_at).toLocaleString("en-CA", {
          year: "numeric", month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit",
        })}</span>
      </div>

      {/* No changes placeholder */}
      {entry.action === "UPDATE" && changedCount === 0 && (
        <div className="py-4 text-center text-muted-foreground/50 italic">
          No field-level changes recorded for this entry
        </div>
      )}

      {/* Diff table */}
      <div className="rounded border overflow-hidden">
        {/* Header */}
        <div className="flex text-[10px] font-semibold uppercase text-muted-foreground bg-muted/30 border-b">
          <div className="w-1/3 px-2.5 py-1.5">Field</div>
          {(entry.action === "UPDATE" || entry.action === "DELETE") && (
            <div className="w-1/3 px-2.5 py-1.5 border-l">Old Value</div>
          )}
          {(entry.action === "UPDATE" || entry.action === "INSERT") && (
            <div className="w-1/3 px-2.5 py-1.5 border-l">New Value</div>
          )}
          {entry.action === "UPDATE" && (
            <div className="w-10 px-2.5 py-1.5 border-l text-center">Status</div>
          )}
        </div>

        {/* Rows */}
        {(entry.action === "INSERT" || entry.action === "DELETE"
          ? rows
          : rows.filter((r) => r.changed)
        ).map((r, i) => (
          <div
            key={r.field}
            className={`flex text-[11px] ${
              i % 2 === 1 ? "bg-muted/10" : ""
            }`}
          >
            <div className="w-1/3 px-2.5 py-1.5 font-mono text-foreground truncate border-r">
              {r.field}
            </div>
            {entry.action !== "INSERT" && (
              <div className={`w-1/3 px-2.5 py-1.5 font-mono truncate border-r ${
                r.changed ? "text-red-600 dark:text-red-400 line-through" : "text-muted-foreground"
              }`}>
                {r.oldVal ?? "—"}
              </div>
            )}
            {entry.action !== "DELETE" && (
              <div className={`w-1/3 px-2.5 py-1.5 font-mono truncate border-r ${
                r.changed ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
              }`}>
                {r.newVal ?? "—"}
              </div>
            )}
            {entry.action === "UPDATE" && (
              <div className="w-10 px-2.5 py-1.5 flex items-center justify-center">
                <span className={`inline-block size-1.5 rounded-full ${
                  r.changed ? "bg-amber-400" : "bg-muted-foreground/30"
                }`} title={r.changed ? "Changed" : "Unchanged"} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary footer */}
      {entry.action === "UPDATE" && (
        <div className="mt-2 text-[10px] text-muted-foreground/60">
          {changedCount} field{changedCount !== 1 ? "s" : ""} changed
          {rows.length > changedCount
            ? ` (${rows.length - changedCount} unchanged fields hidden)`
            : ""}
        </div>
      )}
    </div>
  );
}

// ─── Compact diff (inline in HistoryPanel timeline) ───

function CompactDiff({ rows, entry }: { rows: DiffRow[]; entry: AuditEntry }) {
  const changedRows = rows.filter((r) => r.changed);
  const displayRows = entry.action === "UPDATE" ? changedRows : rows;

  if (displayRows.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground/50 italic mt-1">
        No field changes
      </div>
    );
  }

  return (
    <div className="mt-1.5 space-y-0.5">
      {displayRows.slice(0, 8).map((r) => (
        <div key={r.field} className="flex items-start gap-1 text-[10px] leading-tight">
          <span className="font-mono text-muted-foreground/60 shrink-0 w-[72px] truncate">
            {r.field}
          </span>
          {entry.action === "UPDATE" ? (
            <>
              <span className="text-red-600 dark:text-red-400 line-through truncate shrink min-w-0 max-w-[80px]">
                {r.oldVal}
              </span>
              <span className="text-muted-foreground/40 shrink-0">→</span>
              <span className="text-green-700 dark:text-green-400 truncate shrink min-w-0 max-w-[80px]">
                {r.newVal}
              </span>
            </>
          ) : entry.action === "INSERT" ? (
            <span className="text-green-700 dark:text-green-400 truncate shrink min-w-0">
              {r.newVal}
            </span>
          ) : (
            <span className="text-red-600 dark:text-red-400 line-through truncate shrink min-w-0">
              {r.oldVal}
            </span>
          )}
        </div>
      ))}
      {displayRows.length > 8 && (
        <div className="text-[10px] text-muted-foreground/40 pl-[76px]">
          +{displayRows.length - 8} more field{displayRows.length - 8 !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}