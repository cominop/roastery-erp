// fieldPatterns — smart default suggestion engine for filter controls
// Analyzes field name patterns to suggest sensible defaults and quick-pick
// options so users can apply a reasonable filter with minimal clicks.
import type { FilterColumn } from "./types";

// ─── Types ─────────────────────────────────────────────

export interface FieldSuggestion<T = string> {
  /** Display label for the suggestion chip/button */
  label: string;
  /** The value payload (type-specific) */
  value: T;
  /** Optional secondary description or hint */
  description?: string;
}

export interface NumberRangeValue {
  min: string;
  max: string;
}

export interface DateRangeValue {
  from: string;
  to: string;
}

export interface FieldDefaults {
  /** Text filter: quick-pick value chips */
  textSuggestions?: FieldSuggestion[];
  /** Number filter: pre-fill for min/max inputs */
  numberInitial?: Partial<NumberRangeValue>;
  /** Number filter: quick-pick range chips */
  numberSuggestions?: FieldSuggestion<NumberRangeValue>[];
  /** Date filter: quick-range shortcut chips */
  dateSuggestions?: FieldSuggestion<DateRangeValue>[];
  /** Boolean filter: pre-selected default */
  booleanDefault?: "true" | "false";
}

// ─── Date helpers (YYYY-MM-DD) ────────────────────────

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function today(): string {
  return formatDate(new Date());
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

function thisMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function thisMonthEnd(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0); // last day of current month
  return formatDate(d);
}

