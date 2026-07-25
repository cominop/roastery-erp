/**
 * Unit tests for calculated field API client (calculatedFieldsApi.ts).
 *
 * Uses vi.fn() as a fetch mock — each test registers expected responses
 * in order of calls.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchCalculatedFields,
  fetchCalculatedField,
  createCalculatedField,
  updateCalculatedField,
  deleteCalculatedField,
} from '../calculated-fields/api/calculatedFieldsApi';

// ─── Mock helpers ──────────────────────────────────────

type MockCall = { url: string; method?: string; body?: unknown };
type MockResponse = { ok: boolean; data: unknown };

let callIndex = 0;
let mockResponses: MockResponse[] = [];
let mockCalls: MockCall[] = [];

function makeMockFetch(): typeof fetch {
  return ((url: string, opts?: RequestInit) => {
    const resp = mockResponses[callIndex] ?? { ok: false, data: { error: 'unexpected call' } };
    const method = (opts?.method as string | undefined) ?? 'GET';
    let body: unknown = undefined;
    if (opts?.body && typeof opts.body === 'string') {
      body = JSON.parse(opts.body);
    }
    mockCalls.push({ url, method, body });
    callIndex++;
    return Promise.resolve(
      new Response(JSON.stringify(resp.data), {
        status: resp.ok ? 200 : 400,
        statusText: resp.ok ? 'OK' : 'Bad Request',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as typeof fetch;
}

// ─── Fixtures ──────────────────────────────────────────

const mockField: Record<string, unknown> = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'order_total',
  caption: 'Order Total',
  table_name: 'orders',
  calc_type: 'formula',
  expression: 'quantity * unit_price',
  data_type: 'currency',
  depends_on: ['quantity', 'unit_price'],
  depends_on_tables: [],
  read_only: true,
  refresh_on: 'read',
  null_when_empty: false,
  format: '$%.2f',
  decimals: 2,
  prefix: '$',
  suffix: null,
  visible: true,
  sortable: true,
  filterable: false,
  created_at: '2026-07-24T12:00:00Z',
  updated_at: '2026-07-24T12:00:00Z',
};

const mockFieldList = [
  mockField,
  {
    ...mockField,
    id: '660e8400-e29b-41d4-a716-446655440001',
    name: 'line_count',
    table_name: 'order_details',
    calc_type: 'aggregate',
    expression: 'COUNT(*)',
    data_type: 'number',
  },
];

// ─── Setup ─────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  callIndex = 0;
  mockResponses = [];
  mockCalls = [];
});

// ─── Tests ─────────────────────────────────────────────

describe('fetchCalculatedFields', () => {
  it('fetches all calculated fields without filter', async () => {
    mockResponses = [{ ok: true, data: mockFieldList }];
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeMockFetch());

    const result = await fetchCalculatedFields();

    expect(result).toEqual(mockFieldList);
    expect(mockCalls[0].url).toBe('/api/calculated-fields');
    expect(mockCalls[0].method).toBe('GET');
  });

  it('fetches with table_name filter', async () => {
    mockResponses = [{ ok: true, data: [mockField] }];
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeMockFetch());

    const result = await fetchCalculatedFields('orders');

    expect(result).toEqual([mockField]);
    expect(mockCalls[0].url).toBe('/api/calculated-fields?table_name=orders');
  });
});

describe('fetchCalculatedField', () => {
  it('fetches a single calculated field by id', async () => {
    mockResponses = [{ ok: true, data: mockField }];
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeMockFetch());

    const result = await fetchCalculatedField(mockField.id as string);

    expect(result).toEqual(mockField);
    expect(mockCalls[0].url).toBe(`/api/calculated-fields/${mockField.id}`);
  });
});

describe('createCalculatedField', () => {
  it('sends POST with snake_case body and returns the created field', async () => {
    mockResponses = [{ ok: true, data: mockField }];
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeMockFetch());

    const input = {
      name: 'order_total' as const,
      caption: 'Order Total',
      tableName: 'orders',
      calcType: 'formula' as const,
      expression: 'quantity * unit_price',
      dataType: 'currency' as const,
      dependsOn: ['quantity', 'unit_price'],
      dependsOnTables: [],
      readOnly: true,
      refreshOn: 'read' as const,
      nullWhenEmpty: false,
      format: '$%.2f',
      decimals: 2,
      prefix: '$',
      suffix: undefined,
      visible: true,
      sortable: true,
      filterable: false,
    };

    const result = await createCalculatedField(input);

    expect(result).toEqual(mockField);
    expect(mockCalls[0].method).toBe('POST');
    expect(mockCalls[0].url).toBe('/api/calculated-fields');
    expect((mockCalls[0].body as Record<string, unknown>).table_name).toBe('orders');
    expect((mockCalls[0].body as Record<string, unknown>).calc_type).toBe('formula');
    expect((mockCalls[0].body as Record<string, unknown>).data_type).toBe('currency');
    expect((mockCalls[0].body as Record<string, unknown>).read_only).toBe(true);
    expect((mockCalls[0].body as Record<string, unknown>).refresh_on).toBe('read');
  });

  it('throws on validation errors', async () => {
    mockResponses = [{ ok: false, data: { error: 'name is required' } }];
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeMockFetch());

    const input = {
      name: 'test',
      caption: 'Test',
      tableName: 'orders',
      calcType: 'formula' as const,
      expression: '1 + 1',
      dataType: 'number' as const,
      dependsOn: [],
      dependsOnTables: [],
      readOnly: true,
      refreshOn: 'read' as const,
      nullWhenEmpty: false,
      visible: true,
      sortable: true,
      filterable: false,
    };

    await expect(createCalculatedField(input)).rejects.toThrow('name is required');
  });
});

describe('updateCalculatedField', () => {
  it('sends PUT with snake_case body and returns updated field', async () => {
    const updated = { ...mockField, caption: 'Updated Total' };
    mockResponses = [{ ok: true, data: updated }];
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeMockFetch());

    const result = await updateCalculatedField(mockField.id as string, {
      caption: 'Updated Total',
    });

    expect(result).toEqual(updated);
    expect(mockCalls[0].method).toBe('PUT');
    expect(mockCalls[0].url).toBe(`/api/calculated-fields/${mockField.id}`);
    expect((mockCalls[0].body as Record<string, unknown>).caption).toBe('Updated Total');
  });
});

describe('deleteCalculatedField', () => {
  it('sends DELETE and resolves with ok true', async () => {
    mockResponses = [{ ok: true, data: { ok: true } }];
    vi.spyOn(globalThis, 'fetch').mockImplementation(makeMockFetch());

    const result = await deleteCalculatedField(mockField.id as string);

    expect(result).toEqual({ ok: true });
    expect(mockCalls[0].method).toBe('DELETE');
    expect(mockCalls[0].url).toBe(`/api/calculated-fields/${mockField.id}`);
  });
});
