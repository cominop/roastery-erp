// Filter column types — describes columns that can be filtered
// Each column has a field name, display label, and data type that determines
// which type-specific filter control to render.

export type FilterLogic = "AND" | "OR";

export type FilterColumnType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "lookup";

export interface FilterColumn {
  /** The database field name (e.g. "customer_name", "order_total") */
  field: string;
  /** Human-readable label displayed in the column picker */
  label: string;
  /** The data type — determines which filter control to render */
  type: FilterColumnType;
  /** For lookup columns: the API endpoint or table to fetch values from */
  lookupSource?: string;
}

/** Callback signature shared by all type-specific filter controls */
export interface FilterControlProps {
  column: FilterColumn;
  onApply: (name: string, expression: string) => void;
  onCancel: () => void;
}