/**
 * Hook: useCalculatedFields
 *
 * Fetches calculated field definitions for a given table, evaluates each
 * expression against the current record, and returns a map of computed values.
 *
 * Auto-refresh: whenever the current record changes (React dependency tracking),
 * all expressions re-evaluate. Since the evaluation is pure (expression + record → result),
 * React's useMemo handles the refresh naturally.
 *
 * Read-only: computed values are returned separately and merged at the
 * renderer level — they never flow back into recordSource.setField.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import {
  fetchCalculatedFields,
  evaluateAggregate,
} from "@/calculated-fields/api/calculatedFieldsApi";
import { evaluateExpression } from "@/lib/expressions";
import type { CalculatedField } from "@/calculated-fields/schema/calculatedFieldSchema";
import type { ExprContext } from "@/types";

// ─── Static definition cache (per table) ────────────────
const definitionsCache = new Map<string, CalculatedField[]>();

// ─── Client-side aggregate result cache (per key, no TTL — TTL is server-side) ──
const aggregateResultsCache = new Map<string, unknown>();

/** Clear all static caches (used by tests). */
export function clearCalculatedFieldsCache(): void {
  definitionsCache.clear();
  aggregateResultsCache.clear();
}

// ─── Public interface ───────────────────────────────────
export interface UseCalculatedFieldsResult {
  /** Map of calculated field name → computed value. */
  computedValues: Record<string, unknown>;
  /** Calculated field definitions (for metadata / tooltip use). */
  definitions: CalculatedField[];
  /** True while definitions are being fetched for the first time. */
  loading: boolean;
  /** Error message from fetching definitions, if any. */
  error: string | null;
}

// ─── Helper: normalize a raw API row (snake_case) to camelCase ──
function normalizeField(raw: Record<string, unknown>): CalculatedField {
  const get = (camel: string, snake: string): unknown =>
    raw[camel] !== undefined ? raw[camel] : raw[snake];

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    caption: String(raw.caption ?? ""),
    tableName: String(get("tableName", "table_name") ?? ""),
    calcType: String(get("calcType", "calc_type") ?? "formula") as CalculatedField["calcType"],
    expression: String(raw.expression ?? ""),
    dataType: String(get("dataType", "data_type") ?? "text") as CalculatedField["dataType"],
    dependsOn: (get("dependsOn", "depends_on") as string[]) ?? [],
    dependsOnTables: (get("dependsOnTables", "depends_on_tables") as string[]) ?? [],
    readOnly: Boolean(get("readOnly", "read_only") ?? true),
    refreshOn: String(get("refreshOn", "refresh_on") ?? "read") as CalculatedField["refreshOn"],
    nullWhenEmpty: Boolean(get("nullWhenEmpty", "null_when_empty") ?? false),
    format: raw.format as string | undefined,
    decimals: raw.decimals as number | undefined,
    prefix: raw.prefix as string | undefined,
    suffix: raw.suffix as string | undefined,
    visible: raw.visible !== false && raw.visible !== 0,
    sortable: raw.sortable !== false && raw.sortable !== 0,
    filterable: raw.filterable !== false && raw.filterable !== 0,
    createdAt: String(get("createdAt", "created_at") ?? ""),
    updatedAt: String(get("updatedAt", "updated_at") ?? ""),
  };
}

// ─── Helper: format a value according to the field's display config ────
function formatComputedValue(value: unknown, field: CalculatedField): unknown {
  if (value == null || value === "#Error") return value;

  const { dataType, decimals, prefix, suffix } = field;

  // Date values should stay as Date objects (controls handle display)
  if (value instanceof Date) {
    if (dataType !== "date") return value; // still return raw Date even if not typed as date
    return value;
  }

  // Apply data type conversion
  let formatted: unknown = value;
  if (dataType === "number" || dataType === "currency") {
    formatted = Number(value);
    if (isNaN(formatted as number)) return value;
  }

  // Apply decimal places — keep as string once formatted to preserve trailing zeros
  if (decimals != null && typeof formatted === "number") {
    formatted = (formatted as number).toFixed(decimals);
  }

  // Apply prefix/suffix — only convert to string when needed
  if (prefix || suffix) {
    let display = String(formatted);
    if (prefix) display = prefix + display;
    if (suffix) display = display + suffix;
    return display;
  }

  // If decimal formatting was applied, return the formatted string
  if (decimals != null && typeof value === "number") {
    return String(formatted);
  }

  // Otherwise return the raw value in its original type
  return value;
}

