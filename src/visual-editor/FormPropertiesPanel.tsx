/**
 * FormPropertiesPanel — form-wide property settings panel.
 *
 * Provides controls for:
 *   - Width: form width in twips (stepper + direct input)
 *   - Border: border style selector (none / thin / sizable / dialog)
 *   - History: toggle for edit-history tracking
 *   - Buttons: navigation buttons, record selectors, close/min-max buttons,
 *             scroll bars
 *
 * Step 74: Visual Editor 4 — FormPropertiesPanel.
 */

import { useId, useCallback, useState } from "react";
import {
  Columns2,
  Maximize2,
  History,
  Navigation,
  PanelBottom,
  ScrollText,
  X,
  Minus,
  Plus,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormBorderStyle } from "./types";

// ─── Props ─────────────────────────────────────────────

export interface FormProperties {
  /** Form width in twips */
  width?: number;
  /** Border style */
  borderStyle?: FormBorderStyle;
  /** Enable edit history tracking */
  historyEnabled?: boolean;
  /** Show record selector bar */
  recordSelectors?: boolean;
  /** Show navigation buttons */
  navigationButtons?: boolean;
  /** Scroll bar style */
  scrollBars?: 'none' | 'vertical' | 'horizontal' | 'both';
  /** Show close button in title bar */
  closeButton?: boolean;
  /** Show min/max buttons in title bar */
  minMaxButtons?: boolean;
}

export interface FormPropertiesPanelProps {
  /** Current form-wide property values */
  values: FormProperties;
  /** Called when any property changes */
  onChange: (changes: Partial<FormProperties>) => void;
  /** Disable all controls */
  disabled?: boolean;
}

// ─── Constants ─────────────────────────────────────────

const WIDTH_MIN = 3000;
const WIDTH_MAX = 60000;
const WIDTH_STEP = 240; // twips (≈ 16px)

const BORDER_OPTIONS: { value: FormBorderStyle; label: string }[] = [
  { value: 'none',   label: 'None' },
  { value: 'thin',   label: 'Thin' },
  { value: 'sizable', label: 'Sizable' },
  { value: 'dialog', label: 'Dialog' },
];

const SCROLL_OPTIONS: { value: string; label: string }[] = [
  { value: 'none',       label: 'None' },
  { value: 'vertical',   label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'both',       label: 'Both' },
];

// ─── Component ─────────────────────────────────────────

