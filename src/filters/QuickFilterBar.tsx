// QuickFilterBar — preset shortcut buttons displayed above the data table
// Each preset is a toggleable quick filter that integrates with the useFilters system.
// Clicking an inactive preset applies it; clicking an active preset removes it.
import { useCallback } from "react";
import {
  Filter,
  CheckCircle,
  Clock,
  TrendingUp,
  Star,
  Zap,
  Archive,
  AlertCircle,
  DollarSign,
  Users,
  Package,
  ShoppingCart,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterItem } from "@/hooks/useFilters";

// ─── Icon mapping ──────────────────────────────────────

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  filter: Filter,
  check: CheckCircle,
  clock: Clock,
  trend: TrendingUp,
  star: Star,
  zap: Zap,
  archive: Archive,
  alert: AlertCircle,
  dollar: DollarSign,
  users: Users,
  package: Package,
  cart: ShoppingCart,
  calendar: Calendar,
};

// ─── Types ─────────────────────────────────────────────

export interface QuickFilterPreset {
  /** Unique identifier for this preset */
  id: string;
  /** Display label on the button */
  label: string;
  /** Filter name prefix (will be stored as "preset:<id>" for tracking) */
  name?: string;
  /** SQL expression for the filter */
  expression: string;
  /** Optional icon key from the iconMap above */
  icon?: string;
  /** Optional description shown as tooltip */
  description?: string;
}

interface QuickFilterBarProps {
  /** Available presets */
  presets: QuickFilterPreset[];
  /** Current filters from useFilters (to check which presets are active) */
  filters: FilterItem[];
  /** Add a new filter */
  addFilter: (name: string, expression: string) => string;
  /** Remove a filter by id */
  removeFilter: (id: string) => void;
  /** Optional class name */
  className?: string;
}

// ─── Helpers ───────────────────────────────────────────

/** The stored name for a preset filter — namespace prefix avoids collision with user filters */
export function presetFilterName(preset: QuickFilterPreset): string {
  return `preset:${preset.id}`;
}

/** Check whether a given preset is currently active in the filter list */
export function isPresetActive(
  preset: QuickFilterPreset,
  filters: FilterItem[]
): boolean {
  return filters.some((f) => f.name === presetFilterName(preset));
}

/** Find the filter item matching a preset, or undefined */
export function findPresetFilter(
  preset: QuickFilterPreset,
  filters: FilterItem[]
): FilterItem | undefined {
  return filters.find((f) => f.name === presetFilterName(preset));
}

// ─── Component ─────────────────────────────────────────

export default function QuickFilterBar({
  presets,
  filters,
  addFilter,
  removeFilter,
  className,
}: QuickFilterBarProps) {
  const handleToggle = useCallback(
    (preset: QuickFilterPreset) => {
      if (isPresetActive(preset, filters)) {
        // Remove the preset filter
        const match = findPresetFilter(preset, filters);
        if (match) {
          removeFilter(match.id);
        }
      } else {
        // Add the preset filter — namespace with "preset:" prefix
        addFilter(presetFilterName(preset), preset.expression);
      }
    },
    [filters, addFilter, removeFilter]
  );

  if (presets.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-border",
        className
      )}
      data-testid="quick-filter-bar"
    >
      {presets.map((preset) => {
        const active = isPresetActive(preset, filters);
        const IconComponent = preset.icon ? iconMap[preset.icon] : undefined;

        return (
          <button
            key={preset.id}
            type="button"
            data-testid={`quick-filter-${preset.id}`}
            data-active={active ? "true" : "false"}
            title={preset.description ?? preset.label}
            onClick={() => handleToggle(preset)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer select-none",
              active
                ? "bg-primary/15 border-primary/40 text-primary shadow-sm"
                : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {IconComponent && <IconComponent className="size-3" />}
            <span>{preset.label}</span>
            {active && (
              <span className="inline-block size-1.5 rounded-full bg-primary ml-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}