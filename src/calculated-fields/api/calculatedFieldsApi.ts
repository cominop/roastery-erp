/**
 * API client for calculated field definitions.
 *
 * All calls reference the /api/calculated-fields endpoints backed
 * by the shared.calculated_fields table.
 */

import type { CalculatedField } from '../schema/calculatedFieldSchema';

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

/** Fetch all calculated fields, optionally filtered by table_name. */
export function fetchCalculatedFields(
  tableName?: string,
): Promise<CalculatedField[]> {
  const qs = tableName ? `?table_name=${encodeURIComponent(tableName)}` : '';
  return request<CalculatedField[]>(`/calculated-fields${qs}`);
}

/** Fetch a single calculated field by its UUID. */
export function fetchCalculatedField(id: string): Promise<CalculatedField> {
  return request<CalculatedField>(`/calculated-fields/${id}`);
}

/** Create a new calculated field definition. */
export function createCalculatedField(
  field: Omit<CalculatedField, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<CalculatedField> {
  // Convert camelCase keys to snake_case for the API
  const body: Record<string, unknown> = {
    name: field.name,
    caption: field.caption,
    table_name: field.tableName,
    calc_type: field.calcType,
    expression: field.expression,
    data_type: field.dataType,
    depends_on: field.dependsOn,
    depends_on_tables: field.dependsOnTables,
    read_only: field.readOnly,
    refresh_on: field.refreshOn,
    null_when_empty: field.nullWhenEmpty,
    format: field.format,
    decimals: field.decimals,
    prefix: field.prefix,
    suffix: field.suffix,
    visible: field.visible,
    sortable: field.sortable,
    filterable: field.filterable,
  };
  return request<CalculatedField>('/calculated-fields', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Update an existing calculated field definition. */
export function updateCalculatedField(
  id: string,
  field: Partial<CalculatedField>,
): Promise<CalculatedField> {
  // Convert camelCase keys to snake_case for the API
  const body: Record<string, unknown> = {};
  if (field.name !== undefined) body.name = field.name;
  if (field.caption !== undefined) body.caption = field.caption;
  if (field.tableName !== undefined) body.table_name = field.tableName;
  if (field.calcType !== undefined) body.calc_type = field.calcType;
  if (field.expression !== undefined) body.expression = field.expression;
  if (field.dataType !== undefined) body.data_type = field.dataType;
  if (field.dependsOn !== undefined) body.depends_on = field.dependsOn;
  if (field.dependsOnTables !== undefined)
    body.depends_on_tables = field.dependsOnTables;
  if (field.readOnly !== undefined) body.read_only = field.readOnly;
  if (field.refreshOn !== undefined) body.refresh_on = field.refreshOn;
  if (field.nullWhenEmpty !== undefined)
    body.null_when_empty = field.nullWhenEmpty;
  if (field.format !== undefined) body.format = field.format;
  if (field.decimals !== undefined) body.decimals = field.decimals;
  if (field.prefix !== undefined) body.prefix = field.prefix;
  if (field.suffix !== undefined) body.suffix = field.suffix;
  if (field.visible !== undefined) body.visible = field.visible;
  if (field.sortable !== undefined) body.sortable = field.sortable;
  if (field.filterable !== undefined) body.filterable = field.filterable;

  return request<CalculatedField>(`/calculated-fields/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** Delete a calculated field definition. */
export function deleteCalculatedField(id: string): Promise<void> {
  return request<void>(`/calculated-fields/${id}`, {
    method: 'DELETE',
  });
}
