/**
 * FunctionReference — categorized list of available expression functions
 * with syntax/signature and descriptions. Click to insert into expression.
 */

import { useState, useCallback } from "react";
import { FunctionSquare, Search, ChevronDown, ChevronRight } from "lucide-react";

// ─── Function catalog ─────────────────────────────────-

interface FunctionInfo {
  name: string;
  signature: string;
  description: string;
  example: string;
}

interface FunctionCategory {
  label: string;
  functions: FunctionInfo[];
}

const FUNCTION_CATALOG: FunctionCategory[] = [
  {
    label: "Logic & Conditional",
    functions: [
      {
        name: "IIF",
        signature: "IIF(condition, trueValue, falseValue?)",
        description: "Immediate IF — returns trueValue when condition is truthy, otherwise falseValue (or null if omitted).",
        example: "IIF(quantity > 0, total / quantity, 0)",
      },
      {
        name: "IF",
        signature: "IF(condition, trueValue, falseValue?)",
        description: "Alias for IIF.",
        example: "IF(status = 'Shipped', 'Delivered', 'Pending')",
      },
      {
        name: "NZ",
        signature: "NZ(value, replaceWith?)",
        description: "Null-to-Zero — returns replaceWith (default 0) when value is null or empty.",
        example: "NZ(discount, 0) * total",
      },
      {
        name: "ISNULL",
        signature: "ISNULL(value)",
        description: "Returns -1 (true) if value is null or empty, 0 (false) otherwise.",
        example: "ISNULL(notes)",
      },
      {
        name: "SWITCH",
        signature: "SWITCH(expr1, val1, expr2, val2, ..., default?)",
        description: "Evaluates pairs of expressions and values, returns the first value whose expression is truthy.",
        example: "SWITCH(status='New', 1, status='Shipped', 2, 3)",
      },
      {
        name: "CHOOSE",
        signature: "CHOOSE(index, value1, value2, ...)",
        description: "Returns the value at the given 1-based index from the list.",
        example: "CHOOSE(priority, 'Low', 'Medium', 'High')",
      },
    ],
  },
  {
    label: "String",
    functions: [
      {
        name: "LEFT",
        signature: "LEFT(text, count)",
        description: "Returns the first count characters from text.",
        example: "LEFT(customer_name, 10)",
      },
      {
        name: "RIGHT",
        signature: "RIGHT(text, count)",
        description: "Returns the last count characters from text.",
        example: "RIGHT(phone_number, 4)",
      },
      {
        name: "MID",
        signature: "MID(text, start, count)",
        description: "Returns count characters from text starting at position start (1-based).",
        example: "MID(postal_code, 3, 2)",
      },
      {
        name: "LEN",
        signature: "LEN(text)",
        description: "Returns the length (number of characters) of text.",
        example: "LEN(notes)",
      },
      {
        name: "TRIM",
        signature: "TRIM(text)",
        description: "Removes leading and trailing whitespace from text.",
        example: "TRIM(address)",
      },
      {
        name: "UCASE",
        signature: "UCASE(text)",
        description: "Converts text to uppercase.",
        example: "UCASE(customer_name)",
      },
      {
        name: "LCASE",
        signature: "LCASE(text)",
        description: "Converts text to lowercase.",
        example: "LCASE(email)",
      },
      {
        name: "INSTR",
        signature: "INSTR(text, substring, start?)",
        description: "Returns the 1-based position of substring in text, or 0 if not found.",
        example: "INSTR(full_name, ' ')",
      },
      {
        name: "REPLACE",
        signature: "REPLACE(text, old, new)",
        description: "Replaces all occurrences of old with new in text.",
        example: "REPLACE(phone, '-', '.')",
      },
    ],
  },
  {
    label: "Math & Numeric",
    functions: [
      {
        name: "INT",
        signature: "INT(number)",
        description: "Returns the integer portion of number (rounds down).",
        example: "INT(amount)",
      },
      {
        name: "ABS",
        signature: "ABS(number)",
        description: "Returns the absolute (non-negative) value of number.",
        example: "ABS(difference)",
      },
      {
        name: "VAL",
        signature: "VAL(string)",
        description: "Converts a string to a number, stopping at the first non-numeric character.",
        example: "VAL(quantity_str)",
      },
      {
        name: "ROUND",
        signature: "ROUND(number, decimals?)",
        description: "Rounds number to the given decimal places (default 0).",
        example: "ROUND(total * tax_rate, 2)",
      },
      {
        name: "SQR",
        signature: "SQR(number)",
        description: "Returns the square root of number.",
        example: "SQR(area)",
      },
      {
        name: "SGN",
        signature: "SGN(number)",
        description: "Returns -1 if negative, 0 if zero, 1 if positive.",
        example: "SGN(balance_change)",
      },
    ],
  },
  {
    label: "Date & Time",
    functions: [
      {
        name: "NOW",
        signature: "NOW()",
        description: "Returns the current date and time.",
        example: "NOW()",
      },
      {
        name: "DATE",
        signature: "DATE()",
        description: "Returns the current date (time set to midnight).",
        example: "DATE()",
      },
      {
        name: "DATEADD",
        signature: "DATEADD(interval, number, date)",
        description: "Adds number of intervals to date. Intervals: 'd'/'day', 'm'/'month', 'y'/'year'/'yyyy'.",
        example: "DATEADD('d', 30, order_date)",
      },
      {
        name: "DATEDIFF",
        signature: "DATEDIFF(interval, date1, date2)",
        description: "Returns the number of intervals between date1 and date2.",
        example: "DATEDIFF('d', order_date, ship_date)",
      },
      {
        name: "YEAR",
        signature: "YEAR(date)",
        description: "Returns the year portion of a date (e.g., 2026).",
        example: "YEAR(order_date)",
      },
      {
        name: "MONTH",
        signature: "MONTH(date)",
        description: "Returns the month number (1–12) of a date.",
        example: "MONTH(order_date)",
      },
      {
        name: "DAY",
        signature: "DAY(date)",
        description: "Returns the day of the month (1–31).",
        example: "DAY(ship_date)",
      },
      {
        name: "WEEKDAY",
        signature: "WEEKDAY(date)",
        description: "Returns the day of the week (1=Sunday, 7=Saturday).",
        example: "WEEKDAY(order_date)",
      },
    ],
  },
  {
    label: "Aggregate",
    functions: [
      {
        name: "SUM",
        signature: "SUM(field)",
        description: "Returns the sum of field values across all grouped records.",
        example: "SUM(amount)",
      },
      {
        name: "COUNT",
        signature: "COUNT(field)",
        description: "Returns the count of non-null field values across all grouped records.",
        example: "COUNT(*)",
      },
      {
        name: "AVG",
        signature: "AVG(field)",
        description: "Returns the average (mean) of field values.",
        example: "AVG(amount)",
      },
      {
        name: "MIN",
        signature: "MIN(field)",
        description: "Returns the minimum field value across all grouped records.",
        example: "MIN(order_date)",
      },
      {
        name: "MAX",
        signature: "MAX(field)",
        description: "Returns the maximum field value across all grouped records.",
        example: "MAX(order_date)",
      },
    ],
  },
  {
    label: "Conversion & Format",
    functions: [
      {
        name: "CSTR",
        signature: "CSTR(value)",
        description: "Converts value to a string.",
        example: "CSTR(order_id)",
      },
      {
        name: "CINT",
        signature: "CINT(value)",
        description: "Converts value to an integer (rounds).",
        example: "CINT(amount)",
      },
      {
        name: "CDBL",
        signature: "CDBL(value)",
        description: "Converts value to a double-precision float.",
        example: "CDBL(total)",
      },
      {
        name: "CDATE",
        signature: "CDATE(value)",
        description: "Converts value to a date.",
        example: "CDATE(date_string)",
      },
      {
        name: "FORMAT",
        signature: "FORMAT(value, formatString)",
        description: "Formats a value using the specified format pattern.",
        example: "FORMAT(order_date, 'yyyy-mm-dd')",
      },
    ],
  },
];

