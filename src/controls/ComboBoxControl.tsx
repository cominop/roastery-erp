// ComboBoxControl — Access combo-box → shadcn Select
import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLookupData } from "@/hooks";
import type { Control } from "@/types";

interface Props {
  ctrl: Control;
  field: string | null;
  value: unknown;
  onChange: (field: string, value: unknown) => void;
  allowEdits: boolean;
  tabIdx?: number;
}

function parseColumnWidths(s: string | undefined): number[] | null {
  if (!s?.trim()) return null;
  return s.split(";").map((p) => {
    const n = parseFloat(p.replace(/[a-zA-Z]+/g, "").trim());
    return isNaN(n) ? 1 : n;
  });
}

function buildOptionDisplay(
  row: Record<string, unknown>,
  fields: string[],
  boundCol: number | undefined,
  colWidths: number[] | null
): [string, string] {
  const boundIdx = Math.max(0, (boundCol ?? 1) - 1);
  const boundKey = boundIdx < fields.length ? fields[boundIdx] : fields[0];
  const boundVal = String(row[boundKey] ?? "");
  const visibleTexts = fields
    .map((fname, i) => {
      const w = colWidths ? colWidths[i] : undefined;
      if (w !== undefined && w <= 0) return null;
      return String(row[fname] ?? "");
    })
    .filter(Boolean) as string[];
  return [boundVal, visibleTexts.length > 0 ? visibleTexts.join(" - ") : boundVal];
}

export default function ComboBoxControl({
  ctrl,
  field,
  value,
  onChange,
  allowEdits,
}: Props) {
  const rowSource = ctrl["row-source"] as string | undefined;
  const { rows, fields: lookupFields } = useLookupData(rowSource);

  const colWidths = parseColumnWidths(ctrl["column-widths"] as string | undefined);
  const boundCol = ctrl["bound-column"] as number | undefined;
  const fieldNames = lookupFields.length > 0 ? lookupFields : [];

  return (
    <Select
      value={String(value ?? "")}
      disabled={!allowEdits}
      onValueChange={(v) => {
        if (field && allowEdits) onChange(field, v);
      }}
    >
      <SelectTrigger className="h-full w-full text-xs rounded-none border-0">
        <SelectValue placeholder="" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">&nbsp;</SelectItem>
        {rows.map((row, idx) => {
          const [bv, display] = buildOptionDisplay(row, fieldNames, boundCol, colWidths);
          return (
            <SelectItem key={idx} value={bv}>
              {display}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}