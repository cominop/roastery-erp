// Remaining control stubs — Line, ListBox, OptionGroup, Rectangle, ToggleButton, SubForm
// These render placeholder UI until full implementation

import type { Control } from "@/types";
import { OrderHistorySubform } from "./OrderHistorySubform";
import DatasheetRenderer from "./DatasheetRenderer";

// ─── Line ────────────────────────────────────────────

export function LineControl({ ctrl }: { ctrl: Control }) {
  return <div className="border-t border-border" />;
}

// ─── ListBox ──────────────────────────────────────────

export function ListBoxControl({
  ctrl,
  value,
  onChange,
  field,
  allowEdits,
}: {
  ctrl: Control;
  field: string | null;
  value: unknown;
  onChange: (f: string, v: unknown) => void;
  allowEdits: boolean;
}) {
  return (
    <select
      className="w-full h-full text-xs border rounded-[var(--app-field-border-radius,6px)] bg-background"
      value={String(value ?? "")}
      disabled={!allowEdits}
      size={3}
      onChange={(e) => field && allowEdits && onChange(field, e.target.value)}
    >
      <option value="">&nbsp;</option>
    </select>
  );
}

// ─── OptionGroup ──────────────────────────────────────

export function OptionGroupControl({ ctrl }: { ctrl: Control }) {
  const caption = ctrl.caption || "";
  return (
    <div className="access-group-box" style={{ position: 'absolute', inset: 0, border: '1px solid var(--border)', borderRadius: 'var(--app-field-border-radius, 5px)', overflow: 'visible' }}>
      {caption && (
        <div className="access-group-title" style={{
          position: 'absolute',
          top: '-0.65em',
          left: '8px',
          padding: '0 4px',
          background: 'var(--background)',
          fontSize: '10px',
          fontWeight: 600,
          lineHeight: '1.1',
          whiteSpace: 'nowrap',
        }}>
          {caption}
        </div>
      )}
    </div>
  );
}

// ─── Rectangle ────────────────────────────────────────

export function RectangleControl({ ctrl }: { ctrl: Control }) {
  return <div className="w-full h-full" />;
}

// ─── ToggleButton ─────────────────────────────────────

export function ToggleButtonControl({
  ctrl,
  value,
  onChange,
  field,
  allowEdits,
}: {
  ctrl: Control;
  field: string | null;
  value: unknown;
  onChange: (f: string, v: unknown) => void;
  allowEdits: boolean;
}) {
  const caption = (ctrl.text as string) || ctrl.caption || "";
  return (
    <button
      className={`w-full h-full text-xs border rounded-[var(--app-field-border-radius,6px)] px-1 ${
        value ? "bg-primary text-primary-foreground" : "bg-background"
      }`}
      disabled={!allowEdits}
      onClick={() => {
        if (field && allowEdits) onChange(field, !value);
      }}
    >
      {caption}
    </button>
  );
}

// ─── SubForm ──────────────────────────────────────────

export function SubFormControl({
  ctrl,
  currentRecord,
}: {
  ctrl: Control;
  currentRecord: Record<string, unknown>;
}) {
  const source = ctrl["source-object"] as string | undefined;
  const sourceForm = (ctrl["source-form"] as string) || (ctrl["sourceForm"] as string);
  const linkChildFields = ctrl["link-child-fields"] as string | undefined;
  const linkMasterFields = ctrl["link-master-fields"] as string | undefined;
  const recordSource = ctrl["record-source"] as string | undefined;

  const controlName = ctrl.name as string;

  // Special case: Orders by Customer Subform
  if (
    controlName === "Orders by Customer Subform" ||
    sourceForm === "Form.Orders by Customer Subform"
  ) {
    if (!currentRecord) {
      return (
        <div className="p-2 text-xs text-muted-foreground">
          No record loaded
        </div>
      );
    }
    const customerId = currentRecord.customerid as number;
    if (!customerId) {
      return (
        <div className="p-2 text-xs text-muted-foreground">
          No customer selected
        </div>
      );
    }
    return <OrderHistorySubform customerId={customerId} />;
  }

  // Determine the form name to render as datasheet
  const formName = sourceForm?.replace(/^Form\./, "") || source;

  if (formName) {
    return (
      <DatasheetRenderer
        formName={formName}
        recordSource={recordSource}
        linkChildFields={linkChildFields}
        linkMasterFields={linkMasterFields}
        currentRecord={currentRecord}
      />
    );
  }

  return (
    <div className="p-2 text-xs text-muted-foreground border border-dashed rounded-[var(--app-field-border-radius,6px)]">
      Subform: {source ?? "(no source)"}
    </div>
  );
}