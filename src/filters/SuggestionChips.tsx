// SuggestionChips — reusable quick-pick chip bar for filter controls
// Renders a horizontal row of small clickable buttons that populate
// a filter control with a suggested value (text, range, date, etc.).
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { FieldSuggestion } from "./fieldPatterns";

interface SuggestionChipsProps<T = string> {
  /** Text label displayed above the chips */
  label: string;
  /** Array of suggestion chips to render */
  suggestions: FieldSuggestion<T>[];
  /** Callback fired when a chip is clicked — receives the suggestion's value */
  onSelect: (value: T) => void;
  /** Optional class name */
  className?: string;
}

export default function SuggestionChips<T>({
  label,
  suggestions,
  onSelect,
  className,
}: SuggestionChipsProps<T>) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {suggestions.map((s, i) => (
          <SuggestionChip
            key={`${s.label}-${i}`}
            suggestion={s}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

interface ChipProps<T> {
  suggestion: FieldSuggestion<T>;
  onSelect: (value: T) => void;
}

function SuggestionChip<T>({ suggestion, onSelect }: ChipProps<T>) {
  const handleClick = useCallback(() => {
    onSelect(suggestion.value);
  }, [onSelect, suggestion.value]);

  return (
    <button
      type="button"
      title={suggestion.description ?? suggestion.label}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center rounded-md border border-border/60",
        "px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
        "hover:bg-accent hover:text-accent-foreground hover:border-border",
        "transition-colors cursor-pointer select-none"
      )}
    >
      {suggestion.label}
    </button>
  );
}
