// FormRenderer — reads a form definition JSON from shared.objects
// and renders it using the accessclone control components

import { useState, useMemo, useCallback } from "react";
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
  }>
> = {
  "text-box": TextBoxControl,
  label: LabelControl as unknown as React.ComponentType<any>,
  "command-button": ButtonControl as unknown as React.ComponentType<any>,
  "combo-box": ComboBoxControl,
  "check-box": CheckBoxControl,
  "option-button": CheckBoxControl, // reuse checkbox for now
  "toggle-button": ToggleButtonControl as unknown as React.ComponentType<any>,
  "list-box": ListBoxControl as unknown as React.ComponentType<any>,
  "option-group": OptionGroupControl as unknown as React.ComponentType<any>,
  line: LineControl as unknown as React.ComponentType<any>,
  rectangle: RectangleControl as unknown as React.ComponentType<any>,
  image: ImageControl as unknown as React.ComponentType<any>,
};

// ─── FormRenderer ─────────────────────────────────────

interface Props {
  formName: string;
}

export default function FormRenderer({ formName }: Props) {
  const { definition, loading, error } = useFormDefinition(formName);
  // Derive table from record source (e.g., "employees" from "SELECT ... FROM employees" or "employees.employeeid")
  const table = useMemo(() => {
    const rs = (definition as Record<string, unknown>)?.["record-source"];
    if (!rs || typeof rs !== "string") return undefined;
    const rsTrimmed = rs.trim();
    // Try to extract table name from FROM clause first
    const fromMatch = rsTrimmed.match(/FROM\s+"?(\w+)"?\b/i);
    if (fromMatch) return fromMatch[1].toLowerCase();
    // Fallback: extract table name from column references like "employees.employeeid"
    const colMatch = rsTrimmed.match(/(\w+)\.\w+/i);
    if (colMatch) return colMatch[1].toLowerCase();
    return rsTrimmed.toLowerCase();
  }, [definition]);

  const recordSource = useRecordSource(table, definition?.filter);
  const allowEdits = (definition?.["allow-edits"] ?? 1) !== 0;
  const showNavButtons = (definition?.["navigation-buttons"] ?? 1) !== 0;

  const handleFieldChange = useCallback(
    (field: string, value: unknown) => {
      recordSource.setField(field, value);
    },
    [recordSource]
  );

  // ─── Render helpers ────────────────────────────────

  const renderControl = useCallback(
    (ctrl: Control, idx: number) => {
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

      // For subform controls, pass the current record for master-detail linking
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
    [recordSource.current, allowEdits, handleFieldChange]
  );

  // ─── Section rendering ─────────────────────────────

  const renderPairedSection = useCallback(
    (controls: Control[]) => {
      return controls.map((ctrl, idx) => renderControl(ctrl, idx));
    },
    [renderControl]
  );

  // Use optional chaining - some forms may not have all sections
  const headerSec = (definition as Record<string, unknown>)?.header as FormDefinition["header"] | undefined;
  const footerSec = (definition as Record<string, unknown>)?.footer as FormDefinition["footer"] | undefined;  
  const detailSec = (definition as Record<string, unknown>)?.detail as FormDefinition["detail"] | undefined;

  const sectionHeight = (sec: FormDefinition["header"] | undefined, visible?: number | boolean) => {
    if (!sec) return 0;
    if (visible === false || visible === 0) return 0;
    if ((sec as Record<string, unknown>)?.height) return ((sec as Record<string, unknown>).height as number) / 15;
    // Estimate from controls
    const controls = (sec as Record<string, unknown>)?.controls as Control[];
    if (!controls) return 0;
    const maxBottom = controls.reduce((max, c) => {
      const bottom = (c.top + c.height) / 15;
      return Math.max(max, bottom);
    }, 0);
    return maxBottom + 8;
  };

  const headerH = sectionHeight(headerSec, (headerSec as Record<string, unknown>)?.visible as number | boolean | undefined);
  const footerH = sectionHeight(footerSec, (footerSec as Record<string, unknown>)?.visible as number | boolean | undefined);
  const detailH = sectionHeight(detailSec, (detailSec as Record<string, unknown>)?.visible as number | boolean | undefined);

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
    <div className="flex flex-col h-full bg-background">
      {/* Form caption */}
      <div className="px-3 py-1.5 border-b text-xs font-semibold bg-muted/20 text-muted-foreground">
        {definition.caption || formName}
      </div>

      {/* Form body - scrollable area */}
      <div className="flex-1 overflow-auto">
        <div className="form-body">
          {/* Header section */}
          {headerSec && (headerSec as Record<string, unknown>)?.visible !== false && (headerSec as Record<string, unknown>)?.visible !== 0 && (
            <div className="form-section">
              {renderPairedSection((headerSec as Record<string, unknown>)?.controls as Control[] || [])}
            </div>
          )}

          {/* Detail section */}
          {detailSec && (detailSec as Record<string, unknown>)?.visible !== false && (detailSec as Record<string, unknown>)?.visible !== 0 && (
            <div className="form-section">
              {renderPairedSection((detailSec as Record<string, unknown>)?.controls as Control[] || [])}
            </div>
          )}

          {/* Footer section */}
          {footerSec && (footerSec as Record<string, unknown>)?.visible !== false && (footerSec as Record<string, unknown>)?.visible !== 0 && (
            <div className="form-section">
              {renderPairedSection((footerSec as Record<string, unknown>)?.controls as Control[] || [])}
            </div>
          )}
        </div>
      </div>

      {/* Footer navigation bar */}
      {showNavButtons && (
        <div className="flex items-center gap-1 px-2 py-1 border-t bg-muted/30 text-xs shrink-0">
          <button
            className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30"
            onClick={() => recordSource.gotoRecord("first")}
            disabled={recordSource.total === 0}
            title="First record"
          >
            |◄
          </button>
          <button
            className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30"
            onClick={() => recordSource.gotoRecord("previous")}
            disabled={recordSource.total === 0 || recordSource.page <= 1}
            title="Previous record"
          >
            ◄
          </button>

          <span className="ml-1 text-[10px] text-muted-foreground">Record</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={recordSource.total > 0 ? recordSource.page : 0}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= totalPages) {
                recordSource.goToPage(val);
              }
            }}
            className="w-10 h-5 px-1 text-[10px] border rounded text-center tabular-nums bg-background"
            title="Go to record number"
          />
          <span className="text-[10px] text-muted-foreground">
            {recordSource.total > 0
              ? `of ${totalPages}`
              : "No records"}
          </span>

          <button
            className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30"
            onClick={() => recordSource.gotoRecord("next")}
            disabled={recordSource.total === 0 || recordSource.page >= totalPages}
            title="Next record"
          >
            ►
          </button>
          <button
            className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30"
            onClick={() => recordSource.gotoRecord("last")}
            disabled={recordSource.total === 0}
            title="Last record"
          >
            ►|
          </button>

          <span className="ml-auto flex items-center gap-2">
            <button
              className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30 text-[10px]"
              onClick={() => recordSource.gotoRecord("new")}
              disabled={!allowEdits}
              title="New record"
            >
              + New
            </button>
            <button
              className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30 text-[10px]"
              onClick={recordSource.saveRecord}
              disabled={!recordSource.isDirty}
              title="Save changes"
            >
              Save
            </button>
            {recordSource.isDirty && (
              <span className="text-amber-500 text-[10px]" title="Unsaved changes">●</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}