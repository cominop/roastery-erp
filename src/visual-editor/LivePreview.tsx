/**
 * LivePreview — side-by-side form preview from current VisualEditorForm definition.
 *
 * Renders a scaled-down visual preview of the form's header, detail, and footer
 * sections, with controls positioned according to their twips-based layout.
 *
 * Step 78: LivePreview pane (Phase 8 of the Visual Editor).
 */

import { useMemo, useId } from "react";
import {
  Square,
  Type,
  MousePointerClick,
  ChevronDown,
  CheckSquare,
  Circle,
  ToggleLeft,
  Radio,
  Paperclip,
  Image,
  Minus,
  Crop,
  List,
  Table,
  Columns2,
} from "lucide-react";
import type { VisualEditorForm, VisualEditorControl, VisualEditorControlType } from "./types";
import { cn } from "@/lib/utils";

// ─── Scale & constants ───────────────────────────────────

/** Twips-to-pixels conversion factor (1 twip ≈ 1/15 of a point ≈ 0.0667px at 1× scale) */
const TWIPS_PER_PIXEL = 1 / 15;

/** Scale applied to the entire preview so it fits in a side panel (~35% of real size) */
const PREVIEW_SCALE = 0.35;

/** Min preview width in px */
const MIN_PREVIEW_WIDTH = 200;

/** Max preview width in px */
const MAX_PREVIEW_WIDTH = 600;

// ─── Props ───────────────────────────────────────────────

export interface LivePreviewProps {
  /** The form definition to preview */
  form: VisualEditorForm;
  /** Optional class name override */
  className?: string;
  /** Whether the preview is in a compact (narrow) container */
  compact?: boolean;
  /** Explicit width override (overrides form.width-derived width) */
  widthOverride?: number;
}

// ─── Control type icon map ───────────────────────────────

const CONTROL_ICONS: Partial<Record<VisualEditorControlType, React.ComponentType<{ className?: string }>>> = {
  "text-box": Type,
  "label": Type,
  "command-button": MousePointerClick,
  "combo-box": ChevronDown,
  "check-box": CheckSquare,
  "option-button": Circle,
  "toggle-button": ToggleLeft,
  "option-group": Radio,
  "attachment": Paperclip,
  "image": Image,
  "line": Minus,
  "rectangle": Crop,
  "list-box": List,
  "subform": Table,
  "tab-control": Columns2,
};

const CONTROL_LABELS: Partial<Record<VisualEditorControlType, string>> = {
  "text-box": "Text",
  "label": "Label",
  "command-button": "Btn",
  "combo-box": "Combo",
  "check-box": "Check",
  "option-button": "Opt",
  "toggle-button": "Toggle",
  "option-group": "Group",
  "attachment": "Attach",
  "image": "Image",
  "line": "━",
  "rectangle": "□",
  "list-box": "List",
  "subform": "Sub",
  "tab-control": "Tabs",
};

// ─── Helpers ─────────────────────────────────────────────

/** Convert twips to preview pixels */
const twipToPx = (twips: number): number => Math.round(twips * TWIPS_PER_PIXEL * PREVIEW_SCALE);

/** Clamp a value between min and max */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// ─── Control Preview Item ────────────────────────────────

interface ControlPreviewItemProps {
  control: VisualEditorControl;
  scaleFactor: number;
}