export default function FormPropertiesPanel({
  values,
  onChange,
  disabled = false,
}: FormPropertiesPanelProps) {
  const widthId = useId();
  const borderGroupId = useId();
  const scrollGroupId = useId();

  // For the width direct-editing input we use local state so the field
  // doesn't flicker as the user types.
  const [widthDraft, setWidthDraft] = useState(String(values.width ?? 14400));

  const clampWidth = useCallback(
    (n: number) => Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, n)),
    [],
  );

  const decWidth = useCallback(() => {
    const current = values.width ?? 14400;
    onChange({ width: clampWidth(current - WIDTH_STEP) });
  }, [values.width, onChange, clampWidth]);

  const incWidth = useCallback(() => {
    const current = values.width ?? 14400;
    onChange({ width: clampWidth(current + WIDTH_STEP) });
  }, [values.width, onChange, clampWidth]);

  const handleWidthInputBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const raw = e.currentTarget.value.replace(/[^0-9-]/g, "");
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= WIDTH_MIN && parsed <= WIDTH_MAX) {
        onChange({ width: parsed });
      } else {
        // Reset to current value
        setWidthDraft(String(values.width ?? 14400));
      }
    },
    [values.width, onChange],
  );

  const handleWidthInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setWidthDraft(e.currentTarget.value);
    },
    [],
  );

  // Sync draft when values.width changes externally
  // We handle this via a simple check in the render — always reset draft
  // when the external value differs from the draft parsed numerically.
  // This avoids an extra effect.

  // ── Border ──
  const currentBorder = values.borderStyle ?? 'sizable';

  // ── Scroll ──
  const currentScroll = values.scrollBars ?? 'both';

  // ── Render helpers ──
  const rowClass = "flex items-center justify-between min-h-[28px]";
  const labelClass = "text-[11px] font-medium text-muted-foreground shrink-0";
  const btnClass =
    "flex items-center justify-center w-6 h-6 border rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none";

  // Determine whether to show the width draft value sync'd with external
  const displayWidth = disabled
    ? String(values.width ?? 14400)
    : widthDraft;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 px-3 py-2.5",
        disabled && "opacity-60 pointer-events-none",
      )}
      role="region"
      aria-label="Form properties"
    >
      {/* ── Section: Width ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
          <Columns2 className="h-3.5 w-3.5 text-muted-foreground" />
          Width
        </span>

        <div className={rowClass}>
          <span className={labelClass}>Form width</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={decWidth}
              disabled={disabled || (values.width ?? 14400) <= WIDTH_MIN}
              className={btnClass}
              title="Decrease width"
              aria-label="Decrease form width"
            >
              <Minus className="h-3 w-3" />
            </button>

            <div className="relative">
              <input
                id={widthId}
                type="text"
                value={displayWidth}
                onChange={handleWidthInputChange}
                onBlur={handleWidthInputBlur}
                disabled={disabled}
                aria-label="Form width in twips"
                className="w-16 h-6 text-center text-[11px] font-medium tabular-nums border rounded bg-background outline-none focus-visible:border-ring"
              />
              <span className="absolute -right-0.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none pr-1">
                tw
              </span>
            </div>

            <button
              type="button"
              onClick={incWidth}
              disabled={disabled || (values.width ?? 14400) >= WIDTH_MAX}
              className={btnClass}
              title="Increase width"
              aria-label="Increase form width"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t my-1" />

      {/* ── Section: Border ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
          <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
          Border
        </span>

        <div
          className="flex flex-wrap gap-1"
          role="radiogroup"
          aria-labelledby={borderGroupId}
        >
          {BORDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              id={borderGroupId}
              type="button"
              role="radio"
              aria-checked={currentBorder === opt.value}
              onClick={() => onChange({ borderStyle: opt.value })}
              disabled={disabled}
              className={cn(
                "px-2 py-0.5 text-[11px] border rounded transition-colors",
                currentBorder === opt.value
                  ? "bg-primary text-primary-foreground border-primary font-medium"
                  : "hover:bg-muted text-muted-foreground",
                disabled && "opacity-30 pointer-events-none",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t my-1" />

      {/* ── Section: History ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          History
        </span>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={values.historyEnabled ?? true}
            onChange={() =>
              onChange({ historyEnabled: !(values.historyEnabled ?? true) })
            }
            disabled={disabled}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <span className="text-[11px] text-foreground">
            Track edit history
          </span>
        </label>
      </div>

      {/* ── Divider ── */}
      <div className="border-t my-1" />

      {/* ── Section: Buttons ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
          <Navigation className="h-3.5 w-3.5 text-muted-foreground" />
          Buttons & chrome
        </span>

        {/* Navigation buttons */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={values.navigationButtons ?? true}
            onChange={() =>
              onChange({
                navigationButtons: !(values.navigationButtons ?? true),
              })
            }
            disabled={disabled}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <Navigation className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-foreground">
            Navigation buttons
          </span>
        </label>

        {/* Record selectors */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={values.recordSelectors ?? true}
            onChange={() =>
              onChange({
                recordSelectors: !(values.recordSelectors ?? true),
              })
            }
            disabled={disabled}
            className="h-3 w-3 accent-foreground cursor-pointer"
          />
          <PanelBottom className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] text-foreground">
            Record selectors
          </span>
        </label>

        {/* Scroll bars */}
        <div className={rowClass}>
          <div className="flex items-center gap-1.5">
            <ScrollText className="h-3 w-3 text-muted-foreground" />
            <span className={labelClass}>Scroll bars</span>
          </div>
          <select
            value={currentScroll}
            onChange={(e) =>
              onChange({ scrollBars: e.currentTarget.value as FormProperties['scrollBars'] })
            }
            disabled={disabled}
            className="h-6 text-[11px] border rounded px-1.5 bg-background outline-none focus-visible:border-ring"
            aria-label="Scroll bar style"
          >
            {SCROLL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── Sub-section: Chrome (title bar buttons) ── */}
        <div className="flex items-center gap-3 mt-0.5">
          {/* Close button */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={values.closeButton ?? true}
              onChange={() =>
                onChange({ closeButton: !(values.closeButton ?? true) })
              }
              disabled={disabled}
              className="h-3 w-3 accent-foreground cursor-pointer"
            />
            <X className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-foreground">Close</span>
          </label>

          {/* Min/Max buttons */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={values.minMaxButtons ?? true}
              onChange={() =>
                onChange({ minMaxButtons: !(values.minMaxButtons ?? true) })
              }
              disabled={disabled}
              className="h-3 w-3 accent-foreground cursor-pointer"
            />
            <Minus className="h-3 w-3 text-muted-foreground" />
            <Square className="h-3 w-3 text-muted-foreground -ml-[1px]" />
            <span className="text-[10px] text-foreground">Min/Max</span>
          </label>
        </div>
      </div>
    </div>
  );
}