// useFieldValidation unit tests
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFieldValidation } from '../hooks/useFieldValidation';
import type { FieldDefinition } from '../schema/controlSchema';

function makeField(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: 'test-field',
    name: 'testField',
    caption: 'Test Field',
    type: 'TEXT',
    ...overrides,
  };
}

describe('useFieldValidation - required', () => {
  it('returns null when field is not required and value is empty', () => {
    const field = makeField({ type: 'TEXT', required: false });
    const { result } = renderHook(() => useFieldValidation(field, ''));
    expect(result.current).toBeNull();
  });

  it('returns error when required field has null value', () => {
    const field = makeField({ type: 'TEXT', required: true });
    const { result } = renderHook(() => useFieldValidation(field, null));
    expect(result.current).toBe('Test Field is required');
  });

  it('returns error when required field has undefined value', () => {
    const field = makeField({ type: 'TEXT', required: true });
    const { result } = renderHook(() => useFieldValidation(field, undefined));
    expect(result.current).toBe('Test Field is required');
  });

  it('returns error when required field has empty string value', () => {
    const field = makeField({ type: 'TEXT', required: true });
    const { result } = renderHook(() => useFieldValidation(field, ''));
    expect(result.current).toBe('Test Field is required');
  });

  it('returns null when required field has a value', () => {
    const field = makeField({ type: 'TEXT', required: true });
    const { result } = renderHook(() => useFieldValidation(field, 'hello'));
    expect(result.current).toBeNull();
  });

  it('uses field.name as fallback when caption is empty', () => {
    const field = makeField({ type: 'TEXT', required: true, caption: '' });
    const { result } = renderHook(() => useFieldValidation(field, null));
    expect(result.current).toBe('testField is required');
  });
});

describe('useFieldValidation - type checks', () => {
  it('returns error for INTEGER when value is not an integer', () => {
    const field = makeField({ type: 'INTEGER' });
    const { result } = renderHook(() => useFieldValidation(field, 3.14));
    expect(result.current).toBe('Test Field must be a valid whole number');
  });

  it('returns null for valid INTEGER value', () => {
    const field = makeField({ type: 'INTEGER' });
    const { result } = renderHook(() => useFieldValidation(field, 42));
    expect(result.current).toBeNull();
  });

  it('returns error for FLOAT when value is not a number', () => {
    const field = makeField({ type: 'FLOAT' });
    const { result } = renderHook(() => useFieldValidation(field, 'abc'));
    expect(result.current).toBe('Test Field must be a valid number');
  });

  it('returns null for valid FLOAT value', () => {
    const field = makeField({ type: 'FLOAT' });
    const { result } = renderHook(() => useFieldValidation(field, 3.14));
    expect(result.current).toBeNull();
  });

  it('returns error for CURRENCY when value is not a number', () => {
    const field = makeField({ type: 'CURRENCY' });
    const { result } = renderHook(() => useFieldValidation(field, 'not-a-number'));
    expect(result.current).toBe('Test Field must be a valid number');
  });

  it('returns null for valid CURRENCY value', () => {
    const field = makeField({ type: 'CURRENCY' });
    const { result } = renderHook(() => useFieldValidation(field, 99.99));
    expect(result.current).toBeNull();
  });
});

describe('useFieldValidation - min/max range', () => {
  it('returns error when INTEGER value is below min', () => {
    const field = makeField({ type: 'INTEGER', min: 10, max: 100 });
    const { result } = renderHook(() => useFieldValidation(field, 5));
    expect(result.current).toBe('Test Field must be at least 10');
  });

  it('returns error when INTEGER value is above max', () => {
    const field = makeField({ type: 'INTEGER', min: 10, max: 100 });
    const { result } = renderHook(() => useFieldValidation(field, 200));
    expect(result.current).toBe('Test Field must be at most 100');
  });

  it('returns null when INTEGER value is within range', () => {
    const field = makeField({ type: 'INTEGER', min: 10, max: 100 });
    const { result } = renderHook(() => useFieldValidation(field, 50));
    expect(result.current).toBeNull();
  });

  it('returns error when FLOAT value is below min', () => {
    const field = makeField({ type: 'FLOAT', min: 0, max: 100 });
    const { result } = renderHook(() => useFieldValidation(field, -5.5));
    expect(result.current).toBe('Test Field must be at least 0');
  });

  it('returns error when FLOAT value is above max', () => {
    const field = makeField({ type: 'FLOAT', min: 0, max: 100 });
    const { result } = renderHook(() => useFieldValidation(field, 150.5));
    expect(result.current).toBe('Test Field must be at most 100');
  });
});