function ControlPreviewItem({ control }: ControlPreviewItemProps) {
  const Icon = CONTROL_ICONS[control.type];
  const label = control.caption || control.name || CONTROL_LABELS[control.type] || control.type;

  const leftPx = twipToPx(control.left);
  const topPx = twipToPx(control.top);
  const widthPx = Math.max(twipToPx(control.width), 6);  // minimum visible
  const heightPx = Math.max(twipToPx(control.height), 4); // minimum visible

  // Skip page-type controls — they're tab page containers, not visual elements
  if (control.type === "page") return null;

  // Check visibility
  const isVisible = control.visible !== false && control.visible !== 0 && control.visible !== "0";
  if (!isVisible) return null;

  const isLine = control.type === "line";
  const isRectangle = control.type === "rectangle";
  const isButton = control.type === "command-button";
  const isLabel = control.type === "label";
  const isContainer = control.type === "subform" || control.type === "tab-control";

  return (
    <div
      className={cn(
        "absolute overflow-hidden border",
        isLine && "border-0 border-t border-dashed",
        isRectangle && "border-2 border-muted-foreground/30 bg-muted/5",
        isButton && "border-muted-foreground/40 bg-muted/30",
        isLabel && "border-transparent",
        isContainer && "border-muted-foreground/20 bg-muted/10",
        !isLine && !isRectangle && !isButton && !isLabel && !isContainer && "border-muted-foreground/20 bg-background",
      )}
      style={{
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: heightPx,
        zIndex: control.zIndex ?? 0,
      }}
      title={`${control.name} (${control.type})`}
    >
      {isLine ? null : (
        <div className="flex items-center gap-0.5 h-full px-0.5 overflow-hidden">
          {Icon && (
            <Icon className="shrink-0 text-muted-foreground/60" style={{ width: Math.min(heightPx * 0.5, 10), height: Math.min(heightPx * 0.5, 10) }} />
          )}
          <span
            className="truncate leading-tight text-muted-foreground/80"
            style={{ fontSize: Math.max(Math.min(heightPx * 0.4, 8), 5) }}
          >
            {typeof label === "string" ? label : null}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Section Preview ─────────────────────────────────────

interface SectionPreviewProps {
  section: VisualEditorForm["header"] | VisualEditorForm["detail"] | VisualEditorForm["footer"];
  label: string;
  bgColor?: string;
  visible: boolean;
}

function SectionPreview({ section, label, bgColor, visible }: SectionPreviewProps) {
  if (!visible || !section) return null;

  const controls = section.controls ?? [];
  const heightPx = clamp(
    section.height
      ? twipToPx(section.height)
      : controls.length > 0
        ? Math.max(...controls.map((c) => twipToPx(c.top + c.height))) + twipToPx(60)
        : twipToPx(300),
    10,
    800,
  );

  return (
    <div
      className="border-b last:border-b-0 relative"
      style={{
        minHeight: heightPx,
        backgroundColor: bgColor ?? "transparent",
      }}
    >
      {/* Section label badge */}
      <div className="absolute top-0 left-0 z-20 pointer-events-none">
        <span className="inline-block px-1 py-[1px] text-[7px] font-medium uppercase tracking-wider text-muted-foreground/40 bg-muted/30 rounded-br">
          {label}
        </span>
      </div>

      {/* Controls */}
      {controls.map((ctrl) => (
        <ControlPreviewItem key={ctrl.id} control={ctrl} scaleFactor={PREVIEW_SCALE} />
      ))}

      {/* Empty state */}
      {controls.length === 0 && (
        <div className="flex items-center justify-center h-full text-[8px] text-muted-foreground/30 italic">
          {label === "Detail" ? "Empty section" : ""}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────

export default function LivePreview({
  form,
  className,
  compact = false,
  widthOverride,
}: LivePreviewProps) {
  const uid = useId();

  // Compute the form's visual width in preview pixels
  const formWidthPx = useMemo(() => {
    if (widthOverride) return widthOverride;
    const w = form.width ?? 14400;
    return clamp(twipToPx(w), MIN_PREVIEW_WIDTH, MAX_PREVIEW_WIDTH);
  }, [form.width, widthOverride]);

  // Compute the total form height from sections
  const totalHeightPx = useMemo(() => {
    const headerH = form.header?.height ? twipToPx(form.header.height) : 0;
    const detailH = form.detail?.height ? twipToPx(form.detail.height) : twipToPx(600);
    const footerH = form.footer?.height ? twipToPx(form.footer.height) : 0;
    return Math.max(headerH + detailH + footerH, 60);
  }, [form.header?.height, form.detail?.height, form.footer?.height]);

  // Border style
  const borderClass = useMemo(() => {
    switch (form.borderStyle) {
      case "none": return "border-0 shadow-none";
      case "dialog": return "border-2 border-border shadow-lg";
      case "thin": return "border border-border";
      case "sizable":
      default: return "border border-border shadow-sm";
    }
  }, [form.borderStyle]);

  const headerVisible = form.header?.visible !== false && form.header?.visible !== 0;
  const footerVisible = form.footer?.visible !== false && form.footer?.visible !== 0;
  const detailVisible = form.detail?.visible !== false && form.detail?.visible !== 0;

  return (
    <div className={cn("flex flex-col gap-2 select-none", className)} role="region" aria-label="Form live preview">
      {/* Preview toolbar header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Preview
        </span>
        <span className="text-[9px] text-muted-foreground/50 tabular-nums">
          {form.name}
        </span>
      </div>

      {/* Preview canvas */}
      <div className="flex justify-center overflow-auto p-2 bg-muted/20 rounded-lg border border-border/50 min-h-[120px]">
        <div
          className={cn(
            "flex flex-col bg-background overflow-hidden rounded-sm",
            borderClass,
          )}
          style={{
            width: formWidthPx,
            minHeight: 40,
            transformOrigin: "top center",
          }}
        >
          {/* Caption / title bar */}
          {(form.caption || form.name) && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 shrink-0 border-b"
            >
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <span
                  className="truncate font-semibold"
                  style={{ fontSize: 7 }}
                >
                  {form.caption || form.name}
                </span>
              </div>
              {/* Window chrome dots */}
              {form.closeButton !== false && (
                <div className="flex items-center gap-[2px]">
                  <div className="w-[5px] h-[5px] rounded-full bg-muted-foreground/20" />
                  <div className="w-[5px] h-[5px] rounded-full bg-muted-foreground/20" />
                  <div className="w-[5px] h-[5px] rounded-full bg-muted-foreground/20" />
                </div>
              )}
            </div>
          )}

          {/* Sections */}
          <div className="flex flex-col flex-1 min-h-0" style={{ minHeight: totalHeightPx }}>
            <SectionPreview
              section={form.header}
              label="Header"
              bgColor="var(--app-form-header-bg, #F3F4F6)"
              visible={headerVisible}
            />

            <SectionPreview
              section={form.detail}
              label="Detail"
              visible={detailVisible}
            />

            <SectionPreview
              section={form.footer}
              label="Footer"
              bgColor="var(--app-form-footer-bg, #F3F4F6)"
              visible={footerVisible}
            />
          </div>

          {/* Empty form state */}
          {!headerVisible && !detailVisible && !footerVisible && (
            <div className="flex items-center justify-center flex-1 text-[8px] text-muted-foreground/30 italic py-4">
              No sections visible
            </div>
          )}
        </div>
      </div>

      {/* Info footer: control count stats */}
      {(() => {
        const totalControls =
          (form.header?.controls?.length ?? 0) +
          (form.detail?.controls?.length ?? 0) +
          (form.footer?.controls?.length ?? 0);
        if (totalControls === 0) return null;
        return (
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60 tabular-nums px-1">
            <span>{totalControls} control{totalControls !== 1 ? "s" : ""}</span>
            <span className="text-muted-foreground/30">·</span>
            <span>{formWidthPx}px</span>
            {form.recordSource && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="truncate max-w-[100px]">{form.recordSource}</span>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
