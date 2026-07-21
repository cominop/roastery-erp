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