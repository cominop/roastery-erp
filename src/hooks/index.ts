import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";
import { normalizeKeys } from "@/lib/utils";
import type { FormDefinition } from "@/types";

// ─── Form Definition ──────────────────────────────────

export function useFormDefinition(formName: string | null) {
  const [definition, setDefinition] = useState<FormDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!formName) return;
    setLoading(true);
    api
      .getFormDefinition(formName)
      .then((raw) => normalizeKeys(raw) as FormDefinition)
      .then(setDefinition)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [formName]);

  return { definition, loading, error };
}

// ─── Record Source ────────────────────────────────────

interface RecordSourceState {
  current: Record<string, unknown> | null;
  all: Record<string, unknown>[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;
  isDirty: boolean;
  isNew: boolean;
}

export function useRecordSource(table: string | undefined, filter?: string) {
  const [state, setState] = useState<RecordSourceState>({
    current: null,
    all: [],
    total: 0,
    page: 1,
    loading: false,
    error: null,
    isDirty: false,
    isNew: false,
  });
  const [searchTerm, setSearchTerm] = useState("");

  const LIMIT = 1; // Form view — one record at a time

  const composeFilter = useCallback(
    (baseFilter: string | undefined, search: string): string | undefined => {
      const parts: string[] = [];
      if (baseFilter) parts.push(baseFilter);
      if (search && search.trim()) {
        // Search across all text fields via cast-to-text ILIKE
        const safe = search.trim().replace(/'/g, "''");
        parts.push(`CAST(row_to_json(${table})::text AS text) ILIKE '%${safe}%'`);
      }
      return parts.length > 0 ? parts.join("%20AND%20") : undefined;
    },
    [table]
  );

  const fetchPage = useCallback(
    (page: number, search?: string) => {
      if (!table) return;
      setState((s) => ({ ...s, loading: true, error: null }));
      const combinedFilter = composeFilter(filter, search ?? searchTerm);
      api
        .getRecords(table, { page, limit: LIMIT, filter: combinedFilter })
        .then((res) => {
          setState((s) => ({
            ...s,
            current: res.rows[0] ?? null,
            all: res.rows,
            total: res.total,
            page: res.page,
            loading: false,
            isDirty: false,
            isNew: false,
          }));
        })
        .catch((e) => setState((s) => ({ ...s, loading: false, error: e.message })));
    },
    [table, filter, composeFilter, searchTerm]
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  const handleSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);
      // Debounce search — let the state settle, then fetch
      const timer = setTimeout(() => {
        fetchPage(1, term);
      }, 300);
      return () => clearTimeout(timer);
    },
    [fetchPage]
  );

  const gotoRecord = useCallback(
    (target: "first" | "last" | "next" | "previous" | "new") => {
      switch (target) {
        case "first":
          fetchPage(1);
          break;
        case "last":
          fetchPage(Math.max(1, Math.ceil(state.total / LIMIT)));
          break;
        case "next":
          if (state.page * LIMIT < state.total) fetchPage(state.page + 1);
          break;
        case "previous":
          if (state.page > 1) fetchPage(state.page - 1);
          break;
        case "new":
          setState((s) => ({ ...s, current: { __new__: true }, isNew: true, isDirty: true }));
          break;
      }
    },
    [fetchPage, state.page, state.total]
  );

  const goToPage = useCallback(
    (page: number) => {
      const maxPage = Math.max(1, Math.ceil(state.total / LIMIT));
      const target = Math.max(1, Math.min(page, maxPage));
      if (target !== state.page) fetchPage(target);
    },
    [fetchPage, state.page, state.total]
  );

  const setField = useCallback((field: string, value: unknown) => {
    setState((s) => ({
      ...s,
      current: s.current ? { ...s.current, [field]: value } : { [field]: value },
      isDirty: true,
    }));
  }, []);

  const saveRecord = useCallback(async () => {
    if (!table || !state.current) return;
    try {
      if (state.isNew) {
        const { __new__, ...data } = state.current as Record<string, unknown>;
        await api.createRecord(table, data);
      } else {
        const pk = state.current[`${table.slice(0, -1)}id`] ?? state.current.id;
        if (pk != null) {
          await api.updateRecord(table, pk, state.current);
        }
      }
      await fetchPage(state.page);
    } catch (e) {
      setState((s) => ({ ...s, error: (e as Error).message }));
    }
  }, [table, state.current, state.isNew, state.page, fetchPage]);

  const deleteRecord = useCallback(async () => {
    if (!table || !state.current) return;
    const pk = state.current[`${table.slice(0, -1)}id`] ?? state.current.id;
    if (pk != null) {
      await api.deleteRecord(table, pk);
      fetchPage(state.page);
    }
  }, [table, state.current, state.page, fetchPage]);

  return { ...state, gotoRecord, goToPage, saveRecord, deleteRecord, setField, fetchPage, handleSearch, searchTerm };
}

// ─── Lookup Data (combo-box row sources) ──────────────

export function useLookupData(rowSource: string | undefined) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rowSource) return;
    setLoading(true);
    api
      .runLookup(rowSource)
      .then((res) => {
        setRows(res.rows);
        setFields(res.fields);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [rowSource]);

  return { rows, fields, loading };
}

// ─── Table Schema ─────────────────────────────────────

export function useTableSchema(table: string | undefined) {
  const [columns, setColumns] = useState<{ name: string; type: string; nullable: boolean }[]>([]);

  useEffect(() => {
    if (!table) return;
    api.getTableSchema(table).then(setColumns).catch(() => setColumns([]));
  }, [table]);

  return columns;
}

// ─── Filter State Management ───────────────────────────
export { useFilters } from "./useFilters";
export type { FilterItem, UseFiltersOptions, UseFiltersReturn } from "./useFilters";