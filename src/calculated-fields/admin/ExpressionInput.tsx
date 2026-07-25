/**
 * ExpressionInput — code editor-style textarea for writing calculated field
 * expressions with token-level syntax highlighting rendered as an overlay.
 *
 * Use Ctrl+Space / Cmd+Space to toggle field picker suggestions on/off
 * (handled externally by the parent).
 */

import { useRef, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Token regexes for client-side highlighting ─────────
//
// Order matters: more-specific patterns first.

interface HighlightToken {
  value: string;
  type:
    | "field-ref"   // {table.field} or {field}
    | "string"      // 'literal' or "literal"
    | "number"      // 42, 3.14
    | "keyword"     // AND, OR, NOT, NULL, TRUE, FALSE
    | "function"    // IIF, NZ, SUM, LEFT, etc.
    | "operator"    // +, -, *, /, =, <>, etc.
    | "paren"
    | "comment";
}

const KEYWORDS = new Set([
  "AND", "OR", "NOT", "NULL", "TRUE", "FALSE", "IN", "IS", "LIKE",
]);

const FUNCTIONS = new Set([
  // Logic
  "IIF", "IF", "NZ", "ISNULL", "SWITCH", "CHOOSE",
  // String
  "LEFT", "RIGHT", "MID", "LEN", "TRIM", "UCASE", "LCASE",
  "INSTR", "REPLACE", "SPACE", "STRING",
  // Math
  "INT", "ABS", "VAL", "ROUND", "SQR", "SGN", "RND",
  // Date
  "NOW", "DATE", "DATEADD", "DATEDIFF", "DATESERIAL", "YEAR",
  "MONTH", "DAY", "WEEKDAY", "HOUR", "MINUTE", "SECOND",
  // Aggregate
  "SUM", "COUNT", "AVG", "MIN", "MAX", "STDEV", "VAR",
  // Conversion
  "CSTR", "CINT", "CLNG", "CDBL", "CDATE", "CBOOL",
  // Format
  "FORMAT",
]);

const FIELD_REF_RE = /\{[^}]*\}/;
const STRING_RE = /'(?:[^'\\]|\\.)*'/;
const DSTRING_RE = /"(?:[^"\\]|\\.)*"/;
const NUMBER_RE = /\b\d+(?:\.\d+)?\b/;
const IDENTIFIER_RE = /\b[A-Za-z_]\w*\b/;
const OPERATOR_RE = /[+\-*/=<>&!]+/;
const PAREN_RE = /[()]/;
const COMMENT_RE = /\/\/.*/;

function tokenizeLine(line: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let pos = 0;

  while (pos < line.length) {
    const rest = line.slice(pos);

    // Comments
    const cmt = COMMENT_RE.exec(rest);
    if (cmt && cmt.index === 0) {
      tokens.push({ value: cmt[0], type: "comment" });
      pos += cmt[0].length;
      continue;
    }

    // Field refs {field}
    const fr = FIELD_REF_RE.exec(rest);
    if (fr && fr.index === 0) {
      tokens.push({ value: fr[0], type: "field-ref" });
      pos += fr[0].length;
      continue;
    }

    // Single-quoted strings
    const sq = STRING_RE.exec(rest);
    if (sq && sq.index === 0) {
      tokens.push({ value: sq[0], type: "string" });
      pos += sq[0].length;
      continue;
    }

    // Double-quoted strings
    const dq = DSTRING_RE.exec(rest);
    if (dq && dq.index === 0) {
      tokens.push({ value: dq[0], type: "string" });
      pos += dq[0].length;
      continue;
    }

    // Numbers
    const num = NUMBER_RE.exec(rest);
    if (num && num.index === 0) {
      tokens.push({ value: num[0], type: "number" });
      pos += num[0].length;
      continue;
    }

    // Identifiers (keywords, functions, bare field refs)
    const id = IDENTIFIER_RE.exec(rest);
    if (id && id.index === 0) {
      const upper = id[0].toUpperCase();
      let type: HighlightToken["type"] = "function";
      if (KEYWORDS.has(upper)) type = "keyword";
      else if (FUNCTIONS.has(upper)) type = "function";
      else type = "field-ref"; // bare identifier = field ref
      tokens.push({ value: id[0], type });
      pos += id[0].length;
      continue;
    }

    // Operators
    const op = OPERATOR_RE.exec(rest);
    if (op && op.index === 0) {
      tokens.push({ value: op[0], type: "operator" });
      pos += op[0].length;
      continue;
    }

    // Parens
    const pa = PAREN_RE.exec(rest);
    if (pa && pa.index === 0) {
      tokens.push({ value: pa[0], type: "paren" });
      pos += pa[0].length;
      continue;
    }

    // Whitespace or unknown char — skip single char
    pos += 1;
  }

  return tokens;
}