// ─── Component ─────────────────────────────────────────

interface FunctionReferenceProps {
  onInsert: (text: string) => void;
}

export default function FunctionReference({ onInsert }: FunctionReferenceProps) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    // Expand all by default
    for (const cat of FUNCTION_CATALOG) {
      init[cat.label] = true;
    }
    return init;
  });

  const toggleCategory = useCallback((label: string) => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  const filtered = search
    ? FUNCTION_CATALOG.map((cat) => ({
        ...cat,
        functions: cat.functions.filter(
          (fn) =>
            fn.name.toLowerCase().includes(search.toLowerCase()) ||
            fn.description.toLowerCase().includes(search.toLowerCase()),
        ),
      })).filter((cat) => cat.functions.length > 0)
    : FUNCTION_CATALOG;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground mb-1.5">
          <FunctionSquare className="h-3.5 w-3.5 text-muted-foreground" />
          Functions
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search functions..."
            className="w-full h-7 pl-6 pr-2 text-xs border rounded bg-background outline-none focus-visible:border-ring"
          />
        </div>
      </div>

      {/* Function list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No functions match your filter
          </div>
        )}

        {filtered.map((cat) => (
          <div key={cat.label}>
            {/* Category header */}
            <button
              onClick={() => toggleCategory(cat.label)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors bg-muted/20 sticky top-0"
            >
              {expanded[cat.label] ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {cat.label}
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
                {cat.functions.length}
              </span>
            </button>

            {/* Functions */}
            {expanded[cat.label] &&
              cat.functions.map((fn) => (
                <button
                  key={fn.name}
                  onClick={() => onInsert(fn.name + "(")}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted/50 transition-colors group"
                  title={fn.description}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold font-mono text-blue-600 dark:text-blue-400">
                      {fn.name}
                    </span>
                    <span className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground ml-auto transition-opacity">
                      Click to insert
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {fn.signature}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2">
                    {fn.description}
                  </div>
                  <div className="text-[10px] text-muted-foreground/50 mt-0.5 italic">
                    Example: {fn.example}
                  </div>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
