// Field type definitions for the data-aware FormField control system.
// These are distinct from the Access legacy control types in src/types/index.ts.

export type FieldType =
  | 'TEXT'
  | 'INTEGER'
  | 'FLOAT'
  | 'CURRENCY'
  | 'DATE'
  | 'DATETIME'
  | 'BOOLEAN'
  | 'LONGTEXT'
  | 'FILE'
  | 'IMAGE'
  | 'LOOKUP'
  | 'CALCULATED';

export interface FieldDefinition {
  id: string;
  name: string;
  caption: string;
  type: FieldType;
  lookupItem?: string;
  lookupField?: string;
  lookupField2?: string;
  lookupField3?: string;
  masterField?: string;
  mask?: string;
  placeholder?: string;
  size?: number;
  min?: number;
  max?: number;
  decimals?: number;
  currency?: string;
  format?: string;
  rows?: number;
  maxRows?: number;
  accept?: string;
  maxSize?: number;
  calcType?: string;
  calcExpression?: string;
  defaultValue?: string;
  required?: boolean;
  readOnly?: boolean;
  help?: string;
  alignment?: 'left' | 'center' | 'right';
  tabIndex?: number;
}

export interface FormFieldProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
  error?: string;
  tabIndex?: number;
}
