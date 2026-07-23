// TextFilterControl — ILIKE / contains text filter
// Renders a text input and produces: field ILIKE '%value%'
// Supports smart suggestion chips based on field name patterns.
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import type { FilterControlProps } from "./types";
import { getFieldDefaults } from "./fieldPatterns";
import SuggestionChips from "./SuggestionChips";

export default function TextFilterControl({
  column,
  onApply,
  onCancel,
}: FilterControlProps) {
  const [value, setValue] = useState("");

  const defaults = getFieldDefaults(column);
  const suggestions = defaults.textSuggestions;

  const handleApply = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const escaped = trimmed.replace(/'/g, "''");
    onApply(
      `${column.label} contains "${trimmed}"`,
      `${column.field} ILIKE '%${escaped}%'`
    );
  }, [value, column, onApply]);

  const handleSuggestion = useCallback((suggestion: string) => {
    setValue(suggestion);
  }, []);

  return (
    <div className="space-y-2" data-testid="text-filter-control">
      <p className="text-[11px] text-muted-foreground">
        Filter <span className="font-medium text-foreground">{column.label}</span> by text
      </p>

      {suggestions && suggestions.length > 0 && (
        <SuggestionChips
          label="Suggestions"
          suggestions={suggestions}
          onSelect={handleSuggestion}
        />
      )}

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            data-testid="text-filter-input"
            className="h-7 pl-6 text-xs"
            placeholder={`Search ${column.label}...`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApply();
              if (e.key === "Escape") onCancel();
            }}
            autoFocus
          />
        </div>
        {value && (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => setValue("")}
            aria-label="Clear"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={handleApply}
          disabled={!value.trim()}
          data-testid="text-filter-apply"
        >
          Apply Filter
        </Button>
      </div>
    </div>
  );
}
