// LabelControl — Access label → styled span
import { displayText } from "@/lib/utils";
import type { Control } from "@/types";

interface Props {
  ctrl: Control;
}

export default function LabelControl({ ctrl }: Props) {
  return (
    <span className="truncate select-none text-xs">
      {displayText(ctrl)}
    </span>
  );
}