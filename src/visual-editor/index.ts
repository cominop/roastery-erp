// Visual Editor — barrel exports
export type {
  VisualEditorControlType,
  FormBorderStyle,
  Position,
  Size,
  TextAlignment,
  BorderStyle,
  VisualStyle,
  DataBinding,
  Validation,
  EventBindings,
  VisualEditorControl,
  VisualEditorSection,
  EditorGridSettings,
  VisualEditorForm,
  ToolboxItem,
  ToolboxCategory,
  VisualFormListItem,
  VisualFormCreateRequest,
  VisualFormUpdateRequest,
  VisualEditorClipboard,
  EditorMode,
  EditorSelectionState,
} from './types';

export {
  TOOLBOX_ITEMS,
} from './types';

export {
  default as FieldPicker,
} from './FieldPicker';

export type {
  FieldPickerItem,
  FieldPickerProps,
} from './FieldPicker';

export {
  default as ColumnLayoutConfig,
} from './ColumnLayoutConfig';

export type {
  ColumnLayoutConfigProps,
  LayoutPanel,
} from './ColumnLayoutConfig';

export {
  default as TabsBandEditor,
} from './TabsBandEditor';

export type {
  TabsBandEditorProps,
} from './TabsBandEditor';

export {
  default as FormPropertiesPanel,
} from './FormPropertiesPanel';

export type {
  FormProperties,
  FormPropertiesPanelProps,
} from './FormPropertiesPanel';

export {
  default as TableFieldPicker,
} from './TableFieldPicker';

export type {
  TableColumnConfig,
  TableFieldPickerProps,
} from './TableFieldPicker';

export {
  default as TableOptionsPanel,
} from './TableOptionsPanel';

export type {
  TableRowHeight,
  TableOptions,
  TableOptionsPanelProps,
} from './TableOptionsPanel';

// ─── Step 77: Template Library ─────────────────────────

export {
  default as TemplateLibrary,
} from './TemplateLibrary';

export type {
  TemplateLibraryProps,
  FieldDefinition,
} from './TemplateLibrary';

export {
  getTemplates,
  getTemplate,
  registerTemplate,
  unregisterTemplate,
  saveUserTemplates,
  loadUserTemplates,
  applyTemplateToForm,
} from './templateRegistry';

export type {
  FormTemplate,
  FormTemplateTab,
  FormTemplateBand,
} from './templateRegistry';
