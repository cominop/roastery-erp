// useFieldMask unit tests
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFieldMask } from '../hooks/useFieldMask';

/** Convenience: extract the three fns from the hook for a given mask. */
function useMask(mask: string | undefined) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return renderHook(() => useFieldMask(mask)).result.current;
}

describe('useFieldMask — applyMask (formatting as user types)', () => {
  it('formats phone number mask: (###) ###-####', () => {
    const { applyMask, getUnmaskedValue, formatDisplay } = useMask('(###) ###-####');

    // Simulate typing character by character through applyMask
    // applyMask strips existing formatting and re-formats
    expect(applyMask('2')).toBe('(2');
    expect(applyMask('21')).toBe('(21');
    expect(applyMask('212')).toBe('(212');
    expect(applyMask('2125')).toBe('(212) 5');
    expect(applyMask('21255')).toBe('(212) 55');
    expect(applyMask('212555')).toBe('(212) 555');
    expect(applyMask('2125550')).toBe('(212) 555-0');
    expect(applyMask('21255501')).toBe('(212) 555-01');
    expect(applyMask('212555014')).toBe('(212) 555-014');
    expect(applyMask('2125550142')).toBe('(212) 555-0142');

    // formatDisplay should produce the same output from raw input
    expect(formatDisplay('2125550142')).toBe('(212) 555-0142');
    // getUnmaskedValue should strip formatting
    expect(getUnmaskedValue('(212) 555-0142')).toBe('2125550142');
  });

  it('formats SSN mask: ###-##-####', () => {
    const { formatDisplay, getUnmaskedValue } = useMask('###-##-####');
    expect(formatDisplay('123456789')).toBe('123-45-6789');
    expect(getUnmaskedValue('123-45-6789')).toBe('123456789');
  });

  it('formats ZIP mask: #####', () => {
    const { formatDisplay } = useMask('#####');
    expect(formatDisplay('94117')).toBe('94117');
  });

  it('formats ZIP+4 mask: #####-####', () => {
    const { formatDisplay, getUnmaskedValue } = useMask('#####-####');
    expect(formatDisplay('941170001')).toBe('94117-0001');
    expect(getUnmaskedValue('94117-0001')).toBe('941170001');
  });

  it('handles partial input — does not complete the mask', () => {
    const { formatDisplay, getUnmaskedValue } = useMask('(###) ###-####');
    // Only 3 digits typed
    expect(formatDisplay('212')).toBe('(212');
    expect(getUnmaskedValue('(212')).toBe('212');
    // Only 7 digits typed
    expect(formatDisplay('2125550')).toBe('(212) 555-0');
    expect(getUnmaskedValue('(212) 555-0')).toBe('2125550');
  });

  it('handles backspace through literals', () => {
    const { formatDisplay, getUnmaskedValue } = useMask('(###) ###-####');

    // Start with full value
    let raw = '2125550142';
    let display = formatDisplay(raw);

    // Backspace removes last entered char — simulate by removing last raw char
    raw = '212555014';
    display = formatDisplay(raw);
    expect(display).toBe('(212) 555-014');

    // Backspace again
    raw = '21255501';
    display = formatDisplay(raw);
    expect(display).toBe('(212) 555-01');

    // Backspace past dash literal
    raw = '2125550';
    display = formatDisplay(raw);
    expect(display).toBe('(212) 555-0');

    // Backspace to just area code
    raw = '212';
    display = formatDisplay(raw);
    expect(display).toBe('(212');

    // Verify getUnmaskedValue can handle the formatted strings
    expect(getUnmaskedValue('(212) 555-014')).toBe('212555014');
    expect(getUnmaskedValue('(212) 555-0')).toBe('2125550');
    expect(getUnmaskedValue('(212')).toBe('212');
  });

  it('handles letter mask: @######', () => {
    const { formatDisplay } = useMask('@######');
    expect(formatDisplay('A12345')).toBe('A12345');
  });

  it('skips characters that do not match the placeholder kind', () => {
    const { formatDisplay } = useMask('###');
    // Typing 'A' into a digit-only mask should be skipped
    expect(formatDisplay('A')).toBe('');
    expect(formatDisplay('12A')).toBe('12');
    expect(formatDisplay('12A3')).toBe('123');
  });

  it('handles alphanumeric mask: XXX-XXX', () => {
    const { formatDisplay, getUnmaskedValue } = useMask('XXX-XXX');
    expect(formatDisplay('ABC123')).toBe('ABC-123');
    expect(getUnmaskedValue('ABC-123')).toBe('ABC123');
  });

  it('handles mixed mask with literals only (no placeholders)', () => {
    const { formatDisplay, getUnmaskedValue } = useMask('---');
    expect(formatDisplay('')).toBe('');
    expect(getUnmaskedValue('---')).toBe('');
  });

  it('handles leading literal characters', () => {
    // International phone with leading +
    const { formatDisplay, getUnmaskedValue } = useMask('+# (###) ###-####');
    expect(formatDisplay('12125550142')).toBe('+1 (212) 555-0142');
    expect(getUnmaskedValue('+1 (212) 555-0142')).toBe('12125550142');
  });

  it('handles the ? optional operator', () => {
    // Mask where the second # is optional: ##?-##
    const { formatDisplay } = useMask('##?-XX');

    // With two digits
    expect(formatDisplay('12AB')).toBe('12-AB');

    // With one digit (the optional second # is skipped)
    expect(formatDisplay('1AB')).toBe('1-AB');
  });

  it('returns empty string for empty raw input', () => {
    const { formatDisplay } = useMask('(###) ###-####');
    expect(formatDisplay('')).toBe('');
    expect(formatDisplay(undefined as unknown as string)).toBe('');
  });

  it('handles paste: raw string gets formatted through mask', () => {
    const { formatDisplay } = useMask('(###) ###-####');
    // Paste "2125550142"
    expect(formatDisplay('2125550142')).toBe('(212) 555-0142');
  });
});

