/**
 * EventHandlerEditorPage — Full-page wrapper for the event handler editor
 *
 * Renders a header with breadcrumb navigation, "Event Handlers" title,
 * and the EventHandlerEditor component beneath.
 */
import EventHandlerEditor from "@/components/EventHandlerEditor";
import { Code, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EventHandlerEditorPageProps {
  onBack?: () => void;
}

export default function EventHandlerEditorPage({ onBack }: EventHandlerEditorPageProps) {
  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ──────────────────────────────────────── */}
      <div className="shrink-0 border-b bg-muted/10 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {onBack && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onBack}
              className="mr-1"
            >
              <ArrowLeft className="h-3 w-3" />
            </Button>
          )}
          <span>Admin</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-foreground/70 font-medium">Event Handlers</span>
        </div>
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Event Handler Editor</h1>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            Admin
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Manage hierarchical event handlers — item-level, group-level, and task-level dispatch chain.
        </p>
      </div>

      {/* ─── Editor content ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <EventHandlerEditor />
      </div>
    </div>
  );
}
