// FormRenderer — reads a form definition JSON from shared.objects
// and renders it using the accessclone control components

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useFormDefinition, useRecordSource } from "@/hooks";
import { normalizeKeys, controlStyle, controlAppearance, resolveControlField, isExpression, cn } from "@/lib/utils";
import { evaluateExpression } from "@/lib/expressions";
import type { Control, FormDefinition, ExprContext } from "@/types";

import TabControl from "@/controls/TabControl";
import TextBoxControl from "@/controls/TextBoxControl";
import LabelControl from "@/controls/LabelControl";
import ButtonControl from "@/controls/ButtonControl";
import ComboBoxControl from "@/controls/ComboBoxControl";
import CheckBoxControl from "@/controls/CheckBoxControl";
import ImageControl from "@/controls/ImageControl";
import {
  LineControl,
  ListBoxControl,
  OptionGroupControl,
  RectangleControl,
  ToggleButtonControl,
  SubFormControl,
} from "@/controls/StubControls";

const CONTROL_MAP: Record<
  string,
  React.ComponentType<{
    ctrl: Control;
    field: string | null;
    value: unknown;
    onChange: (field: string, value: unknown) => void;
    allowEdits: boolean;
    autoFocus?: boolean;
    isNew?: boolean;
    tabIdx?: number;
    allControls?: Control[];
    currentRecord?: Record<string, unknown>;
  }>
> = {
  "text-box": TextBoxControl,
  label: LabelControl as unknown as React.ComponentType<any>,
  "command-button": ButtonControl as unknown as React.ComponentType<any>,
  "combo-box": ComboBoxControl,
  "check-box": CheckBoxControl,
  "option-button": CheckBoxControl,
  "toggle-button": ToggleButtonControl as unknown as React.ComponentType<any>,
  "list-box": ListBoxControl as unknown as React.ComponentType<any>,
  "option-group": OptionGroupControl as unknown as React.ComponentType<any>,
  line: LineControl as unknown as React.ComponentType<any>,
  rectangle: RectangleControl as unknown as React.ComponentType<any>,
  image: ImageControl as unknown as React.ComponentType<any>,
  tab: TabControl as unknown as React.ComponentType<any>,
};

// ─── FormRenderer ─────────────────────────────────────

interface Props {
  formName: string;
}

function isTabChild(ctrl: Control, allControls: Control[]): boolean {
  // Skip page-type controls — they're tab page definitions, not visual elements
  if (ctrl.type === "page") return true;
  const parentPage = (ctrl as Record<string, unknown>)["parentPage"] as string | undefined
    || (ctrl as Record<string, unknown>)["parent-page"] as string | undefined;
  if (!parentPage) return false;
  return allControls.some((c) => c.type === "page" && c.name === parentPage);
}

