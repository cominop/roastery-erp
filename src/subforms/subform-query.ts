// Subform query helper — builds filtered queries for linked child records
import { getRecordValue } from "./subform-metadata-overrides";
import type { SubformControlDefinition } from "./subform-types";

export interface SubformQuery {
  table: string;
  filters: Array<{ field: string; value: unknown }>;
}

/**
 * Build the child query from a subform definition and the parent record.
 * Returns the table name and field filters to apply.
 */
export function buildSubformQuery(
  definition: SubformControlDefinition,
  parentRecord?: Record<string, unknown>
): SubformQuery {
  const query: SubformQuery = {
    table: definition.sourceObject,
    filters: [],
  };

  if (!parentRecord) return query;

  // Apply master-child link filters
  if (definition.linkMasterFields && definition.linkChildFields && definition.linkChildFields.length > 0) {
    for (let i = 0; i < definition.linkMasterFields.length; i++) {
      const masterField = definition.linkMasterFields[i];
      const childField = definition.linkChildFields[i];
      if (!childField) continue;

      const masterValue = getRecordValue(parentRecord, masterField);
      if (masterValue != null) {
        query.filters.push({ field: childField, value: masterValue });
      }
    }
  }

  return query;
}

/** Convert SubformQuery filters to an API-compatible filter string */
export function queryToFilterString(query: SubformQuery): string {
  if (query.filters.length === 0) return "";
  return query.filters
    .map((f) => `${encodeURIComponent(f.field)}=${encodeURIComponent(String(f.value))}`)
    .join("&");
}

/** Build a fetch URL for the child data */
export function buildSubformDataUrl(
  query: SubformQuery,
  table: string,
  limit = 100
): string {
  const filterStr = query.filters
    .map((f) => `${f.field}=${encodeURIComponent(String(f.value))}`)
    .join("&");
  const base = `/api/data/${encodeURIComponent(table)}?limit=${limit}`;
  return filterStr ? `${base}&filter=${encodeURIComponent(filterStr)}` : base;
}

/**
 * Build default values for a new child record from the parent record.
 * Automatically populates link child fields from parent master values.
 * (spec §13 — Creating New Child Records)
 *
 * Returns an object like: { CustomerID: 334799, LocationID: 5 }
 * Returns undefined when a required parent key is unavailable (prevents saving).
 */
export function getNewChildDefaults(
  definition: SubformControlDefinition,
  parentRecord?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!parentRecord || !definition.linkMasterFields || !definition.linkChildFields) {
    return undefined;
  }

  const defaults: Record<string, unknown> = {};
  for (let i = 0; i < definition.linkMasterFields.length; i++) {
    const masterField = definition.linkMasterFields[i];
    const childField = definition.linkChildFields[i];
    if (!childField) continue;

    const masterValue = getRecordValue(parentRecord, masterField);

    // Prevent saving when the required parent key is unavailable (spec §13)
    if (masterValue == null || masterValue === "") {
      return undefined;
    }

    defaults[childField] = masterValue;
  }

  return Object.keys(defaults).length > 0 ? defaults : undefined;
}