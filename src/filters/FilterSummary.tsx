// FilterSummary — compact inline filter chips for collapsed state
// Shows active filters as small badges with a remove button on each.
import type { FilterItem } from "@/hooks/useFilters";
import { X } from "lucide-react";

interface FilterSummaryProps {
  /** Active filters to display as chips */
  filters: FilterItem[];
  /** Called when a filter's X button is clicked */
  onRemove: (id: string) => void;
  /** Called when a filter name/chip is clicked (toggle) */
  onToggle: (id: string) => void;
}

export default function FilterSummary({
  filters,
  onRemove,
  onToggle,
}: FilterSummaryProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="filter-summary">
      {filters.map((f) => (
        <span
          key={f.id}
          data-testid={`filter-chip-${f.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary cursor-pointer hover:bg-primary/20 transition-colors"
          onClick={() => onToggle(f.id)}
          title={`${f.name}: ${f.expression}`}
        >
          <span className="max-w-32 truncate">{f.name}</span>
          <span
            data-testid={`filter-chip-remove-${f.id}`}
            role="button"
            tabIndex={0}
            className="inline-flex items-center justify-center rounded-sm p-0.5 text-primary/60 hover:text-primary hover:bg-primary/20 transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(f.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onRemove(f.id);
              }
            }}
            aria-label={`Remove filter: ${f.name}`}
          >
            <X className="size-3" />
          </span>
        </span>
      ))}
    </div>
  );
}
