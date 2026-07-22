// DateRangeFilterControl — from/to date range filter
// Renders two native date inputs and produces: field >= 'YYYY-MM-DD' AND field <= 'YYYY-MM-DD'
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Minus } from "lucide-react";
import type { FilterControlProps } from "./types";

export default function DateRangeFilterControl({
  column,
  onApply,
  onCancel,
}: FilterControlProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const handleApply = useCallback(() => {
    const parts: string[] = [];
    let name = column.label;

    if (from) {
      parts.push(`${column.field} >= '${from}'`);
    }
    if (to) {
      parts.push(`${column.field} <= '${to}'`);
    }
    if (parts.length === 0) return;

    if (from && to) {
      name = `${name}: ${from} → ${to}`;
    } else if (from) {
      name = `${name} from ${from}`;
    } else {
      name = `${name} until ${to}`;
    }

    onApply(name, parts.join(" AND "));
  }, [from, to, column, onApply]);

  return (
    <div className="space-y-2" data-testid="date-filter-control">
      <p className="text-[11px] text-muted-foreground">
        Filter <span className="font-medium text-foreground">{column.label}</span> by date range
      </p>
      <div className="flex items-center gap-1.5">
        <Input
          data-testid="date-filter-from"
          className="h-7 text-xs w-36"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        />
        <Minus className="size-3 shrink-0 text-muted-foreground" />
        <Input
          data-testid="date-filter-to"
          className="h-7 text-xs w-36"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={handleApply}
          disabled={!from && !to}
          data-testid="date-filter-apply"
        >
          Apply Filter
        </Button>
      </div>
    </div>
  );
}
