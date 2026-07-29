/**
 * TabsBandEditor — tabbed band configuration with per-band field picker.
 *
 * Provides a tab bar (Header / Detail / Footer) for switching between form
 * sections. Each tab exposes band-level properties (height, visibility) and
 * a FieldPicker for associating record-source fields with that band.
 *
 * Step 73: Visual Editor 3 — TabsBandEditor.
 */

import { useState, useCallback, useId } from "react";
import {
  PanelLeft,
  PanelRightClose,
  PanelBottomClose,
  Eye,
  Ruler,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import FieldPicker from "./FieldPicker";
import type { LayoutPanel } from "./ColumnLayoutConfig";
import type { VisualEditorSection } from "./types";
import type { FieldPickerItem } from "./FieldPicker";

// ─── Tab definitions ──────────────────────────────

interface TabDef {
  key: LayoutPanel;
  label: string;
  icon: typeof PanelLeft;
}

const TAB_DEFS: TabDef[] = [
  { key: "header", label: "Header", icon: PanelLeft },
  { key: "detail", label: "Detail", icon: PanelRightClose },
  { key: "footer", label: "Footer", icon: PanelBottomClose },
];

// ─── Props ─────────────────────────────────────────

export interface TabsBandEditorProps {
  /** The three form sections */
  sections: Record<LayoutPanel, VisualEditorSection>;
  /** Called when a section's properties are updated */
  onSectionChange: (
    section: LayoutPanel,
    changes: Partial<VisualEditorSection>,
  ) => void;
  /** All available fields from the record source */
  availableFields: FieldPickerItem[];
  /** Currently selected field names per band */
  bandFields: Record<LayoutPanel, FieldPickerItem[]>;
  /** Called when fields change for a specific band */
  onBandFieldsChange: (
    section: LayoutPanel,
    selected: FieldPickerItem[],
  ) => void;
  /** Disable all controls */
  disabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────

const HEIGHT_STEP = 60; // twips (≈ 4px)

const clampHeight = (h: number) => Math.max(60, Math.min(21600, h));

// ─── Component ─────────────────────────────────────

export default function TabsBandEditor({
  sections,
  onSectionChange,
  availableFields,
  bandFields,
  onBandFieldsChange,
  disabled = false,
}: TabsBandEditorProps) {
  const [activeTab, setActiveTab] = useState<LayoutPanel>("header");
  const sectionId = useId();

  const section = sections[activeTab];
  const bandFieldList = bandFields[activeTab] ?? [];

  // ── Band property handlers ──
  const toggleVisible = useCallback(() => {
    onSectionChange(activeTab, { visible: !section.visible });
  }, [activeTab, onSectionChange, section.visible]);

  const incHeight = useCallback(() => {
    onSectionChange(activeTab, { height: clampHeight((section.height ?? 0) + HEIGHT_STEP) });
  }, [activeTab, onSectionChange, section.height]);

  const decHeight = useCallback(() => {
    onSectionChange(activeTab, { height: clampHeight((section.height ?? 0) - HEIGHT_STEP) });
  }, [activeTab, onSectionChange, section.height]);

  const setRecordSource = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSectionChange(activeTab, { recordSource: e.target.value });
    },
    [activeTab, onSectionChange],
  );

  // ── Field picker handler ──
  const handleFieldChange = useCallback(
    (selected: FieldPickerItem[]) => {
      onBandFieldsChange(activeTab, selected);
    },
    [activeTab, onBandFieldsChange],
  );

  // ── Render helpers ──
  const sectionRowClass =
    "flex items-center justify-between min-h-[28px]";
  const sectionLabelClass =
    "text-[11px] font-medium text-muted-foreground shrink-0";
  const btnClass =
    "flex items-center justify-center w-6 h-6 border rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:pointer-events-none";

  return (
    <div
      className={cn(
        "flex flex-col",
        disabled && "opacity-60 pointer-events-none",
      )}
      role="region"
      aria-label="Tabs and band editor"
    >
      {/* ── Tab bar ── */}
      <div
        className="flex border-b"
        role="tablist"
        aria-label="Form sections"
      >
        {TAB_DEFS.map((tab) => {
          const isActive = activeTab === tab.key;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={disabled}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
                disabled && "pointer-events-none",
              )}
            >
              <TabIcon className="h-3 w-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Selected band content ── */}
      <div
        className="flex flex-col gap-3 px-3 py-2.5"
        role="tabpanel"
        aria-labelledby={`${sectionId}-${activeTab}`}
      >
        {/* ── Band info header ── */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-foreground capitalize">
            {activeTab} band
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {bandFieldList.length} field{bandFieldList.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Property: Visible ── */}
        <div className={sectionRowClass}>
          <div className="flex items-center gap-1.5">
            <Eye className="h-3 w-3 text-muted-foreground" />
            <span className={sectionLabelClass}>Visible</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={section.visible ?? true}
              onChange={toggleVisible}
              disabled={disabled}
              className="h-3 w-3 accent-foreground cursor-pointer"
            />
            <span className="text-[11px] text-foreground">
              {section.visible ?? true ? "On" : "Off"}
            </span>
          </label>
        </div>

        {/* ── Property: Height ── */}
        <div className={sectionRowClass}>
          <div className="flex items-center gap-1.5">
            <Ruler className="h-3 w-3 text-muted-foreground" />
            <span className={sectionLabelClass}>Height</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={decHeight}
              disabled={disabled || (section.height ?? 0) <= 60}
              className={btnClass}
              title="Decrease height"
              aria-label="Decrease band height"
            >
              <span className="text-[13px] leading-none">−</span>
            </button>
            <span
              className="w-14 text-center text-[11px] font-medium tabular-nums"
              aria-live="polite"
              aria-atomic="true"
            >
              {section.height ?? 0}
            </span>
            <button
              type="button"
              onClick={incHeight}
              disabled={disabled || (section.height ?? 0) >= 21600}
              className={btnClass}
              title="Increase height"
              aria-label="Increase band height"
            >
              <span className="text-[13px] leading-none">+</span>
            </button>
          </div>
        </div>

        {/* ── Property: Record source (Detail only) ── */}
        {activeTab === "detail" && (
          <div className={sectionRowClass}>
            <div className="flex items-center gap-1.5">
              <Database className="h-3 w-3 text-muted-foreground" />
              <span className={sectionLabelClass}>Record source</span>
            </div>
            <input
              type="text"
              value={section.recordSource ?? ""}
              onChange={setRecordSource}
              disabled={disabled}
              placeholder="Table or query name"
              className="w-28 h-6 px-1.5 text-[10px] border rounded bg-background outline-none focus-visible:border-ring text-right font-mono"
            />
          </div>
        )}

        {/* ── Property: Allow additions/deletions (Detail only) ── */}
        {activeTab === "detail" && (
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={section.allowAdditions ?? true}
                onChange={() =>
                  onSectionChange(activeTab, {
                    allowAdditions: !section.allowAdditions,
                  })
                }
                disabled={disabled}
                className="h-3 w-3 accent-foreground cursor-pointer"
              />
              <span className="text-[11px] text-muted-foreground">
                Allow additions
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={section.allowDeletions ?? true}
                onChange={() =>
                  onSectionChange(activeTab, {
                    allowDeletions: !section.allowDeletions,
                  })
                }
                disabled={disabled}
                className="h-3 w-3 accent-foreground cursor-pointer"
              />
              <span className="text-[11px] text-muted-foreground">
                Allow deletions
              </span>
            </label>
          </div>
        )}

        {/* ── Divider before field picker ── */}
        <div className="border-t my-0.5" />

        {/* ── Per-band field picker ── */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-foreground">
            Band fields
          </span>
          <div
            className="border rounded overflow-hidden"
            style={{ height: 200 }}
          >
            <FieldPicker
              availableFields={availableFields}
              selectedFields={bandFieldList}
              onChange={handleFieldChange}
              availableLabel="Available"
              selectedLabel="Assigned"
              disabled={disabled}
            />
          </div>
        </div>

        {/* ── Section info footer ── */}
        <div className="border-t pt-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            Section controls: {section.controls?.length ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
}