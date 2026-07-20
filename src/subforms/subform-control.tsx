// SubformControl — generic subform component
// Loads the child form named by sourceObject, applies parent-child filtering,
// and renders according to the child form's display mode.
//
// Step 4 — Parent record changes (spec §11):
//   parent navigates → parentKey changes → DatasheetRenderer key prop
//   → React unmounts old renderer (stale child data cleared ✅)
//   → new renderer mounts with new filter → fetches matching records ✅
//
// Display mode routing (Grid / Fields / Hybrid) is wired in Step 6.

import { useState, useEffect, useMemo } from "react";
import * as api from "@/lib/api";
import { normalizeKeys } from "@/lib/utils";
import type { FormDefinition } from "@/types";
import { getRecordValue } from "./subform-metadata-overrides";
import { resolveDisplayMode } from "./subform-metadata-overrides";
import type { SubformControlProps } from "./subform-types";
import { buildSubformQuery, getNewChildDefaults } from "./subform-query";
import DatasheetRenderer from "@/controls/DatasheetRenderer";
import FormRenderer from "@/components/FormRenderer";
import SubformDiagnostic from "./subform-diagnostic";

// ─── State type ────────────────────────────────────────

type SubformLoadState = "loading" | "ready" | "empty" | "error";

// ─── Sentinels ─────────────────────────────────────────

const EMPTY_PARENT_KEY = "__EMPTY_PARENT_KEY__";
const UNLINKED = "__UNLINKED__";

// ─── Helpers ───────────────────────────────────────────

/**
 * Build a stable identity key from the parent record.
 * Used to force a clean mount of the child renderer when the parent
 * navigates to a different record.
 */
function parentRecordKey(record: Record<string, unknown> | undefined): string {
  if (!record) return "no-parent";
  // Try common primary key fields first, fall back to JSON
  for (const pk of ["id", "ID", "Id", "customerid", "CustomerID", "OrderID", "orderid"]) {
    if (pk in record) return String(record[pk]);
  }
  return JSON.stringify(record);
}

// ─── SubformControl ────────────────────────────────────

