// LookupFilterControl — dropdown populated from a data source
// Fetches distinct values via the API and produces: field = value
import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { FilterControlProps } from "./types";

interface LookupOption {
  value: string;
  label: string;
}

export default function LookupFilterControl({
  column,
  onApply,
  onCancel,
}: FilterControlProps) {
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const source = column.lookupSource || column.field;
    setLoading(true);
    setError(null);

    // Fetch distinct values from the API
    api
      .getRecords(source, { limit: 500 })
      .then((res) => {
        // Deduplicate values from the returned rows
        const seen = new Set<string>();
        const opts: LookupOption[] = [];
        for (const row of res.rows) {
          const raw = row[column.field];
          if (raw == null) continue;
          const label = String(raw);
          if (seen.has(label)) continue;
          seen.add(label);
          opts.push({ value: label, label });
        }
        // Sort alphabetically
        opts.sort((a, b) => a.label.localeCompare(b.label));
        setOptions(opts);
      })
      .catch((e) => {
        setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, [column]);

  const handleApply = useCallback(() => {
    if (!selected) return;
    const escaped = selected.replace(/'/g, "''");
    onApply(
      `${column.label}: ${selected}`,
      `${column.field} = '${escaped}'`
    );
  }, [selected, column, onApply]);

  return (
    <div className="space-y-2" data-testid="lookup-filter-control">
      <p className="text-[11px] text-muted-foreground">
        Filter <span className="font-medium text-foreground">{column.label}</span> by value
      </p>

      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
          <Loader2 className="size-3 animate-spin" />
          Loading values...
        </div>
      ) : error ? (
        <p className="text-xs text-red-500 py-1">{error}</p>
      ) : options.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">No values found</p>
      ) : (
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger
            data-testid="lookup-filter-select"
            className="w-full h-7 text-xs"
          >
            <SelectValue placeholder="Select a value..." />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={handleApply}
          disabled={!selected || loading}
          data-testid="lookup-filter-apply"
        >
          Apply Filter
        </Button>
      </div>
    </div>
  );
}