describe('useFieldValidation - date constraints', () => {
  it('returns error when DATE is before min', () => {
    const field = makeField({ type: 'DATE', min: '2026-06-01' as unknown as number });
    const { result } = renderHook(() => useFieldValidation(field, '2026-05-15'));
    expect(result.current).toBe('Test Field must be on or after 2026-06-01');
  });

  it('returns error when DATE is after max', () => {
    const field = makeField({ type: 'DATE', max: '2026-12-31' as unknown as number });
    const { result } = renderHook(() => useFieldValidation(field, '2027-01-01'));
    expect(result.current).toBe('Test Field must be on or before 2026-12-31');
  });

  it('returns null when DATE is within range', () => {
    const field = makeField({ type: 'DATE', min: '2026-01-01' as unknown as number, max: '2026-12-31' as unknown as number });
    const { result } = renderHook(() => useFieldValidation(field, '2026-06-15'));
    expect(result.current).toBeNull();
  });

  it('returns null when DATETIME is within range', () => {
    const field = makeField({ type: 'DATETIME', min: '2026-01-01' as unknown as number });
    const { result } = renderHook(() => useFieldValidation(field, '2026-06-15T14:30'));
    expect(result.current).toBeNull();
  });

  it('handles min="today" for DATE fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00'));

    const field = makeField({ type: 'DATE', min: 'today' as unknown as number });
    const { result } = renderHook(() => useFieldValidation(field, '2026-07-20'));
    expect(result.current).toBe('Test Field must be on or after 2026-07-21');

    vi.useRealTimers();
  });
});

describe('useFieldValidation - custom validation rule', () => {
  it('returns validationText when custom rule fails', () => {
    const field = makeField({
      type: 'TEXT',
      validationRule: 'value && value.length >= 3',
      validationText: 'Must be at least 3 characters',
    });
    const { result } = renderHook(() => useFieldValidation(field, 'ab'));
    expect(result.current).toBe('Must be at least 3 characters');
  });

  it('returns null when custom rule passes', () => {
    const field = makeField({
      type: 'TEXT',
      validationRule: 'value && value.length >= 3',
      validationText: 'Must be at least 3 characters',
    });
    const { result } = renderHook(() => useFieldValidation(field, 'hello'));
    expect(result.current).toBeNull();
  });

  it('skips custom validation when validationText is not set', () => {
    const field = makeField({
      type: 'TEXT',
      validationRule: 'value && value.length >= 3',
    });
    const { result } = renderHook(() => useFieldValidation(field, 'ab'));
    expect(result.current).toBeNull();
  });

  it('skips custom validation when rule expression throws', () => {
    const field = makeField({
      type: 'TEXT',
      validationRule: 'invalid syntax {{{',
      validationText: 'Should not appear',
    });
    const { result } = renderHook(() => useFieldValidation(field, 'test'));
    expect(result.current).toBeNull();
  });

  it('evaluates rule with numeric value', () => {
    const field = makeField({
      type: 'INTEGER',
      validationRule: 'value > 0',
      validationText: 'Must be positive',
    });
    const { result: negResult } = renderHook(() => useFieldValidation(field, -1));
    expect(negResult.current).toBe('Must be positive');

    const { result: posResult } = renderHook(() => useFieldValidation(field, 5));
    expect(posResult.current).toBeNull();
  });
});

describe('useFieldValidation - enabled/disabled', () => {
  it('returns null when enabled is false', () => {
    const field = makeField({ type: 'TEXT', required: true });
    const { result } = renderHook(() => useFieldValidation(field, '', false));
    expect(result.current).toBeNull();
  });

  it('validates when enabled is true', () => {
    const field = makeField({ type: 'TEXT', required: true });
    const { result } = renderHook(() => useFieldValidation(field, '', true));
    expect(result.current).toBe('Test Field is required');
  });

  it('defaults to enabled=true', () => {
    const field = makeField({ type: 'TEXT', required: true });
    const { result } = renderHook(() => useFieldValidation(field, ''));
    expect(result.current).toBe('Test Field is required');
  });
});

describe('useFieldValidation - skips for empty non-required fields', () => {
  it('returns null for empty non-required INTEGER field', () => {
    const field = makeField({ type: 'INTEGER', required: false });
    const { result } = renderHook(() => useFieldValidation(field, null));
    expect(result.current).toBeNull();
  });

  it('returns null for empty non-required FLOAT field', () => {
    const field = makeField({ type: 'FLOAT', required: false });
    const { result } = renderHook(() => useFieldValidation(field, ''));
    expect(result.current).toBeNull();
  });
});