// ─── Hook ────────────────────────────────────────────────
export function useCalculatedFields(
  tableName: string | undefined,
  currentRecord: Record<string, unknown> | null | undefined,
): UseCalculatedFieldsResult {
  const [definitions, setDefinitions] = useState<CalculatedField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aggregate-specific state
  const [aggregateValues, setAggregateValues] = useState<
    Record<string, unknown>
  >({});
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const previousAggregateKeyRef = useRef<string>("");

  // Track tables we've already attempted to load
  const loadedTablesRef = useRef(new Set<string>());

  // Fetch definitions once per table
  useEffect(() => {
    if (!tableName) {
      setDefinitions([]);
      return;
    }

    // Check cache first
    const cached = definitionsCache.get(tableName);
    if (cached) {
      setDefinitions(cached);
      setLoading(false);
      setError(null);
      loadedTablesRef.current.add(tableName);
      return;
    }

    // Avoid re-fetching if we already tried
    if (loadedTablesRef.current.has(tableName)) {
      return;
    }

    setLoading(true);
    setError(null);
    loadedTablesRef.current.add(tableName);

    fetchCalculatedFields(tableName)
      .then((fields) => {
        // Normalize each field from raw server response to typed objects
        const normalized = fields.map((f) =>
          normalizeField(f as unknown as Record<string, unknown>),
        );
        // Filter to visible, non-stored calc types
        const relevant = normalized.filter(
          (f) => f.visible && f.calcType !== "stored",
        );
        definitionsCache.set(tableName, relevant);
        setDefinitions(relevant);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoading(false);
      });
  }, [tableName]);

  // ── Separate aggregate vs non-aggregate fields ────────
  const { aggregateDefs, nonAggregateDefs } = useMemo(() => {
    const agg: CalculatedField[] = [];
    const nonAgg: CalculatedField[] = [];
    for (const f of definitions) {
      if (f.calcType === "aggregate") agg.push(f);
      else nonAgg.push(f);
    }
    return { aggregateDefs: agg, nonAggregateDefs: nonAgg };
  }, [definitions]);

  // ── Extract record ID for aggregate lookups ──────────
  const recordId = useMemo<number | null>(() => {
    if (!currentRecord) return null;
    const id = (currentRecord as Record<string, unknown>).id;
    return id != null ? Number(id) : null;
  }, [currentRecord]);

  // ── Fetch aggregate values via API ───────────────────
  useEffect(() => {
    // Clean out resolved aggregate entries from previous run so stale
    // results never leak across table/record changes.
    previousAggregateKeyRef.current = `${tableName ?? ""}:${recordId ?? ""}`;

    if (!tableName || recordId === null || aggregateDefs.length === 0) {
      setAggregateValues({});
      setAggregateLoading(false);
      return;
    }

    let cancelled = false;
    setAggregateLoading(true);

    const promises = aggregateDefs.map(async (field) => {
      const cacheKey = `${tableName}:${field.name}:${recordId}`;

      // Check client-side cache first (avoids redundant API calls)
      const cached = aggregateResultsCache.get(cacheKey);
      if (cached !== undefined) {
        return { name: field.name, value: cached };
      }

      try {
        const result = await evaluateAggregate(
          tableName,
          field.expression,
          recordId,
          field.name,
        );
        aggregateResultsCache.set(cacheKey, result.result);
        return { name: field.name, value: result.result };
      } catch {
        return { name: field.name, value: "#Error" };
      }
    });

    Promise.all(promises).then((results) => {
      if (cancelled) return;
      const values: Record<string, unknown> = {};
      for (const r of results) {
        values[r.name] = r.value;
      }
      setAggregateValues(values);
      setAggregateLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tableName, recordId, aggregateDefs]);

  // ── Evaluate non-aggregate expressions ────────────────
  const scalarValues = useMemo<Record<string, unknown>>(() => {
    const record = currentRecord ?? {};
    const result: Record<string, unknown> = {};
    const recordKeys = new Set(
      Object.keys(record).map((k) => k.toLowerCase()),
    );

    for (const field of nonAggregateDefs) {
      // When a record is present but none of the dependencies are available yet,
      // skip evaluation (field will be null/default until data arrives)
      if (
        field.dependsOn &&
        field.dependsOn.length > 0 &&
        recordKeys.size > 0
      ) {
        const hasAnyDep = field.dependsOn.some((dep) =>
          recordKeys.has(dep.toLowerCase()),
        );
        if (!hasAnyDep) {
          result[field.name] = null;
          continue;
        }
      }

      // If no record data at all, skip evaluation
      if (recordKeys.size === 0) {
        result[field.name] = null;
        continue;
      }

      // Build the expression context
      const ctx: ExprContext = {
        record,
        groupRecords: recordKeys.size > 0 ? [record] : [],
        allRecords: recordKeys.size > 0 ? [record] : [],
      };

      // Evaluate
      const raw = evaluateExpression(field.expression, ctx);
      result[field.name] = formatComputedValue(raw, field);
    }

    return result;
  }, [nonAggregateDefs, currentRecord]);

  // ── Merge scalar + aggregate values ──────────────────
  const computedValues = useMemo<Record<string, unknown>>(() => {
    return { ...scalarValues, ...aggregateValues };
  }, [scalarValues, aggregateValues]);

  return {
    computedValues,
    definitions,
    loading: loading || aggregateLoading,
    error,
  };
}
