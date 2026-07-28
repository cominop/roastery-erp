// AuditRetentionPanel — retention policy configuration + manual pruning UI
import { useState, useEffect, useCallback } from "react";
import { RotateCw, Trash2, Save, AlertTriangle, Info, Clock } from "lucide-react";
import { getRetentionConfig, updateRetentionConfig, triggerPrune, getPruneStats } from "@/lib/api";
import type { RetentionConfig, PruneStats, PruneStatsTable, PruneResult } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// ─── Helpers ──────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-CA", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ─── Component ────────────────────────────────────────

export default function AuditRetentionPanel() {
  const [config, setConfig] = useState<RetentionConfig | null>(null);
  const [stats, setStats] = useState<PruneStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [pruningDry, setPruningDry] = useState(false);
  const [pruneResult, setPruneResult] = useState<PruneResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Editable fields
  const [defaultDays, setDefaultDays] = useState(365);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, st] = await Promise.all([
        getRetentionConfig(),
        getPruneStats(),
      ]);
      setConfig(cfg);
      setStats(st);
      setDefaultDays(cfg.default_retention_days);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSaveDefault = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await updateRetentionConfig({ default_retention_days: defaultDays });
      setSuccessMsg(`Default retention updated to ${defaultDays} days`);
      fetchAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePrune = async (dryRun: boolean) => {
    if (dryRun) setPruningDry(true); else setPruning(true);
    setError(null);
    setPruneResult(null);
    setSuccessMsg(null);
    try {
      const res = await triggerPrune({ dry_run: dryRun });
      setPruneResult(res.pruned);
      if (!dryRun) {
        const total = res.pruned.reduce((s, r) => s + r.entries_pruned, 0);
        setSuccessMsg(`Pruned ${total} entries across ${res.pruned.length} tables`);
        fetchAll();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPruningDry(false);
      setPruning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground/60 text-xs gap-1.5">
        <RotateCw className="size-3 animate-spin" />
        Loading retention config...
      </div>
    );
  }

  const totalPrunable = stats?.summary?.total_prunable ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4 text-xs overflow-y-auto">
      {/* ─── Summary cards ─────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Clock className="size-3.5" />}
          label="Total Entries"
          value={config ? fmtCount(config.stats.total_entries) : "—"}
        />
        <StatCard
          icon={<Info className="size-3.5" />}
          label="Tables Tracked"
          value={config ? String(config.stats.table_count) : "—"}
        />
        <StatCard
          icon={<AlertTriangle className="size-3.5" />}
          label="Prunable Entries"
          value={stats ? fmtCount(totalPrunable) : "—"}
          className={totalPrunable > 0 ? "text-amber-600 dark:text-amber-400" : ""}
        />
        <StatCard
          icon={<RotateCw className="size-3.5" />}
          label="Default Retention"
          value={`${defaultDays}d`}
        />
      </div>

      {/* ─── Error / Success ───────────────────────────── */}
      {error && (
        <div className="p-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 rounded border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-2 text-xs text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 rounded border border-green-200 dark:border-green-900">
          {successMsg}
        </div>
      )}

      {/* ─── Default retention ─────────────────────────── */}
      <div className="rounded border p-3 space-y-2">
        <div className="font-medium text-muted-foreground">Default Retention Policy</div>
        <p className="text-[10px] text-muted-foreground/50">
          Entries older than this many days will be pruned automatically.
          Per-table overrides below take precedence over this default.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={99999}
            value={defaultDays}
            onChange={(e) => setDefaultDays(Math.max(1, parseInt(e.target.value) || 0))}
            className="h-7 w-24 text-xs"
          />
          <span className="text-muted-foreground">days</span>
          {config && config.default_retention_days !== defaultDays && (
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveDefault}
              disabled={saving}
              className="h-7 text-xs gap-1"
            >
              {saving ? <RotateCw className="size-3 animate-spin" /> : <Save className="size-3" />}
              Save
            </Button>
          )}
          {config?.default_last_pruned_at && (
            <span className="text-[10px] text-muted-foreground/40 ml-auto">
              Last prune: {fmtDate(config.default_last_pruned_at)}
            </span>
          )}
        </div>
      </div>

      {/* ─── Per-table overrides ───────────────────────── */}
      {config && config.overrides.length > 0 && (
        <div className="rounded border overflow-hidden">
          <div className="p-2.5 border-b bg-muted/20 font-medium text-muted-foreground">
            Per-Table Overrides ({config.overrides.length})
          </div>
          <div className="divide-y max-h-48 overflow-y-auto">
            {config.overrides.map((ov) => (
              <div key={ov.id} className="flex items-center justify-between px-2.5 py-1.5">
                <span className="font-mono text-[11px]">{ov.table_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/60">
                    {ov.retention_days}d · last prune: {fmtDate(ov.last_pruned_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Actions ───────────────────────────────────── */}
      <div className="rounded border p-3 space-y-2">
        <div className="font-medium text-muted-foreground">Pruning Actions</div>
        <p className="text-[10px] text-muted-foreground/50">
          Dry run previews what would be pruned without deleting anything.
          Live prune immediately removes entries older than their configured retention.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrune(true)}
            disabled={pruningDry || pruning}
            className="h-7 text-xs gap-1"
          >
            {pruningDry ? (
              <RotateCw className="size-3 animate-spin" />
            ) : (
              <Info className="size-3" />
            )}
            Dry Run
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handlePrune(false)}
            disabled={pruning || pruningDry || totalPrunable === 0}
            className="h-7 text-xs gap-1"
          >
            {pruning ? (
              <RotateCw className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
            Prune Now ({fmtCount(totalPrunable)})
          </Button>
        </div>
      </div>

      {/* ─── Prune result table ────────────────────────── */}
      {pruneResult && pruneResult.length > 0 && (
        <div className="rounded border overflow-hidden">
          <div className="p-2.5 border-b bg-muted/20 font-medium text-muted-foreground">
            Prune Results
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[10px] font-semibold text-muted-foreground border-b bg-muted/10">
                  <th className="text-left px-2.5 py-1.5">Table</th>
                  <th className="text-right px-2.5 py-1.5">Retention</th>
                  <th className="text-right px-2.5 py-1.5">Before</th>
                  <th className="text-right px-2.5 py-1.5">Pruned</th>
                  <th className="text-left px-2.5 py-1.5">Cutoff</th>
                  <th className="text-left px-2.5 py-1.5">Oldest Kept</th>
                </tr>
              </thead>
              <tbody>
                {pruneResult.map((r) => (
                  <tr key={r.table_name} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-2.5 py-1.5 font-mono">{r.table_name}</td>
                    <td className="px-2.5 py-1.5 text-right">{r.retention_days}d</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtCount(r.entries_before)}</td>
                    <td className={`px-2.5 py-1.5 text-right tabular-nums font-medium ${
                      r.entries_pruned > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground/50"
                    }`}>
                      {fmtCount(r.entries_pruned)}
                    </td>
                    <td className="px-2.5 py-1.5 text-muted-foreground">{fmtDate(r.cutoff_date)}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground">{fmtDate(r.oldest_kept)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Table-level stats ─────────────────────────── */}
      {stats && stats.tables.length > 0 && (
        <div className="rounded border overflow-hidden">
          <div className="p-2.5 border-b bg-muted/20 font-medium text-muted-foreground">
            Table Retention Status ({stats.tables.length} tables)
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-background">
                <tr className="text-[10px] font-semibold text-muted-foreground border-b bg-muted/10">
                  <th className="text-left px-2.5 py-1.5">Table</th>
                  <th className="text-right px-2.5 py-1.5">Retention</th>
                  <th className="text-right px-2.5 py-1.5">Entries</th>
                  <th className="text-right px-2.5 py-1.5">Prunable</th>
                  <th className="text-left px-2.5 py-1.5">Oldest</th>
                  <th className="text-left px-2.5 py-1.5">Last Pruned</th>
                </tr>
              </thead>
              <tbody>
                {stats.tables.map((t: PruneStatsTable) => (
                  <tr key={t.table_name} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-2.5 py-1.5 font-mono">
                      {t.table_name}
                      {t.has_override && (
                        <span className="ml-1 text-[9px] text-amber-500 font-medium">OV</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">
                      {t.effective_retention_days}d
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">
                      {fmtCount(t.entry_count)}
                    </td>
                    <td className={`px-2.5 py-1.5 text-right tabular-nums ${
                      t.prunable_count > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground/50"
                    }`}>
                      {fmtCount(t.prunable_count)}
                    </td>
                    <td className="px-2.5 py-1.5 text-muted-foreground text-[10px]">
                      {fmtDate(t.oldest_entry)}
                    </td>
                    <td className="px-2.5 py-1.5 text-muted-foreground text-[10px]">
                      {fmtDate(t.last_pruned_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat card sub-component ──────────────────────────

function StatCard({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded border p-2.5 flex items-center gap-2.5">
      <div className="text-muted-foreground/40 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground/60 truncate">{label}</div>
        <div className={`text-sm font-semibold tabular-nums ${className || "text-foreground"}`}>
          {value}
        </div>
      </div>
    </div>
  );
}