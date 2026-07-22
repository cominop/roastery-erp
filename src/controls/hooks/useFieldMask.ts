// useFieldMask — input masking for data-aware form controls
// Supports: # (digit), @ (letter), X (alphanumeric), ? (optional preceding char)
// All other characters are literal separators inserted automatically.
import { useMemo } from 'react';

function isDigit(ch: string): boolean {
  return ch.length === 1 && ch >= '0' && ch <= '9';
}

function isLetter(ch: string): boolean {
  return ch.length === 1 && ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z'));
}

function isAlphanumeric(ch: string): boolean {
  return isDigit(ch) || isLetter(ch);
}

function charMatchesKind(ch: string, kind: string): boolean {
  if (kind === '#') return isDigit(ch);
  if (kind === '@') return isLetter(ch);
  if (kind === 'X') return isAlphanumeric(ch);
  return false;
}

function isPlaceholder(ch: string): boolean {
  return ch === '#' || ch === '@' || ch === 'X';
}

/**
 * Formats a raw (unmasked) input value through the mask pattern.
 * Walks the mask and raw-value in parallel, auto-inserting literal
 * separators and skipping non-matching characters.
 */
function formatRaw(rawValue: string, mask: string): string {
  let result = '';
  let rawIdx = 0;
  const maxMask = mask.length;

  for (let maskIdx = 0; maskIdx < maxMask && rawIdx < rawValue.length; maskIdx++) {
    const mc = mask[maskIdx];

    if (isPlaceholder(mc)) {
      // Check if next char is '?' (optional marker)
      const optional = maskIdx + 1 < maxMask && mask[maskIdx + 1] === '?';

      // Try to place the current raw character
      const ch = rawValue[rawIdx];
      if (charMatchesKind(ch, mc)) {
        result += ch;
        rawIdx++;
      } else if (!optional) {
        // Required placeholder but char doesn't match — skip the raw char and retry
        rawIdx++;
        maskIdx--;
        continue;
      }
      // If optional and no match, just skip this placeholder slot

      if (optional) maskIdx++; // skip the '?'
    } else if (mc === '?') {
      // Standalone '?' — skip it (already handled above)
      continue;
    } else {
      // Literal separator — auto-insert
      result += mc;
    }
  }

  return result;
}

/**
 * Extracts raw (user-entered) characters from an input value by scanning
 * through the value and picking up chars that match the mask's placeholder
 * kinds in order. Works for both fully-formatted values like "(212) 555-0142"
 * and raw/partially-typed values like "2" or "2125550142".
 */
function extractRawFromValue(value: string, mask: string): string {
  let raw = '';
  let maskIdx = 0;

  for (let i = 0; i < value.length && maskIdx < mask.length; i++) {
    const ch = value[i];

    // Advance mask past any non-placeholder characters (literals and '?')
    while (maskIdx < mask.length && !isPlaceholder(mask[maskIdx])) {
      maskIdx++;
    }

    if (maskIdx >= mask.length) break;

    // maskIdx now points to a placeholder (#, @, or X)
    const mc = mask[maskIdx];

    // Check if this placeholder has an optional marker after it
    const isOptional = maskIdx + 1 < mask.length && mask[maskIdx + 1] === '?';

    if (charMatchesKind(ch, mc)) {
      raw += ch;
      maskIdx++;
      // Skip optional marker if present
      if (maskIdx < mask.length && mask[maskIdx] === '?') {
        maskIdx++;
      }
    } else if (isOptional) {
      // Optional placeholder with non-matching char — skip the entire
      // placeholder slot (placeholder + '?') without consuming the char.
      // Re-try the same value char at the next mask position.
      maskIdx += 2;
      i--;
    }
    // Required placeholder with non-matching char — skip the char (continue)
  }

  return raw;
}

export function useFieldMask(mask: string | undefined): {
  applyMask: (inputValue: string) => string;
  getUnmaskedValue: (maskedValue: string) => string;
  formatDisplay: (rawValue: string) => string;
} {
  return useMemo(() => {
    if (!mask) {
      return {
        applyMask: (v: string) => v,
        getUnmaskedValue: (v: string) => v,
        formatDisplay: (v: string) => v,
      };
    }

    const applyMask = (inputValue: string): string => {
      // Extract raw chars (handles both formatted and unformatted input)
      const raw = extractRawFromValue(inputValue, mask);
      return formatRaw(raw, mask);
    };

    const getUnmaskedValue = (maskedValue: string): string => {
      return extractRawFromValue(maskedValue, mask);
    };

    const formatDisplay = (rawValue: string): string => {
      const raw = extractRawFromValue(rawValue || '', mask);
      return formatRaw(raw, mask);
    };

    return { applyMask, getUnmaskedValue, formatDisplay };
  }, [mask]);
}
