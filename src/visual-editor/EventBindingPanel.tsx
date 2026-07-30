/**
 * EventBindingPanel — panel for binding VBA events to form/control definitions.
 *
 * Presents a categorized list of event types from the EventBindings interface,
 * each with a text input for the handler name (the VBA subroutine or script
 * function that should be called when the event fires).
 *
 * The panel follows the same controlled-component pattern as FormPropertiesPanel:
 * receives current `events` and calls `onChange` with the full updated object.
 *
 * Scope:
 *   'form'    — form-level events (click, data, focus, keyboard, mouse)
 *   'control' — control-level events (same set — EventBindings is shared)
 *   'all'     — all events (default)
 *
 * Step 79: EventBindingPanel (hook VBA events to form definition).
 */

import { useId, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { EventBindings } from "./types";

// ─── Event category metadata ──────────────────────────

/** A single event binding definition — describes one EventBindings key */
export interface EventBindingDefinition {
  /** The EventBindings property key */
  key: keyof EventBindings;
  /** Human-readable label */
  label: string;
  /** The canonical VBA event name for reference */
  vbaName: string;
  /** Short description */
  description: string;
  /** Default/example handler name shown as placeholder */
  placeholder?: string;
  /** Whether this event is typically form-level only */
  formOnly?: boolean;
  /** Whether this event is typically control-level only */
  controlOnly?: boolean;
}

export type EventBindingScope = 'form' | 'control' | 'all';

// ─── Event definitions, categorised ──────────────────

const CLICK_EVENTS: EventBindingDefinition[] = [
  { key: 'onClick',     label: 'Click',       vbaName: 'Click',     description: 'Control is clicked / form body is clicked', placeholder: 'OnClick' },
  { key: 'onDblClick',  label: 'Dbl Click',   vbaName: 'DblClick',  description: 'Control is double-clicked', placeholder: 'OnDblClick' },
];

const MOUSE_EVENTS: EventBindingDefinition[] = [
  { key: 'onMouseDown', label: 'Mouse Down',  vbaName: 'MouseDown', description: 'Mouse button pressed', placeholder: 'OnMouseDown' },
  { key: 'onMouseUp',   label: 'Mouse Up',    vbaName: 'MouseUp',   description: 'Mouse button released', placeholder: 'OnMouseUp' },
  { key: 'onMouseMove', label: 'Mouse Move',  vbaName: 'MouseMove', description: 'Mouse moves over element', placeholder: 'OnMouseMove' },
];

const DATA_EVENTS: EventBindingDefinition[] = [
  { key: 'onBeforeUpdate', label: 'Before Update', vbaName: 'BeforeUpdate', description: 'Before record changes are saved', formOnly: true, placeholder: 'Form_BeforeUpdate' },
  { key: 'onAfterUpdate',  label: 'After Update',  vbaName: 'AfterUpdate',  description: 'After record changes are saved', formOnly: true, placeholder: 'Form_AfterUpdate' },
  { key: 'onChange',       label: 'Change',        vbaName: 'Change',       description: 'Value in a field changes', placeholder: 'OnChange' },
];

const FOCUS_EVENTS: EventBindingDefinition[] = [
  { key: 'onEnter',     label: 'Enter',       vbaName: 'Enter',     description: 'Control receives focus (before GotFocus)', placeholder: 'OnEnter' },
  { key: 'onExit',      label: 'Exit',        vbaName: 'Exit',      description: 'Control loses focus (before LostFocus)', placeholder: 'OnExit' },
  { key: 'onGotFocus',  label: 'Got Focus',   vbaName: 'GotFocus',  description: 'Control receives focus', placeholder: 'OnGotFocus' },
  { key: 'onLostFocus', label: 'Lost Focus',  vbaName: 'LostFocus', description: 'Control loses focus', placeholder: 'OnLostFocus' },
];

const KEYBOARD_EVENTS: EventBindingDefinition[] = [
  { key: 'onKeyDown',  label: 'Key Down',  vbaName: 'KeyDown',  description: 'Key pressed down', placeholder: 'OnKeyDown' },
  { key: 'onKeyUp',    label: 'Key Up',    vbaName: 'KeyUp',    description: 'Key released', placeholder: 'OnKeyUp' },
  { key: 'onKeyPress', label: 'Key Press', vbaName: 'KeyPress', description: 'Key pressed & released', placeholder: 'OnKeyPress' },
];

// ─── Grouped exports for scope filtering ──────────────

export const ALL_EVENT_GROUPS: { title: string; events: EventBindingDefinition[] }[] = [
  { title: 'Click',   events: CLICK_EVENTS },
  { title: 'Mouse',   events: MOUSE_EVENTS },
  { title: 'Data',    events: DATA_EVENTS },
  { title: 'Focus',   events: FOCUS_EVENTS },
  { title: 'Keyboard', events: KEYBOARD_EVENTS },
];

export const FORM_EVENT_GROUPS: { title: string; events: EventBindingDefinition[] }[] = [
  { title: 'Click',   events: CLICK_EVENTS },
  { title: 'Mouse',   events: MOUSE_EVENTS },
  { title: 'Data',    events: DATA_EVENTS },
  { title: 'Focus',   events: FOCUS_EVENTS },
  { title: 'Keyboard', events: KEYBOARD_EVENTS },
];

export const CONTROL_EVENT_GROUPS: { title: string; events: EventBindingDefinition[] }[] = [
  { title: 'Click',   events: CLICK_EVENTS },
  { title: 'Mouse',   events: MOUSE_EVENTS },
  { title: 'Data',    events: DATA_EVENTS.filter((e) => !e.formOnly) },
  { title: 'Focus',   events: FOCUS_EVENTS },
  { title: 'Keyboard', events: KEYBOARD_EVENTS },
];

// ─── Helpers ──────────────────────────────────────────

function getEventGroups(scope: EventBindingScope) {
  switch (scope) {
    case 'form':
      return FORM_EVENT_GROUPS.map((g) => ({
        ...g,
        events: g.events.filter((e) => !e.controlOnly),
      }));
    case 'control':
      return CONTROL_EVENT_GROUPS.map((g) => ({
        ...g,
        events: g.events.filter((e) => !e.formOnly),
      }));
    default:
      return ALL_EVENT_GROUPS;
  }
}

// ─── Props ─────────────────────────────────────────────

export interface EventBindingPanelProps {
  /** Current event bindings (can be partial or empty) */
  events?: EventBindings;
  /** Called when any binding changes (receives full updated EventBindings) */
  onChange: (events: EventBindings) => void;
  /** Scope filter: form, control, or all */
  scope?: EventBindingScope;
  /** Disable all inputs */
  disabled?: boolean;
  /** Optional class name override */
  className?: string;
}

// ─── Inline icons (lightweight, no external deps) ─────

const EVENT_ICONS: Record<string, string> = {
  onClick: "▶",
  onDblClick: "⏩",
  onMouseDown: "▼",
  onMouseUp: "▲",
  onMouseMove: "✧",
  onBeforeUpdate: "📝",
  onAfterUpdate: "✓",
  onChange: "✎",
  onEnter: "→",
  onExit: "←",
  onGotFocus: "◎",
  onLostFocus: "◌",
  onKeyDown: "⌨",
  onKeyUp: "⌨",
  onKeyPress: "⌨",
};

// ─── Component ─────────────────────────────────────────

export default function EventBindingPanel({
  events = {},
  onChange,
  scope = 'all',
  disabled = false,
  className,
}: EventBindingPanelProps) {
  const uid = useId();

  const groups = getEventGroups(scope);

  // Count bound vs total
  const totalCount = groups.reduce((s, g) => s + g.events.length, 0);
  const boundCount = groups.reduce(
    (s, g) =>
      s + g.events.filter((ev) => {
        const val = events[ev.key];
        return typeof val === 'string' && val.trim().length > 0;
      }).length,
    0,
  );

  const handleChange = useCallback(
    (key: keyof EventBindings, value: string) => {
      const trimmed = value.trim();
      const updated = { ...events };
      if (trimmed) {
        (updated as Record<string, string>)[key] = trimmed;
      } else {
        delete (updated as Record<string, string>)[key];
      }
      onChange(updated as EventBindings);
    },
    [events, onChange],
  );

  const handleClear = useCallback(
    (key: keyof EventBindings) => {
      const updated = { ...events };
      delete (updated as Record<string, string>)[key];
      onChange(updated as EventBindings);
    },
    [events, onChange],
  );

  const hasBindings = boundCount > 0;

  // ── Styles ──
  const rowClass = "flex items-center gap-1.5 min-h-[26px]";
  const labelClass = "text-[11px] text-muted-foreground shrink-0 w-[78px]";

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 px-3 py-2.5",
        disabled && "opacity-60 pointer-events-none",
        className,
      )}
      role="region"
      aria-label="Event bindings"
    >
      {/* ── Summary header ── */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-foreground">
          {scope === 'form' ? 'Form Events' : scope === 'control' ? 'Control Events' : 'Event Bindings'}
        </span>
        {hasBindings && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {boundCount}/{totalCount} bound
          </span>
        )}
      </div>

      {!hasBindings && totalCount > 0 && (
        <div className="text-[10px] text-muted-foreground/40 italic px-0.5 mb-1">
          No events bound. Type a handler name to bind an event.
        </div>
      )}

      {/* ── Event groups ── */}
      {groups.map((group) =>
        group.events.length > 0 ? (
          <div key={group.title} className="flex flex-col gap-px">
            {/* Group title bar */}
            <div className="flex items-center gap-1.5 mt-1.5 mb-0.5 first:mt-0">
              <div className="h-px flex-1 bg-border/30" />
              <span className="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground/40" data-testid={`event-group-${group.title}`}>
                {group.title}
              </span>
              <div className="h-px flex-1 bg-border/30" />
            </div>

            {group.events.map((ev) => {
              const currentValue = events[ev.key];
              const isBound =
                typeof currentValue === 'string' && currentValue.trim().length > 0;
              const icon = EVENT_ICONS[ev.key] || "⚡";

              return (
                <div key={ev.key} className={rowClass}>
                  {/* Event icon & label */}
                  <span
                    className={cn(labelClass, "truncate")}
                    title={`${ev.vbaName} — ${ev.description}`}
                  >
                    <span className="mr-0.5 text-[10px]" aria-hidden="true">
                      {icon}
                    </span>
                    {ev.label}
                  </span>

                  {/* Handler name input */}
                  <div className="relative flex-1 min-w-0">
                    <input
                      id={`${uid}-${ev.key}`}
                      type="text"
                      value={isBound ? currentValue : ''}
                      onChange={(e) => handleChange(ev.key, e.currentTarget.value)}
                      disabled={disabled}
                      placeholder={ev.placeholder || '—'}
                      aria-label={`${ev.label} handler`}
                      className={cn(
                        "w-full h-5 px-1.5 text-[10px] font-mono border rounded bg-background outline-none transition-colors",
                        "focus-visible:border-ring",
                        isBound
                          ? "border-emerald-500/30 bg-emerald-500/[4%]"
                          : "border-border/50 hover:border-border",
                        disabled && "border-border/20",
                      )}
                    />

                    {/* Clear button */}
                    {isBound && !disabled && (
                      <button
                        type="button"
                        onClick={() => handleClear(ev.key)}
                        aria-label={`Clear ${ev.label}`}
                        className={cn(
                          "absolute right-0.5 top-1/2 -translate-y-1/2",
                          "flex items-center justify-center",
                          "w-3.5 h-3.5 rounded hover:bg-muted transition-colors",
                          "text-muted-foreground/30 hover:text-muted-foreground",
                        )}
                      >
                        <span className="text-[9px] leading-none font-mono">×</span>
                      </button>
                    )}
                  </div>

                  {/* Bound indicator dot */}
                  <span
                    className={cn(
                      "shrink-0 w-[5px] h-[5px] rounded-full transition-colors",
                      isBound ? "bg-emerald-500" : "bg-transparent",
                    )}
                    title={isBound ? `Handled by ${currentValue}` : 'Unbound'}
                  />
                </div>
              );
            })}
          </div>
        ) : null,
      )}

      {/* ── Empty state ── */}
      {totalCount === 0 && (
        <div className="py-6 text-center text-[10px] text-muted-foreground/30 italic">
          No events defined for this scope.
        </div>
      )}
    </div>
  );
}