export default function SubformControl({
  definition,
  parentRecord,
  devMode = false,
}: SubformControlProps) {
  // 1. Load the child form definition by sourceObject name
  const [childForm, setChildForm] = useState<FormDefinition | null>(null);
  const [formLoading, setFormLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!definition.sourceObject) {
      setFormError("No source object specified");
      setFormLoading(false);
      return;
    }
    setFormLoading(true);
    setFormError(null);
    api
      .getFormDefinition(definition.sourceObject)
      .then((raw) => normalizeKeys(raw) as FormDefinition)
      .then(setChildForm)
      .catch((e) => setFormError(e.message))
      .finally(() => setFormLoading(false));
  }, [definition.sourceObject]);

  // 2. Determine display mode from child form metadata (or fallback registry)
  const displayMode = useMemo(() => {
    return resolveDisplayMode(
      definition.sourceObject,
      childForm as Record<string, unknown> | undefined,
    );
  }, [definition.sourceObject, childForm]);

  // 3. Build the parent-child filter using buildSubformQuery
  // Returns: EMPTY_PARENT_KEY, UNLINKED, a filter string, or undefined
  const filter = useMemo(() => {
    // Unlinked subform — no filter (spec §10)
    if (
      !definition.linkMasterFields ||
      !definition.linkChildFields ||
      definition.linkChildFields.length === 0
    ) {
      return UNLINKED;
    }

    // No parent record yet
    if (!parentRecord) {
      return EMPTY_PARENT_KEY;
    }

    // Check for empty parent keys before building the query (spec §12)
    for (let i = 0; i < definition.linkMasterFields.length; i++) {
      const masterField = definition.linkMasterFields[i];
      const childField = definition.linkChildFields[i];
      if (!childField) continue;

      const masterValue = getRecordValue(parentRecord, masterField);
      if (masterValue == null || masterValue === "") {
        return EMPTY_PARENT_KEY;
      }
    }

    // Build structured query using the existing helper
    const query = buildSubformQuery(definition, parentRecord);
    if (query.filters.length === 0) return UNLINKED;

    // Convert to DatasheetRenderer-compatible filter string:
    //   field1=value1%20AND%20field2=value2
    return query.filters
      .map((f) => `${f.field}=${f.value}`)
      .join("%20AND%20");
  }, [parentRecord, definition.linkMasterFields, definition.linkChildFields]);

  // 4. Derive load state
  const loadState: SubformLoadState = useMemo(() => {
    if (formLoading) return "loading";
    if (formError) return "error";
    if (filter === EMPTY_PARENT_KEY) return "empty";
    if (!childForm) return "error";
    return "ready";
  }, [formLoading, formError, filter, childForm]);

  // 5. Stable parent-record key for forcing child remount on navigation
  const parentKey = useMemo(
    () => parentRecordKey(parentRecord),
    [parentRecord],
  );

  // 6. New child record defaults — auto-populated link fields (spec §13)
  const newChildDefaults = useMemo(
    () => getNewChildDefaults(definition, parentRecord),
    [definition, parentRecord],
  );

  // ─── Render by state ────────────────────────────────

  // Loading state (spec §11)
  if (loadState === "loading") {
    return (
      <div className="flex items-center justify-center h-full min-h-[60px] text-xs text-muted-foreground">
        Loading related records…
      </div>
    );
  }

  // Error state (spec §11)
  if (loadState === "error") {
    return (
      <div className="flex items-center justify-center h-full min-h-[60px] text-xs text-red-500 p-2 text-center">
        {formError || `Form not found: ${definition.sourceObject}`}
      </div>
    );
  }

  // Empty parent key — do not run an unfiltered query (spec §12)
  if (loadState === "empty") {
    return (
      <div className="flex items-center justify-center h-full min-h-[60px] text-xs text-muted-foreground p-2 text-center">
        Save the parent record before adding related records.
      </div>
    );
  }

  // ─── Ready — render child form ─────────────────────
  // Route to the correct renderer based on the child form's displayMode (spec §14).
  // The key prop forces a clean mount when the parent navigates to a different
  // record, ensuring stale child data is cleared (spec §11).

  const recordSource = (
    childForm as Record<string, unknown> | undefined
  )?.["record-source"] as string | undefined;

  const passFilter =
    filter === EMPTY_PARENT_KEY || filter === UNLINKED
      ? undefined
      : filter;

  if (displayMode === "grid") {
    return (
      <div key={parentKey} className="relative h-full min-h-0">
        <DatasheetRenderer
          formName={definition.sourceObject}
          recordSource={recordSource}
          filter={passFilter}
          currentRecord={parentRecord}
          newChildDefaults={newChildDefaults}
        />
        {devMode && (
          <SubformDiagnostic
            definition={definition}
            displayMode={displayMode}
            parentValue={parentRecord ? getRecordValue(parentRecord, definition.linkMasterFields?.[0] ?? "") : undefined}
            filter={passFilter}
            loadState={loadState}
          />
        )}
      </div>
    );
  }

  if (displayMode === "fields") {
    return (
      <div key={parentKey} className="relative h-full min-h-0 overflow-auto">
        <FormRenderer
          formName={definition.sourceObject}
          externalFilter={passFilter}
        />
        {devMode && (
          <SubformDiagnostic
            definition={definition}
            displayMode={displayMode}
            parentValue={parentRecord ? getRecordValue(parentRecord, definition.linkMasterFields?.[0] ?? "") : undefined}
            filter={passFilter}
            loadState={loadState}
          />
        )}
      </div>
    );
  }

  if (displayMode === "hybrid") {
    return (
      <div key={parentKey} className="relative flex flex-col h-full min-h-0">
        <div className="min-h-0 flex-[2] overflow-auto border-b">
          <FormRenderer
            formName={definition.sourceObject}
            externalFilter={passFilter}
          />
        </div>
        <div className="min-h-0 flex-[3] overflow-auto">
          <DatasheetRenderer
            formName={definition.sourceObject}
            recordSource={recordSource}
            filter={passFilter}
            currentRecord={parentRecord}
          />
        </div>
        {devMode && (
          <SubformDiagnostic
            definition={definition}
            displayMode={displayMode}
            parentValue={parentRecord ? getRecordValue(parentRecord, definition.linkMasterFields?.[0] ?? "") : undefined}
            filter={passFilter}
            loadState={loadState}
          />
        )}
      </div>
    );
  }

  // Fallback — should not reach here
  return (
    <div className="p-2 text-xs text-red-500">
      Unknown display mode: {displayMode}
    </div>
  );
}