function thisQuarterStart(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${pad(q + 1)}-01`;
}

function thisQuarterEnd(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) * 3;
  d.setMonth(q + 3, 0); // last day of quarter's last month
  return formatDate(d);
}

function thisYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function thisYearEnd(): string {
  return `${new Date().getFullYear()}-12-31`;
}

function thisWeekStart(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // Mon=0
  d.setDate(d.getDate() - diff);
  return formatDate(d);
}

function thisWeekEnd(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day; // Sun=0
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

// ─── Date range shortcuts (always available) ──────────

export const DEFAULT_DATE_SUGGESTIONS: FieldSuggestion<DateRangeValue>[] = [
  {
    label: "Today",
    value: { from: today(), to: today() },
  },
  {
    label: "This Week",
    value: { from: thisWeekStart(), to: thisWeekEnd() },
    description: "Mon–Sun",
  },
  {
    label: "This Month",
    value: { from: thisMonthStart(), to: thisMonthEnd() },
  },
  {
    label: "Last 30 Days",
    value: { from: daysAgo(30), to: today() },
  },
  {
    label: "This Quarter",
    value: { from: thisQuarterStart(), to: thisQuarterEnd() },
  },
  {
    label: "This Year",
    value: { from: thisYearStart(), to: thisYearEnd() },
  },
];

// ─── Field name pattern helpers ───────────────────────

function fieldParts(field: string): string[] {
  return field
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .split(/[_\s-]+/)
    .filter(Boolean);
}

function fieldMatches(field: string, ...keywords: string[]): boolean {
  const parts = fieldParts(field);
  return keywords.some((kw) => parts.includes(kw));
}

function fieldStartsWith(field: string, prefix: string): boolean {
  return field.toLowerCase().startsWith(prefix);
}

// ─── Main entry point ─────────────────────────────────

/**
 * Analyze a column's field name and type to determine smart default
 * suggestions and pre-fill values for the filter control.
 */
export function getFieldDefaults(column: FilterColumn): FieldDefaults {
  const field = column.field;
  const type = column.type;

  // ── TEXT patterns ──
  if (type === "text") {
    const suggestions: FieldSuggestion[] = [];

    // Status/state fields — suggest common values
    if (fieldMatches(field, "status", "state")) {
      suggestions.push(
        { label: "Active", value: "Active" },
        { label: "Inactive", value: "Inactive" },
        { label: "Pending", value: "Pending" }
      );
    }

    // Payment/order status — more specific suggestions
    if (fieldMatches(field, "payment", "pay")) {
      suggestions.push(
        { label: "Paid", value: "Paid" },
        { label: "Unpaid", value: "Unpaid" },
        { label: "Pending", value: "Pending" }
      );
    }

    if (fieldMatches(field, "ship", "delivery", "fulfill")) {
      suggestions.push(
        { label: "Shipped", value: "Shipped" },
        { label: "Pending", value: "Pending" },
        { label: "Delivered", value: "Delivered" }
      );
    }

    // Email fields — suggest a pattern search
    if (fieldMatches(field, "email", "mail")) {
      suggestions.push(
        { label: "Has @", value: "%@%" },
        { label: "Gmail", value: "%@gmail.com" },
        { label: "Company", value: "%@%" }
      );
    }

    // Type/category fields
    if (fieldMatches(field, "type", "category", "kind")) {
      // Generic — no specific suggestions (too varied)
    }

    return { textSuggestions: suggestions.length > 0 ? suggestions : undefined };
  }

  // ── NUMBER patterns ──
  if (type === "number") {
    const numberSuggestions: FieldSuggestion<NumberRangeValue>[] = [];

    // Money/price/amount fields — suggest > 0 to exclude zero
    if (fieldMatches(field, "price", "total", "amount", "cost", "balance", "paid", "due", "fee")) {
      numberSuggestions.push(
        { label: "> $0", value: { min: "0.01", max: "" }, description: "Non-zero" },
        { label: "> $100", value: { min: "100", max: "" } },
        { label: "> $1,000", value: { min: "1000", max: "" } }
      );
      return {
        numberInitial: { min: "0.01" },
        numberSuggestions,
      };
    }

    // Quantity/count fields
    if (fieldMatches(field, "qty", "quantity", "count", "num", "number")) {
      numberSuggestions.push(
        { label: "> 0", value: { min: "1", max: "" }, description: "Non-zero" },
        { label: "> 10", value: { min: "10", max: "" } },
        { label: "> 100", value: { min: "100", max: "" } }
      );
      return {
        numberInitial: { min: "1" },
        numberSuggestions,
      };
    }

    // Year fields
    if (fieldMatches(field, "year")) {
      const yr = new Date().getFullYear().toString();
      const prevYr = (new Date().getFullYear() - 1).toString();
      numberSuggestions.push(
        { label: yr, value: { min: yr, max: yr } },
        { label: prevYr, value: { min: prevYr, max: prevYr } },
        { label: `${yr}–${yr + 1}`, value: { min: yr, max: (yr + 1).toString() } }
      );
      return {
        numberInitial: { min: yr, max: yr },
        numberSuggestions,
      };
    }

    // ID fields
    if (field.endsWith("_id") || field.endsWith("Id") || field === "id") {
      numberSuggestions.push(
        { label: "> 0", value: { min: "1", max: "" }, description: "Valid ID" },
        { label: "> 100", value: { min: "100", max: "" } }
      );
      return {
        numberInitial: { min: "1" },
        numberSuggestions,
      };
    }

    // Percentage/rate fields
    if (fieldMatches(field, "pct", "percent", "rate", "tax")) {
      numberSuggestions.push(
        { label: "> 0%", value: { min: "0.01", max: "" } },
        { label: "> 5%", value: { min: "5", max: "" } },
        { label: "0–100%", value: { min: "0", max: "100" } }
      );
      return {
        numberSuggestions,
      };
    }

    // Discount fields
    if (fieldMatches(field, "discount", "markup")) {
      numberSuggestions.push(
        { label: "> 0%", value: { min: "0.01", max: "" } },
        { label: "> 10%", value: { min: "10", max: "" } },
        { label: "> 25%", value: { min: "25", max: "" } }
      );
      return {
        numberSuggestions,
      };
    }

    // Weight fields (coffee roastery!)
    if (fieldMatches(field, "weight", "lbs", "kg", "pounds")) {
      numberSuggestions.push(
        { label: "> 0 lbs", value: { min: "0.1", max: "" }, description: "Non-zero" },
        { label: "> 10 lbs", value: { min: "10", max: "" } },
        { label: "> 50 lbs", value: { min: "50", max: "" } }
      );
      return {
        numberInitial: { min: "0.1" },
        numberSuggestions,
      };
    }

    return { numberSuggestions: numberSuggestions.length > 0 ? numberSuggestions : undefined };
  }

  // ── DATE patterns ──
  if (type === "date") {
    // Date suggestions are always the same — the standard shortcuts
    return { dateSuggestions: DEFAULT_DATE_SUGGESTIONS };
  }

  // ── BOOLEAN patterns ──
  if (type === "boolean") {
    // Most boolean columns represent active/enabled/positive states
    // "is_*" and "has_*" fields typically default to true (yes)
    if (fieldStartsWith(field, "is_") || fieldStartsWith(field, "has_")) {
      return { booleanDefault: "true" };
    }
    // For other booleans, still default to true (most common use case)
    return { booleanDefault: "true" };
  }

  // ── LOOKUP patterns ──
  if (type === "lookup") {
    // Lookup fields load data from the API — no static defaults apply
    // But we can suggest based on field name
    if (fieldMatches(field, "status", "state")) {
      // These are handled dynamically by the API, no static defaults
    }
    return {};
  }

  return {};
}
