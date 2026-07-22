// BooleanFilterControl — true/false/any dropdown filter
// Renders a three-option dropdown and produces: field = value (or no filter for Any)
import { useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { FilterControlProps } from "./types";

type BoolOption = "" | "true" | "false";

export default function BooleanFilterControl({
  column,
  onApply,
  onCancel,
}: FilterControlProps) {
  const [value, setValue] = useState<BoolOption>("");

  const handleApply = useCallback(() => {
    if (!value) return;
    const boolVal = value === "true";
    onApply(
      `${column.label}: ${boolVal ? "Yes" : "No"}`,
      `${column.field} = ${boolVal}`
    );
  }, [value, column, onApply]);

  return (
    <div className="space-y-2" data-testid="boolean-filter-control">
      <p className="text-[11px] text-muted-foreground">
        Filter <span className="font-medium text-foreground">{column.label}</span> by value
      </p>
      <Select
        value={value}
        onValueChange={(v) => setValue(v as BoolOption)}
      >
        <SelectTrigger
          data-testid="boolean-filter-select"
          className="w-full h-7 text-xs"
        >
          <SelectValue placeholder="Select a value..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true" data-testid="boolean-option-true">
            Yes
          </SelectItem>
          <SelectItem value="false" data-testid="boolean-option-false">
            No
          </SelectItem>
        </SelectContent>
      </Select>
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={handleApply}
          disabled={!value}
          data-testid="boolean-filter-apply"
        >
          Apply Filter
        </Button>
      </div>
    </div>
  );
}
