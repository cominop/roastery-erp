// useDependentLookups unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDependentLookups, type DependentField } from '../hooks/useDependentLookups';

// Mock the API module
vi.mock('@/lib/api', () => ({
  runLookup: vi.fn(),
}));

import { runLookup } from '@/lib/api';

function makeDependentFields(
  overrides?: Partial<DependentField>[],
): DependentField[] {
  if (overrides) return overrides;
  return [
    { fieldName: 'companyname', masterField: 'customerId' },
    { fieldName: 'phone', masterField: 'customerId' },
    { fieldName: 'city', masterField: 'customerId' },
  ];
}

describe('useDependentLookups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 1: Returns empty values when masterValue is null ──────────
  it('returns empty object when masterValue is null', () => {
    const { result } = renderHook(() =>
      useDependentLookups(null, 'customers', makeDependentFields()),
    );

    expect(result.current.dependentValues).toEqual({});
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(runLookup).not.toHaveBeenCalled();
  });

  it('returns empty object when masterValue is undefined', () => {
    const { result } = renderHook(() =>
      useDependentLookups(undefined, 'customers', makeDependentFields()),
    );

    expect(result.current.dependentValues).toEqual({});
    expect(result.current.loading).toBe(false);
    expect(runLookup).not.toHaveBeenCalled();
  });

  it('returns empty object when masterValue is empty string', () => {
    const { result } = renderHook(() =>
      useDependentLookups('', 'customers', makeDependentFields()),
    );

    expect(result.current.dependentValues).toEqual({});
    expect(runLookup).not.toHaveBeenCalled();
  });

  // ─── Test 2: Fetches and returns dependent values on masterValue change ──
  it('fetches and returns dependent values when masterValue changes', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          companyname: 'Acme Corp',
          phone: '555-0100',
          city: 'Toronto',
        },
      ],
      fields: ['id', 'companyname', 'phone', 'city'],
    });

    const { result } = renderHook(() =>
      useDependentLookups(1, 'customers', makeDependentFields()),
    );

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dependentValues).toEqual({
      companyname: 'Acme Corp',
      phone: '555-0100',
      city: 'Toronto',
    });
    expect(result.current.error).toBeNull();

    // Verify the SQL query was constructed correctly
    expect(mockRunLookup).toHaveBeenCalledTimes(1);
    const sql = mockRunLookup.mock.calls[0][0] as string;
    expect(sql).toContain('SELECT id, companyname, phone, city FROM customers');
    expect(sql).toContain('WHERE id = 1');
    expect(sql).toContain('LIMIT 1');
  });

  // ─── Test 3: Uses cached value (no duplicate query) ────────────────
  it('uses cached value when same masterValue is set again', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockResolvedValueOnce({
      rows: [
        {
          id: 42,
          companyname: 'Cached Co',
          phone: '555-0099',
          city: 'Montreal',
        },
      ],
      fields: ['id', 'companyname', 'phone', 'city'],
    });

    // First render — should trigger a query
    const { result, rerender } = renderHook(
      ({ masterValue }) =>
        useDependentLookups(masterValue, 'customers', makeDependentFields()),
      { initialProps: { masterValue: 42 } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dependentValues).toEqual({
      companyname: 'Cached Co',
      phone: '555-0099',
      city: 'Montreal',
    });
    expect(mockRunLookup).toHaveBeenCalledTimes(1);

    // Rerender with same masterValue — should use cache, no new query
    rerender({ masterValue: 42 });

    // Wait a tick to ensure no async operations fire
    await new Promise(r => setTimeout(r, 50));

    expect(mockRunLookup).toHaveBeenCalledTimes(1);
    expect(result.current.dependentValues).toEqual({
      companyname: 'Cached Co',
      phone: '555-0099',
      city: 'Montreal',
    });
  });

  // ─── Test 4: Handles API error gracefully ──────────────────────────
  it('handles API error gracefully', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockRejectedValueOnce(new Error('Database connection failed'));

    const { result } = renderHook(() =>
      useDependentLookups(99, 'customers', makeDependentFields()),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dependentValues).toEqual({});
    expect(result.current.error).toBe('Database connection failed');
  });

  // ─── Test 5: Handles null/undefined values in dependent fields ─────
  it('handles null/undefined values in dependent fields', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          companyname: 'Partial Co',
          phone: null,
          city: undefined,
        },
      ],
      fields: ['id', 'companyname', 'phone', 'city'],
    });

    const { result } = renderHook(() =>
      useDependentLookups(7, 'customers', makeDependentFields()),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // null/undefined values should be mapped to null
    expect(result.current.dependentValues).toEqual({
      companyname: 'Partial Co',
      phone: null,
      city: null,
    });
    expect(result.current.error).toBeNull();
  });

  // ─── Test 6: No query when dependentFields is empty ────────────────
  it('does not query when dependentFields is empty', () => {
    const { result } = renderHook(() =>
      useDependentLookups(1, 'customers', []),
    );

    expect(result.current.dependentValues).toEqual({});
    expect(result.current.loading).toBe(false);
    expect(runLookup).not.toHaveBeenCalled();
  });

  // ─── Test 7: Handles string masterValue ────────────────────────────
  it('handles string masterValue with proper SQL escaping', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockResolvedValueOnce({
      rows: [
        {
          id: 'abc-123',
          companyname: 'String ID Co',
          phone: '555-0400',
          city: 'Ottawa',
        },
      ],
      fields: ['id', 'companyname', 'phone', 'city'],
    });

    const { result } = renderHook(() =>
      useDependentLookups('abc-123', 'customers', makeDependentFields()),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dependentValues).toEqual({
      companyname: 'String ID Co',
      phone: '555-0400',
      city: 'Ottawa',
    });

    // Verify SQL escaping for string value
    const sql = mockRunLookup.mock.calls[0][0] as string;
    expect(sql).toContain("WHERE id = 'abc-123'");
  });
});