export default function FormRenderer({ formName }: Props) {
  const { definition, loading, error } = useFormDefinition(formName);
  const table = useMemo(() => {
    const rs = (definition as Record<string, unknown>)?.["record-source"];
    if (!rs || typeof rs !== "string") return undefined;
    const rsTrimmed = rs.trim();
    const fromMatch = rsTrimmed.match(/FROM\s+"?(\w+)"?\b/i);
    if (fromMatch) return fromMatch[1].toLowerCase();
    const colMatch = rsTrimmed.match(/(\w+)\.\w+/i);
    if (colMatch) return colMatch[1].toLowerCase();
    return rsTrimmed.toLowerCase();
  }, [definition]);

  const recordSource = useRecordSource(table, definition?.filter);
  const allowEdits = (definition?.["allow-edits"] ?? 1) !== 0;
  const showNavButtons = (definition?.["navigation-buttons"] ?? 1) !== 0;
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [footerHeight, setFooterHeight] = useState<number | null>(null);
  const [detailHeight, setDetailHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState<"header" | "detail" | "footer" | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Load saved form sizes on mount
  useEffect(() => {
    fetch(`/api/settings/form-size/${encodeURIComponent(formName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.headerHeight != null) setHeaderHeight(data.headerHeight);
        if (data.footerHeight != null) setFooterHeight(data.footerHeight);
        if (data.detailHeight != null) setDetailHeight(data.detailHeight);
      })
      .catch(() => {});
  }, [formName]);

  // Debounced save when sizes change (not while dragging)
  useEffect(() => {
    if (dragging) return;
    const timer = setTimeout(() => {
      const payload: Record<string, number> = {};
      if (headerHeight != null) payload.headerHeight = headerHeight;
      if (detailHeight != null) payload.detailHeight = detailHeight;
      if (footerHeight != null) payload.footerHeight = footerHeight;
      if (Object.keys(payload).length > 0) {
        // Merge with existing saved data (preserves windowWidth/windowHeight)
        fetch(`/api/settings/form-size/${encodeURIComponent(formName)}`)
          .then((r) => r.json())
          .then((existing) => {
            const merged = { ...existing, ...payload };
            fetch(`/api/settings/form-size/${encodeURIComponent(formName)}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(merged),
            }).catch(() => {});
          })
          .catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [headerHeight, detailHeight, footerHeight, dragging, formName]);

  const handleFieldChange = useCallback(
    (field: string, value: unknown) => {
      recordSource.setField(field, value);
    },
    [recordSource]
  );

  // Collect all controls across all sections for tab-child detection
  const allSectionControls = useMemo(() => {
    const header = (definition as Record<string, unknown>)?.header as FormDefinition["header"] | undefined;
    const detail = (definition as Record<string, unknown>)?.detail as FormDefinition["detail"] | undefined;
    const footer = (definition as Record<string, unknown>)?.footer as FormDefinition["footer"] | undefined;
    return [
      ...((header?.controls as Control[]) || []),
      ...((detail?.controls as Control[]) || []),
      ...((footer?.controls as Control[]) || []),
    ];
  }, [definition]);

  // ─── Section heights ───────────────────────────────
  const sectionHeight = (sec: FormDefinition["header"] | undefined, visible?: number | boolean): number => {
      if (!sec) return 0;
      if (visible === false || visible === 0) return 0;
      // Use the section's explicit height from the form definition if available
      if ((sec as Record<string, unknown>)?.height) return ((sec as Record<string, unknown>).height as number) / 15;
      // Otherwise compute from control positions
      const controls = (sec as Record<string, unknown>)?.controls as Control[];
      if (!controls) return 0;
      const maxBottom = controls.reduce((max, c) => {
        const bottom = (c.top + c.height) / 15;
        return Math.max(max, bottom);
      }, 0);
      return maxBottom + 8;
    };

    const headerSec = (definition as Record<string, unknown>)?.header as FormDefinition["header"] | undefined;
    const footerSec = (definition as Record<string, unknown>)?.footer as FormDefinition["footer"] | undefined;
    const detailSec = (definition as Record<string, unknown>)?.detail as FormDefinition["detail"] | undefined;

    const headerH = sectionHeight(headerSec, (headerSec as Record<string, unknown>)?.visible as number | boolean | undefined);
    const footerH = sectionHeight(footerSec, (footerSec as Record<string, unknown>)?.visible as number | boolean | undefined);
    const detailH = sectionHeight(detailSec, (detailSec as Record<string, unknown>)?.visible as number | boolean | undefined);

  // ─── Render helpers ────────────────────────────────
  const renderControlRef = useRef<((ctrl: Control, idx: number) => React.ReactNode) | null>(null);

  const renderControl = useCallback(
      (ctrl: Control, idx: number) => {
        // Subform special case — must come before the CONTROL_MAP fallback
        if (ctrl.type === "subform") {
          return (
            <div
              key={ctrl.name || idx}
              style={controlStyle(ctrl)}
              className="overflow-hidden border rounded"
            >
              <SubFormControl
                ctrl={ctrl}
                currentRecord={recordSource.current ?? {}}
              />
            </div>
          );
        }

        const Comp = CONTROL_MAP[ctrl.type];
        if (!Comp) {
          return (
            <div
              key={ctrl.name || idx}
              style={controlStyle(ctrl)}
              className="text-[10px] text-muted-foreground border border-dashed border-muted-foreground/20 p-0.5 flex items-center"
            >
              [{ctrl.type}]
            </div>
          );
        }

        const field = resolveControlField(ctrl);
        const value = field ? recordSource.current?.[field] : undefined;

        if (ctrl.type === "tab") {
          return (
            <div
              key={ctrl.name || idx}
              style={controlStyle(ctrl)}
              className="overflow-hidden"
            >
              <TabControl
                ctrl={ctrl}
                allControls={allSectionControls}
                currentRecord={recordSource.current ?? {}}
                onChange={handleFieldChange}
                allowEdits={allowEdits}
                renderControl={(c, i) => renderControlRef.current?.(c, i) ?? null}
              />
            </div>
          );
        }

        return (
          <div
            key={ctrl.name || idx}
            style={controlStyle(ctrl)}
            className="form-field-pair"
          >
            <Comp
              ctrl={ctrl}
              field={field}
              value={value}
              onChange={handleFieldChange}
              allowEdits={allowEdits}
              tabIdx={ctrl["tab-index"]}
            />
          </div>
        );
      },
      [recordSource.current, allowEdits, handleFieldChange, allSectionControls]
    );

  renderControlRef.current = renderControl;

  const renderPairedSection = useCallback(
    (controls: Control[]) => {
      const visible = controls.filter((c) => {
        // Skip hidden controls
        if (c.visible === false || c.visible === 0 || c.visible === "0") return false;
        return true;
      });
      const filtered = visible.filter((c) => !isTabChild(c, allSectionControls));
      return filtered.map((ctrl, idx) => renderControl(ctrl, idx));
    },
    [renderControl, allSectionControls]
  );

  // ─── Loading / Error / Empty ───────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading form...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-red-500">
        Error: {error}
      </div>
    );
  }

  if (!definition) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Form not found: {formName}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(recordSource.total / 1));

  return (
    <div className="flex flex-col h-full"
        style={{ backgroundColor: 'var(--app-form-bg-color, #FFFFFF)' }}>
        {/* Form caption — title bar */}
        <div className="px-3 py-1.5 border-b text-xs font-semibold"
          style={{
            backgroundColor: 'var(--app-form-header-bg, #F3F4F6)',
            color: 'var(--app-form-header-color, #6B7280)',
          }}>
          {definition.caption || formName}
        </div>

      {/* Form Header — fixed record context */}
      {detailSec && (detailSec as Record<string, unknown>)?.visible !== false && (detailSec as Record<string, unknown>)?.visible !== 0 && (
        <div
          className="shrink-0 overflow-hidden"
          style={{
            position: 'relative',
            height: headerHeight ?? Math.max(28, detailH),
            backgroundColor: 'var(--app-form-header-bg, #F3F4F6)',
          }}
        >
          {renderPairedSection((detailSec as Record<string, unknown>)?.controls as Control[] || [])}
          {/* Drag handle at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize hover:bg-muted-foreground/20 active:bg-muted-foreground/30 z-10"
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging("header");
              const startY = e.clientY;
              const startH = headerHeight ?? Math.max(28, detailH);
              const onMouseMove = (ev: MouseEvent) => {
                const delta = ev.clientY - startY;
                setHeaderHeight(Math.max(20, startH + delta));
              };
              const onMouseUp = () => {
                setDragging(null);
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
              };
              window.addEventListener("mousemove", onMouseMove);
              window.addEventListener("mouseup", onMouseUp);
            }}
          />
        </div>
      )}

      {/* Detail — main form content (scrollable), fills remaining space */}
      {headerSec && (headerSec as Record<string, unknown>)?.visible !== false && (headerSec as Record<string, unknown>)?.visible !== 0 && (
        <div
          className="min-h-0 flex-1 overflow-auto"
          style={{ position: 'relative' }}
        >
          {renderPairedSection((headerSec as Record<string, unknown>)?.controls as Control[] || [])}
        </div>
      )}

      {/* Form Footer — fixed actions */}
      {footerSec && (footerSec as Record<string, unknown>)?.visible !== false && (footerSec as Record<string, unknown>)?.visible !== 0 && (
        <div
          className="shrink-0 overflow-hidden"
          style={{
            position: 'relative',
            height: footerHeight ?? Math.max(28, footerH),
            backgroundColor: 'var(--app-form-footer-bg, #F3F4F6)',
            color: 'var(--app-form-footer-color, #6B7280)',
          }}
        >
          {/* Drag handle at top */}
          <div
            className="absolute top-0 left-0 right-0 h-1.5 cursor-n-resize hover:bg-muted-foreground/20 active:bg-muted-foreground/30 z-10"
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging("footer");
              const startY = e.clientY;
              const startH = footerHeight ?? Math.max(28, footerH);
              const onMouseMove = (ev: MouseEvent) => {
                const delta = startY - ev.clientY;
                setFooterHeight(Math.max(20, startH + delta));
              };
              const onMouseUp = () => {
                setDragging(null);
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
              };
              window.addEventListener("mousemove", onMouseMove);
              window.addEventListener("mouseup", onMouseUp);
            }}
          />
          {renderPairedSection((footerSec as Record<string, unknown>)?.controls as Control[] || [])}
        </div>
      )}

      {/* Record navigation */}
      {showNavButtons && (
        <div className="flex items-center gap-1 px-2 py-1 border-t bg-muted/30 text-xs shrink-0">
          <button className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30" onClick={() => recordSource.gotoRecord("first")} disabled={recordSource.total === 0} title="First record">|◄</button>
          <button className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30" onClick={() => recordSource.gotoRecord("previous")} disabled={recordSource.total === 0 || recordSource.page <= 1} title="Previous record">◄</button>
          <span className="ml-1 text-[10px] text-muted-foreground">Record</span>
          <input type="number" min={1} max={totalPages} value={recordSource.total > 0 ? recordSource.page : 0}
            onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val) && val >= 1 && val <= totalPages) recordSource.goToPage(val); }}
            className="w-10 h-5 px-1 text-[10px] border rounded text-center tabular-nums bg-background" title="Go to record number" />
          <span className="text-[10px] text-muted-foreground">{recordSource.total > 0 ? `of ${totalPages}` : "No records"}</span>
          <button className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30" onClick={() => recordSource.gotoRecord("next")} disabled={recordSource.total === 0 || recordSource.page >= totalPages} title="Next record">►</button>
          <button className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30" onClick={() => recordSource.gotoRecord("last")} disabled={recordSource.total === 0} title="Last record">►|</button>
          <span className="ml-auto flex items-center gap-2">
            <button className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30 text-[10px]" onClick={() => recordSource.gotoRecord("new")} disabled={!allowEdits} title="New record">+ New</button>
            <button className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30 text-[10px]" onClick={recordSource.saveRecord} disabled={!recordSource.isDirty} title="Save changes">Save</button>
            {recordSource.isDirty && <span className="text-amber-500 text-[10px]" title="Unsaved changes">●</span>}
          </span>
        </div>
      )}
    </div>
  );
}