describe('useFieldMask — getUnmaskedValue (stripping formatting)', () => {
  it('returns raw value for phone mask', () => {
    const { getUnmaskedValue } = useMask('(###) ###-####');
    expect(getUnmaskedValue('(212) 555-0142')).toBe('2125550142');
  });

  it('returns raw value for partially typed input', () => {
    const { getUnmaskedValue } = useMask('(###) ###-####');
    expect(getUnmaskedValue('(212')).toBe('212');
    expect(getUnmaskedValue('(212)')).toBe('212');
    expect(getUnmaskedValue('(212) 5')).toBe('2125');
  });

  it('returns raw value for SSN mask', () => {
    const { getUnmaskedValue } = useMask('###-##-####');
    expect(getUnmaskedValue('123-45-6789')).toBe('123456789');
  });

  it('returns raw value for ZIP+4 mask', () => {
    const { getUnmaskedValue } = useMask('#####-####');
    expect(getUnmaskedValue('94117-0001')).toBe('941170001');
  });

  it('handles empty or missing mask', () => {
    const { getUnmaskedValue } = useMask(undefined);
    expect(getUnmaskedValue('anything')).toBe('anything');

    const { getUnmaskedValue: g2 } = useMask('');
    expect(g2('anything')).toBe('anything');
  });
});

describe('useFieldMask — no mask (passthrough)', () => {
  it('applyMask is identity when mask is undefined', () => {
    const { applyMask } = useMask(undefined);
    expect(applyMask('hello')).toBe('hello');
    expect(applyMask('123')).toBe('123');
  });

  it('getUnmaskedValue is identity when mask is undefined', () => {
    const { getUnmaskedValue } = useMask(undefined);
    expect(getUnmaskedValue('hello')).toBe('hello');
  });

  it('formatDisplay is identity when mask is undefined', () => {
    const { formatDisplay } = useMask(undefined);
    expect(formatDisplay('hello')).toBe('hello');
  });

  it('all fns are identity when mask is empty string', () => {
    const { applyMask, getUnmaskedValue, formatDisplay } = useMask('');
    expect(applyMask('test')).toBe('test');
    expect(getUnmaskedValue('test')).toBe('test');
    expect(formatDisplay('test')).toBe('test');
  });
});
