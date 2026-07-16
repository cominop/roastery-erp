// CheckBoxControl — Access check-box → shadcn Checkbox
import { Checkbox } from "@/components/ui/checkbox";
import { parseHotkeyText } from "@/lib/utils";
import type { Control } from "@/types";

interface Props {
  ctrl: Control;
  field: string | null;
  value: unknown;
  onChange: (field: string, value: unknown) => void;
  allowEdits: boolean;
  tabIdx?: number;
}

export default function CheckBoxControl({
  ctrl,
  field,
  value,
  onChange,
  allowEdits,
  tabIdx,
}: Props) {
  const caption = (ctrl.text as string) || ctrl.caption || "";

  return (
    <label className="flex items-center gap-1 text-xs cursor-pointer">
      <Checkbox
        checked={Boolean(value)}
        disabled={!allowEdits}
        tabIndex={tabIdx}
        onCheckedChange={(checked) => {
          if (field && allowEdits) onChange(field, checked);
        }}
      />
      {parseHotkeyText(caption).map((seg, i) =>
        typeof seg === "string" ? (
          <span key={i}>{seg}</span>
        ) : (
          <u key={i}>{seg.char}</u>
        )
      )}
    </label>
  );
}