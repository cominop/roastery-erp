// EventProvider — React context for dispatching form events
// Client-side event engine (SPEC §4.2)

import { createContext, useContext, useCallback, useRef } from "react";
import * as api from "@/lib/api";

// ─── Types ────────────────────────────────────────────

export interface DispatchHandlerInfo {
  id: string;
  vba_control: string | null;
  language: string;
  enabled: boolean;
  description: string | null;
}

export interface DispatchChainLink {
  level: string;
  handler_count: number;
  handlers: DispatchHandlerInfo[];
}

export interface DispatchResult {
  formName: string;
  eventName: string;
  group: string | null;
  totalHandlers: number;
  chain: DispatchChainLink[];
  stopped_at: string | null;
  stopped_handler_id: string | null;
}

export interface EventContextValue {
  /** Dispatch a form event through the item → group → task chain */
  dispatchFormEvent: (
    formName: string,
    eventName: string,
    context?: Record<string, unknown>
  ) => Promise<DispatchResult>;

  /** Check if a form has any handlers for a given event */
  hasHandlers: (formName: string, eventName: string) => Promise<boolean>;

  /** Event dispatch history (for debugging) */
  lastDispatch: React.MutableRefObject<DispatchResult | null>;
}

// ─── Event name mapping ───────────────────────────────
// Maps VBA form events → Event Propagation event names
// Also produces the reverse: from form definition event keys

export const VBA_TO_EVENT: Record<string, string> = {
  "on-load": "on_load",
  "on-open": "on_open",
  "on-current": "on_current",
  "after-update": "on_after_update",
  "before-update": "on_before_update",
  "on-close": "on_close",
  "on-delete": "on_delete",
  "on-click": "on_click",
  "on-dbl-click": "on_dbl_click",
  "on-enter": "on_enter",
  "on-exit": "on_exit",
  "on-got-focus": "on_got_focus",
  "on-lost-focus": "on_lost_focus",
  "on-change": "on_change",
  "on-key-down": "on_key_down",
  "on-key-press": "on_key_press",
  "on-mouse-down": "on_mouse_down",
  "on-mouse-move": "on_mouse_move",
  "on-mouse-up": "on_mouse_up",
};

export function normalizeEventName(name: string): string {
  return VBA_TO_EVENT[name] || name.replace(/-/g, "_");
}

// ─── Context ──────────────────────────────────────────

const EventContext = createContext<EventContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────

export function EventProvider({ children }: { children: React.ReactNode }) {
  const lastDispatch = useRef<DispatchResult | null>(null);

  const dispatchFormEvent = useCallback(
    async (
      formName: string,
      eventName: string,
      context?: Record<string, unknown>
    ): Promise<DispatchResult> => {
      try {
        const res = await fetch("/api/events/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formName,
            eventName: normalizeEventName(eventName),
            context: context || {},
          }),
        });
        if (!res.ok) {
          throw new Error(`Dispatch failed: ${res.status}`);
        }
        const result: DispatchResult = await res.json();
        lastDispatch.current = result;

        // Log to console for debugging
        if (result.totalHandlers > 0) {
          console.debug(
            `[Event] ${formName}.${eventName} → ${result.totalHandlers} handlers`,
            result.chain.map((c) => `${c.level}(${c.handler_count})`).join(" → ")
          );
        }

        return result;
      } catch (err) {
        console.warn(`[Event] ${formName}.${eventName} failed:`, err);
        return {
          formName,
          eventName,
          group: null,
          totalHandlers: 0,
          chain: [],
          stopped_at: null,
          stopped_handler_id: null,
        };
      }
    },
    []
  );

  const hasHandlers = useCallback(
    async (formName: string, eventName: string): Promise<boolean> => {
      try {
        const res = await dispatchFormEvent(formName, eventName);
        return res.totalHandlers > 0;
      } catch {
        return false;
      }
    },
    [dispatchFormEvent]
  );

  return (
    <EventContext.Provider
      value={{ dispatchFormEvent, hasHandlers, lastDispatch }}
    >
      {children}
    </EventContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────

export function useEvent(): EventContextValue {
  const ctx = useContext(EventContext);
  if (!ctx) {
    throw new Error("useEvent must be used within an EventProvider");
  }
  return ctx;
}

/**
 * Dispatch a form-level event when the component mounts or dependencies change.
 * Fires on_load when formName becomes available, on_current when the record changes.
 */
export function useFormEvent(
  formName: string | null,
  eventName: string,
  deps: unknown[] = []
) {
  const { dispatchFormEvent } = useEvent();

  const fire = useCallback(() => {
    if (!formName) return;
    dispatchFormEvent(formName, eventName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formName, eventName, ...deps]);

  return fire;
}

/**
 * Dispatch event when a control is interacted with (click, dblclick, etc.)
 * Returns a handler function suitable for onClick/onDoubleClick props.
 */
export function useControlEvent(
  formName: string | null,
  eventName: string,
  controlName?: string
) {
  const { dispatchFormEvent } = useEvent();

  return useCallback(
    (context?: Record<string, unknown>) => {
      if (!formName) return;
      dispatchFormEvent(formName, eventName, {
        ...context,
        control: controlName || "unknown",
      });
    },
    [formName, eventName, controlName, dispatchFormEvent]
  );
}
