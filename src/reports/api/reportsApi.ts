/**
 * API client for report definitions.
 *
 * All calls reference the /api/reports endpoints backed by
 * the shared.report_definitions table.
 */

import type {
  ReportDefinition,
  CreateReportDefinitionRequest,
  UpdateReportDefinitionRequest,
  ReportListQueryParams,
} from '../schema/reportSchema';

const API_BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

/** Fetch all report definitions the current user has access to. */
export function fetchReports(
  params?: ReportListQueryParams,
): Promise<ReportDefinition[]> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.format) qs.set('format', params.format);
  if (params?.enabled !== undefined) qs.set('enabled', String(params.enabled));
  if (params?.search) qs.set('search', params.search);
  const query = qs.toString();
  return request<ReportDefinition[]>(`/reports${query ? `?${query}` : ''}`);
}

/** Fetch a single report definition by UUID. */
export function fetchReport(id: string): Promise<ReportDefinition> {
  return request<ReportDefinition>(`/reports/${id}`);
}

/** List distinct report categories. */
export function fetchReportCategories(): Promise<string[]> {
  return request<string[]>('/reports/categories');
}

/**
 * Create a new report definition (admin only).
 * Returns the full created row including id and timestamps.
 */
export function createReport(
  report: CreateReportDefinitionRequest,
): Promise<ReportDefinition> {
  return request<ReportDefinition>('/reports', {
    method: 'POST',
    body: JSON.stringify(report),
  });
}

/**
 * Update an existing report definition (admin only).
 * Only the provided fields are sent; omitted fields remain unchanged.
 */
export function updateReport(
  id: string,
  report: UpdateReportDefinitionRequest,
): Promise<ReportDefinition> {
  return request<ReportDefinition>(`/reports/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(report),
  });
}

/**
 * Soft-delete a report definition (admin only).
 * Sets enabled=false so it no longer appears in normal listings.
 */
export function deleteReport(id: string): Promise<{ success: true; id: string }> {
  return request<{ success: true; id: string }>(
    `/reports/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

// ─── Report Render & Lookup ──────────────────────────────

export interface LookupOption {
  value: string | number;
  label: string;
}

/**
 * Fetch options for a lookup-type parameter from the given table.
 * Returns { value, label }[] for populating a dropdown.
 */
export function fetchLookupData(
  table: string,
  options?: { search?: string; idColumn?: string; labelColumn?: string },
): Promise<LookupOption[]> {
  return request<LookupOption[]>('/reports/lookup/' + encodeURIComponent(table), {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export interface RenderReportRequest {
  parameters: Record<string, unknown>;
  format?: string;
}

export interface RenderReportResponse {
  success: boolean;
  output: string;
  url: string;
  error?: string;
  details?: string;
}

/**
 * Render a report with the given parameters.
 * Returns a download URL for the generated file.
 */
export function renderReport(
  id: string,
  req: RenderReportRequest,
): Promise<RenderReportResponse> {
  return request<RenderReportResponse>(`/reports/${encodeURIComponent(id)}/render`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}