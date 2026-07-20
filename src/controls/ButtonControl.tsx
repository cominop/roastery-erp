// ButtonControl — Access command-button → shadcn Button
import { Button } from "@/components/ui/button";
import { parseHotkeyText } from "@/lib/utils";
import type { Control } from "@/types";

interface Props {
  ctrl: Control;
  tabIdx?: number;
  onClick?: (ctrlName: string) => void;
}

export default function ButtonControl({ ctrl, tabIdx, onClick }: Props) {
  const caption = (ctrl.text as string) || ctrl.caption || "Button";

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-full w-full text-xs font-normal justify-start rounded-[var(--app-field-border-radius,6px)]"
      tabIndex={tabIdx}
      onClick={() => onClick?.(ctrl.name)}
    >
      {parseHotkeyText(caption).map((seg, i) =>
        typeof seg === "string" ? (
          <span key={i}>{seg}</span>
        ) : (
          <u key={i}>{seg.char}</u>
        )
      )}
    </Button>
  );
}