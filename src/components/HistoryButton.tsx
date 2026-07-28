// HistoryButton — a small clock icon in the form caption bar that toggles audit history
import { Clock } from "lucide-react";

interface Props {
  /** Whether the button is active (history panel open) */
  active: boolean;
  /** Whether history is available (record selected, not a new record) */
  disabled?: boolean;
  /** Toggle handler */
  onClick: () => void;
}

export default function HistoryButton({ active, disabled, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="View record history"
      className={`inline-flex items-center justify-center size-5 rounded transition-colors
        ${active
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50"
        }
        disabled:opacity-30 disabled:cursor-not-allowed
      `}
    >
      <Clock className="size-3" />
    </button>
  );
}