// NumberRangeFilterControl — min/max number range filter
// Renders two number inputs and produces: field >= min AND field <= max
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Minus } from "lucide-react";
import type { FilterControlProps } from "./types";

export default function NumberRangeFilterControl({
  column,
  onApply,
  onCancel,
}: FilterControlProps) {
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");

  const handleApply = useCallback(() => {
    const parts: string[] = [];
    let name = column.label;

    // Build expression from whichever bounds are provided
    if (min !== "") {
      parts.push(`${column.field} >= ${Number(min)}`);
    }
    if (max !== "") {
      parts.push(`${column.field} <= ${Number(max)}`);
    }
    if (parts.length === 0) return;

    // Build a friendly name
    if (min !== "" && max !== "") {
      name = `${name}: ${min} – ${max}`;
    } else if (min !== "") {
      name = `${name} ≥ ${min}`;
    } else {
      name = `${name} ≤ ${max}`;
    }

    onApply(name, parts.join(" AND "));
  }, [min, max, column, onApply]);

  return (
    <div className="space-y-2" data-testid="number-filter-control">
      <p className="text-[11px] text-muted-foreground">
        Filter <span className="font-medium text-foreground">{column.label}</span> by range
      </p>
      <div className="flex items-center gap-1.5">
        <Input
          data-testid="number-filter-min"
          className="h-7 text-xs w-24"
          type="number"
          placeholder="Min"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApply();
            if (e.key === "Escape") onCancel();
          }}
          autoFocus
        />
        <Minus className="size-3 shrink-0 text-muted-foreground" />
        <Input
          data-testid="number-filter-max"
          className="h-7 text-xs w-24"
          type="number"
          placeholder="Max"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApply();
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
          disabled={min === "" && max === ""}
          data-testid="number-filter-apply"
        >
          Apply Filter
        </Button>
      </div>
    </div>
  );
}
