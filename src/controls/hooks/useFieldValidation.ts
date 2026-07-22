// useFieldValidation — client-side field validation hook
// Validates required, type, min/max, date constraints, and custom rules.
import { useMemo } from 'react';
import type { FieldDefinition } from '../schema/controlSchema';

/**
 * Get today's date as YYYY-MM-DD string.
 */
function getTodayString(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Check if a value is empty (null, undefined, or empty string).
 */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Run all validation rules for a field and return the first error found.
 */
function validateField(field: FieldDefinition, value: unknown): string | null {
  // 1. Required check
  if (field.required && isEmpty(value)) {
    return `${field.caption || field.name} is required`;
  }

  // Skip further validation if value is empty (non-required fields)
  if (isEmpty(value)) return null;

  // 2. Type check + min/max range for numeric types
  if (field.type === 'INTEGER') {
    const num = Number(value);
    if (!Number.isInteger(num)) {
      return `${field.caption || field.name} must be a valid whole number`;
    }
    // Min/max range
    if (field.min != null && num < field.min) {
      return `${field.caption || field.name} must be at least ${field.min}`;
    }
    if (field.max != null && num > field.max) {
      return `${field.caption || field.name} must be at most ${field.max}`;
    }
  }

  if (field.type === 'FLOAT' || field.type === 'CURRENCY') {
    const num = Number(value);
    if (isNaN(num)) {
      return `${field.caption || field.name} must be a valid number`;
    }
    // Min/max range
    if (field.min != null && num < field.min) {
      return `${field.caption || field.name} must be at least ${field.min}`;
    }
    if (field.max != null && num > field.max) {
      return `${field.caption || field.name} must be at most ${field.max}`;
    }
  }

  // 3. Date constraints
  if (field.type === 'DATE' || field.type === 'DATETIME') {
    const strVal = String(value);
    let minDate: string | undefined;
    let maxDate: string | undefined;

    if (field.min === ('today' as unknown)) {
      minDate = getTodayString();
    } else if (field.min != null) {
      minDate = String(field.min);
    }

    if (field.max != null) {
      maxDate = String(field.max);
    }

    if (minDate && strVal < minDate) {
      return `${field.caption || field.name} must be on or after ${minDate}`;
    }
    if (maxDate && strVal > maxDate) {
      return `${field.caption || field.name} must be on or before ${maxDate}`;
    }
  }

  // 4. Custom validation rule
  if (field.validationRule && field.validationText) {
    try {
      // Create a function from the expression string where `value` is available
      const ruleFn = new Function('value', `return Boolean(${field.validationRule});`);
      const result = ruleFn(value);
      if (!result) {
        return field.validationText;
      }
    } catch {
      // If the rule expression fails to evaluate, skip custom validation
      // rather than crashing the form
    }
  }

  return null;
}

/**
 * Hook that runs field validation and returns the first error message,
 * or null if the value passes all validation rules.
 *
 * @param field - The field definition containing validation rules
 * @param value - The current field value
 * @param enabled - When false, validation is skipped (returns null)
 */
export function useFieldValidation(
  field: FieldDefinition,
  value: unknown,
  enabled: boolean = true,
): string | null {
  return useMemo(() => {
    if (!enabled) return null;
    return validateField(field, value);
  }, [field, value, enabled]);
}
