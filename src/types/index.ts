// Access form control types — ported from accessclone/ui-react/src/api/types.ts

export type ControlType =
  | 'text-box'
  | 'label'
  | 'command-button'
  | 'combo-box'
  | 'check-box'
  | 'option-button'
  | 'toggle-button'
  | 'tab-control'
  | 'tab'
  | 'subform'
  | 'image'
  | 'line'
  | 'rectangle'
  | 'list-box'
  | 'option-group'
  | 'page'
  | 'attachment';

export interface Control {
  name: string;
  type: ControlType;
  left: number;
  top: number;
  width: number;
  height: number;
  caption?: string;
  text?: string;
  'control-source'?: string;
  'row-source'?: string;
  'bound-column'?: number;
  'column-widths'?: string;
  'input-mask'?: string;
  format?: string;
  'text-format'?: number;
  'back-color'?: number;
  'fore-color'?: number;
  'border-color'?: number;
  'back-style'?: number;
  'font-name'?: string;
  'font-size'?: number;
  'font-bold'?: boolean;
  'font-italic'?: boolean;
  'text-align'?: number;
  visible?: boolean | number;
  locked?: boolean | number;
  enabled?: boolean | number;
  'tab-index'?: number;
  'has-click-event'?: boolean;
  'has-after-update-event'?: boolean;
  'has-change-event'?: boolean;
  'has-dbl-click-event'?: boolean;
  section?: number;
  picture?: string;
  'size-mode'?: string;
  'picture-alignment'?: string;
  pages?: string[];
  'parent-page'?: string;
  parentPage?: string;
  'default-value'?: string;
  'validation-rule'?: string;
  'validation-text'?: string;
  [key: string]: unknown;
}

export interface FormSection {
  visible?: number | boolean;
  height?: number;
  controls: Control[];
}

export interface FormDefinition {
  name: string;
  modal?: boolean;
  popup?: boolean;
  'record-source'?: string;
  'allow-edits'?: number;
  'allow-additions'?: number;
  'allow-deletions'?: number;
  'navigation-buttons'?: number;
  filter?: string;
  header: FormSection;
  detail: FormSection;
  footer: FormSection;
  events?: Record<string, string>;
}

export interface ExprContext {
  record?: Record<string, unknown>;
  groupRecords?: Record<string, unknown>[];
  allRecords?: Record<string, unknown>[];
  page?: number;
  pages?: number;
}

export interface HotkeySegment {
  hotkey?: true;
  char?: string;
}