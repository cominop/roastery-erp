/**
 * API client for the Roastery UI backend
 */

const API_BASE = "/api";

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Companies (multi-tenant) ─────────────────────────

export function getCompanies() {
  return request<{ id: number; name: string; slug: string }[]>("/companies");
}

// ─── Form definitions ─────────────────────────────────

export function getFormDefinition(formName: string) {
  return request<import("@/types").FormDefinition>(`/forms/${formName}`);
}

export function getFormList() {
  return request<{ name: string; caption: string }[]>("/forms");
}

// ─── Data CRUD ────────────────────────────────────────

export function getRecords(
  table: string,
  params?: { page?: number; limit?: number; filter?: string; orderBy?: string }
) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.filter) searchParams.set("filter", params.filter);
  if (params?.orderBy) searchParams.set("orderBy", params.orderBy);
  const qs = searchParams.toString();
  return request<{ rows: Record<string, unknown>[]; total: number; page: number }>(
    `/data/${table}${qs ? `?${qs}` : ""}`
  );
}

export function getRecord(table: string, id: string | number) {
  return request<Record<string, unknown>>(`/data/${table}/${id}`);
}

export function createRecord(table: string, data: Record<string, unknown>) {
  return request<Record<string, unknown>>(`/data/${table}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateRecord(table: string, id: string | number, data: Record<string, unknown>) {
  return request<Record<string, unknown>>(`/data/${table}/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteRecord(table: string, id: string | number) {
  return request<void>(`/data/${table}/${id}`, { method: "DELETE" });
}

// ─── Lookups (combo-box row sources) ──────────────────

export function runLookup(sql: string) {
  return request<{ rows: Record<string, unknown>[]; fields: string[] }>("/lookup", {
    method: "POST",
    body: JSON.stringify({ sql }),
  });
}

// ─── Table schema ─────────────────────────────────────

export function getTableSchema(table: string) {
  return request<{ name: string; type: string; nullable: boolean }[]>(`/schema/${table}`);
}

// ─── Event handlers ───────────────────────────────────

export interface EventHandler {
  id: string;
  level: string;
  scope: string;
  event_name: string;
  handler: string;
  vba_module: string | null;
  vba_control: string | null;
  language: string;
  enabled: boolean;
  sort_order: number | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function getGroups() {
  return request<Record<string, string[]>>(`/events/groups`);
}

export function getEventHandlers(scope?: string) {
  const qs = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return request<EventHandler[]>(`/events${qs}`);
}

export function createEventHandler(data: {
  level: string;
  scope: string;
  event_name: string;
  handler: string;
  language?: string;
  description?: string;
}) {
  return request<EventHandler>(`/events`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateEventHandler(
  id: string,
  data: Partial<{
    level: string;
    scope: string;
    event_name: string;
    handler: string;
    enabled: boolean;
    description: string;
  }>
) {
  return request<EventHandler>(`/events/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteEventHandler(id: string) {
  return request<{ ok: boolean }>(`/events/${id}`, { method: "DELETE" });
}

// ─── Sandbox execution ───────────────────────────────

export interface ExecutionResult {
  success: boolean;
  result: unknown;
  stdout: string;
  stderr: string;
  execution_time_ms: number;
  error: string | null;
  handler_id?: string;
  event_name?: string;
}

export function runEventHandler(code: string, context?: Record<string, unknown>, eventName?: string) {
  return request<ExecutionResult>(`/events/run`, {
    method: "POST",
    body: JSON.stringify({ code, context: context || {}, event_name: eventName }),
  });
}

// ─── Dispatch chain (inherited handler resolution) ─────

export interface DispatchChainHandler {
  id: string;
  event_name: string;
  level: string;
  language: string;
  enabled: boolean;
  description: string | null;
}

export interface DispatchChainLink {
  level: string;
  handler_count: number;
  handlers: DispatchChainHandler[];
}

export interface DispatchResult {
  formName: string;
  eventName: string;
  group: string | null;
  totalHandlers: number;
  chain: DispatchChainLink[];
  stopped_at: string | null;
  stopped_handler_id: string | null;
}

/** Fetch the full dispatch chain for a form — used by 'Show inherited' */
export function fetchDispatchChain(formName: string, eventName?: string) {
  return request<DispatchResult>("/events/dispatch", {
    method: "POST",
    body: JSON.stringify({ formName, eventName: eventName || "" }),
  });
}

// ─── Audit log ────────────────────────────────────────

export interface AuditEntry {
  id: string;
  table_name: string;
  record_id: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: number | null;
  changed_by_name: string | null;
  changed_at: string;
  company_id: number;
}

export interface AuditLogResponse {
  rows: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/**
 * Fetch audit log entries with optional filters.
 * The most common use: pass table_name + record_id to get history for one record.
 */
export function getAuditLog(params?: {
  table_name?: string;
  record_id?: number | string;
  action?: string;
  changed_by?: number | string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.table_name) searchParams.set("table_name", params.table_name);
  if (params?.record_id != null) searchParams.set("record_id", String(params.record_id));
  if (params?.action) searchParams.set("action", params.action);
  if (params?.changed_by != null) searchParams.set("changed_by", String(params.changed_by));
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  const qs = searchParams.toString();
  return request<AuditLogResponse>(`/audit-log${qs ? `?${qs}` : ""}`);
}

// ─── Audit undo / restore ──────────────────────────────

export interface UndoResult {
  ok: boolean;
  message: string;
  action: string;
  fields?: string[];
  record?: Record<string, unknown>;
}

export interface RestoreResult {
  ok: boolean;
  message: string;
  action: string;
  fields?: string[];
}

/** Revert a single audit entry */
export function undoAuditEntry(id: string) {
  return request<UndoResult>(`/audit-log/${id}/undo`, {
    method: "POST",
  });
}

/** Point-in-time restore — revert to state at a given timestamp */
export function restoreAuditEntry(params: {
  table_name: string;
  record_id: number;
  timestamp: string;
}) {
  return request<RestoreResult>("/audit-log/restore", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ─── Audit retention / pruning ────────────────────────

export interface RetentionOverride {
  id: number;
  table_name: string;
  retention_days: number;
  last_pruned_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RetentionConfig {
  default_retention_days: number;
  default_last_pruned_at: string | null;
  overrides: RetentionOverride[];
  stats: {
    total_entries: number;
    oldest_entry: string;
    newest_entry: string;
    table_count: number;
  };
}

export function getRetentionConfig() {
  return request<RetentionConfig>("/audit/retention");
}

export function updateRetentionConfig(body: {
  default_retention_days?: number;
  overrides?: Array<{
    id?: number;
    table_name?: string;
    retention_days?: number;
    _delete?: boolean;
  }>;
}) {
  return request<{ ok: boolean }>("/audit/retention", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export interface PruneResult {
  table_name: string;
  retention_days: number;
  entries_before: number;
  entries_pruned: number;
  oldest_kept: string | null;
  cutoff_date: string;
}

export interface PruneResponse {
  pruned: PruneResult[];
}

export function triggerPrune(body?: { table_name?: string; dry_run?: boolean }) {
  return request<PruneResponse>("/audit/prune", {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

export interface PruneStatsTable {
  table_name: string;
  effective_retention_days: number;
  override_retention_days: number | null;
  has_override: boolean;
  last_pruned_at: string | null;
  entry_count: number;
  oldest_entry: string | null;
  newest_entry: string | null;
  prunable_count: number;
}

export interface PruneStats {
  tables: PruneStatsTable[];
  summary: {
    total_entries: number;
    total_prunable: number;
    table_count: number;
  };
}

export function getPruneStats() {
  return request<PruneStats>("/audit/prune/stats");
}