import { Minus, Square, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormWindowState } from "./form-window-types";

interface TitleBarProps {
  title: string;
  state: FormWindowState;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  className?: string;
}

export default function FormWindowTitleBar({
  title,
  state,
  onMinimize,
  onMaximize,
  onClose,
  className = "",
}: TitleBarProps) {
  return (
    <div className={`flex items-center gap-1 px-2 py-1.5 border-b bg-muted/20 select-none shrink-0 ${className}`}>
      <span className="text-xs font-medium truncate flex-1">{title}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        aria-label="Minimize window"
        onClick={onMinimize}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        aria-label={state === "maximized" ? "Restore window" : "Maximize window"}
        onClick={onMaximize}
      >
        {state === "maximized" ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-5 w-5 hover:bg-destructive/20 hover:text-destructive"
        aria-label="Close window"
        onClick={onClose}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}