function tokenizeFull(text: string): HighlightToken[][] {
  return text.split("\n").map(tokenizeLine);
}

// ─── CSS class map ─────────────────────────────────────

const TOKEN_CLASS: Record<HighlightToken["type"], string> = {
  "field-ref": "text-sky-600 dark:text-sky-400",
  string: "text-amber-600 dark:text-amber-400",
  number: "text-emerald-600 dark:text-emerald-400",
  keyword: "text-purple-600 dark:text-purple-400 font-semibold",
  function: "text-blue-600 dark:text-blue-400",
  operator: "text-rose-600 dark:text-rose-400",
  paren: "text-orange-600 dark:text-orange-400",
  comment: "text-muted-foreground italic",
};

// ─── Component ─────────────────────────────────────────

interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Called when the user presses Ctrl+Space or Cmd+Space */
  onTriggerSuggest?: () => void;
}

export default function ExpressionInput({
  value,
  onChange,
  placeholder,
  className,
  onTriggerSuggest,
}: ExpressionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [highlighted, setHighlighted] = useState<HighlightToken[][]>(() =>
    tokenizeFull(value),
  );

  // Re-tokenize on value change
  useEffect(() => {
    setHighlighted(tokenizeFull(value));
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+Space / Cmd+Space
      if (e.key === " " && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onTriggerSuggest?.();
        return;
      }

      // Tab → insert 2 spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newVal =
          value.slice(0, start) + "  " + value.slice(end);
        onChange(newVal);
        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
        return;
      }

      // Enter → auto-indent
      if (e.key === "Enter") {
        e.preventDefault();
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const beforeCursor = value.slice(0, start);
        const currentLine = beforeCursor.split("\n").pop() ?? "";
        const indent = currentLine.match(/^\s*/)?.[0] ?? "";
        const newVal =
          value.slice(0, start) + "\n" + indent + value.slice(ta.selectionEnd);
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 1 + indent.length;
        });
        return;
      }

      // Typewriter: pass through
    },
    [value, onChange, onTriggerSuggest],
  );

  // Render highlighted overlay
  const renderHighlight = () => {
    return (
      <div
        className="pointer-events-none absolute inset-0 p-2.5 font-mono text-sm leading-relaxed whitespace-pre-wrap break-all overflow-hidden"
        aria-hidden="true"
      >
        {highlighted.map((line, li) => (
          <span key={li}>
            {li > 0 && "\n"}
            {line.length === 0 && (
              <span className="text-muted-foreground/40"> </span>
            )}
            {line.map((tok, ti) => (
              <span key={ti} className={TOKEN_CLASS[tok.type]}>
                {tok.value}
              </span>
            ))}
          </span>
        ))}
        {/* Cursor caret placeholder for alignment */}
        {!value && placeholder && (
          <span className="text-muted-foreground/40">{placeholder}</span>
        )}
      </div>
    );
  };

  return (
    <div className={cn("relative", className)}>
      {/* Highlighted overlay — behind the textarea */}
      {renderHighlight()}

      {/* Actual textarea — transparent text, visible caret */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          "relative z-10 block w-full min-h-[120px] resize-y rounded-lg border border-input",
          "bg-transparent text-transparent caret-foreground",
          "p-2.5 font-mono text-sm leading-relaxed",
          "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "placeholder:text-muted-foreground/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
    </div>
  );
}
