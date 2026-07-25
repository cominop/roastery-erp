/**
 * Calculated field definition — maps to shared.calculated_fields table.
 *
 * Each row defines a computation evaluated at runtime by the expression
 * parser/evaluator against a db_fcc_erp record context.
 */
export interface CalculatedField {
  /** UUID primary key */
  id: string;
  /** snake_case identifier */
  name: string;
  /** display label */
  caption: string;
  /** belongs to this db_fcc_erp table */
  tableName: string;

  /* ── Calculation ──────────────────────────────────── */
  calcType: 'scalar' | 'aggregate' | 'lookup' | 'formula' | 'stored';
  expression: string;
  dataType: 'text' | 'number' | 'currency' | 'boolean' | 'date';

  /* ── Dependencies ─────────────────────────────────── */
  dependsOn: string[];
  dependsOnTables: string[];

  /* ── Behaviour ────────────────────────────────────── */
  readOnly: boolean;
  refreshOn: 'read' | 'save' | 'manual';
  nullWhenEmpty: boolean;

  /* ── Display formatting ───────────────────────────── */
  format?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;

  /* ── UX flags ─────────────────────────────────────── */
  visible: boolean;
  sortable: boolean;
  filterable: boolean;

  /* ── Audit ────────────────────────────────────────── */
  createdAt: string;
  updatedAt: string;
}
