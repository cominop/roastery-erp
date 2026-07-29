// Visual Editor — Data model & types
// Step 70: Foundation types for the drag-and-drop form builder
// These types describe forms designed in the visual editor, separate from
// the legacy Access form definitions imported from shared.objects.

// ─── Control types ─────────────────────────────────

export type VisualEditorControlType =
  | 'text-box'
  | 'label'
  | 'command-button'
  | 'combo-box'
  | 'check-box'
  | 'option-button'
  | 'toggle-button'
  | 'tab-control'
  | 'page'
  | 'subform'
  | 'image'
  | 'line'
  | 'rectangle'
  | 'list-box'
  | 'option-group'
  | 'attachment';

// ─── Position & size ──────────────────────────────

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// ─── Text alignment ───────────────────────────────

export type TextAlignment = 'left' | 'center' | 'right' | 'general';

// ─── Border style ─────────────────────────────────

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'none';

// ─── Visual style properties shared by all controls ─

export interface VisualStyle {
  backColor?: string;
  foreColor?: string;
  borderColor?: string;
  borderStyle?: BorderStyle;
  borderWidth?: number;
  fontName?: string;
  fontSize?: number;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontUnderline?: boolean;
  textAlign?: TextAlignment;
  /** CSS overrides injected into the control's style attribute */
  cssOverrides?: Record<string, string>;
}

// ─── Data binding properties ──────────────────────

export interface DataBinding {
  /** The database field (or expression) that provides the control's value */
  controlSource?: string;
  /** SQL query or table name that populates a list/combo-box */
  rowSource?: string;
  /** For multi-column row sources: which column index holds the bound value (0-based) */
  boundColumn?: number;
  /** Column width spec, e.g. "2.5cm;5cm;2.5cm" */
  columnWidths?: string;
  /** Default value expression */
  defaultValue?: string;
}

// ─── Validation ───────────────────────────────────

export interface Validation {
  rule?: string;
  text?: string;
}

// ─── Event bindings ───────────────────────────────

export interface EventBindings {
  onClick?: string;
  onDblClick?: string;
  onMouseDown?: string;
  onMouseUp?: string;
  onMouseMove?: string;
  onBeforeUpdate?: string;
  onAfterUpdate?: string;
  onChange?: string;
  onEnter?: string;
  onExit?: string;
  onGotFocus?: string;
  onLostFocus?: string;
  onKeyDown?: string;
  onKeyUp?: string;
  onKeyPress?: string;
}

// ─── Visual Editor Control — full definition ──────

export interface VisualEditorControl {
  /** Unique identifier for this control instance (UUID for editor drag/drop keys) */
  id: string;
  /** Control type — determines which renderer component to use */
  type: VisualEditorControlType;
  /** Display name (used in the editor tree and property grid) */
  name: string;
  /** Caption or label text displayed on the control */
  caption?: string;
  /** Position on the design canvas (twips / Access-style units) */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Z-order — higher values render on top */
  zIndex?: number;
  /** Style properties */
  style?: VisualStyle;
  /** Data binding */
  dataBinding?: DataBinding;
  /** Validation rules */
  validation?: Validation;
  /** Event handler bindings */
  events?: EventBindings;
  /** Editor-specific flags */
  locked?: boolean;
  visible?: boolean;
  enabled?: boolean;
  /** Tab index for keyboard navigation */
  tabIndex?: number;
  /** For tab controls: the child pages */
  pages?: string[];
  /** For page controls: which tab page they belong to */
  parentPage?: string;
  /** For subform controls: the source form name */
  sourceObject?: string;
  /** For subform controls: link master/child fields */
  linkMasterFields?: string[];
  linkChildFields?: string[];
  /** For image controls */
  picture?: string;
  sizeMode?: 'clip' | 'stretch' | 'zoom';
  /** For button controls: whether to show a picture */
  pictureCaptionArrangement?: 'general' | 'top' | 'bottom' | 'left' | 'right';
  /** Input mask pattern */
  inputMask?: string;
  /** Format string */
  format?: string;
  /** Rich text flag (0 = plain, 1 = rich) */
  textFormat?: 0 | 1;
  /** Group for option-group controls */
  optionValue?: number;
  /** Row source type (table, value list, field list) */
  rowSourceType?: string;
  /** Number of decimal places (for numeric controls) */
  decimalPlaces?: number;
  /** Whether the control is a calculated expression */
  isCalculated?: boolean;
  /** Calculated expression */
  expression?: string;
  /** Scrollbar style */
  scrollBars?: 'none' | 'vertical' | 'horizontal' | 'both';
  /** Can the control receive focus? */
  autoTab?: boolean;
  /** Enter key behavior: true = move to next field */
  enterKeyBehavior?: boolean;
  /** Allow multiple values (for list boxes) */
  multiSelect?: boolean;
  /** Extra properties store (for forward-compatibility with new control types) */
  extra?: Record<string, unknown>;
}

// ─── Form section ─────────────────────────────────

export interface VisualEditorSection {
  /** Whether the section is visible at runtime */
  visible?: boolean;
  /** Section height (Access twips) */
  height?: number;
  /** Section background color */
  backColor?: string;
  /** Whether to display the section header in the editor */
  headerVisible?: boolean;
  /** Controls in this section */
  controls: VisualEditorControl[];
  /** Special properties per section type */
  /** For detail sections: the record source for the datasheet view */
  recordSource?: string;
  /** For detail sections: allow adding new records */
  allowAdditions?: boolean;
  /** For detail sections: allow deleting records */
  allowDeletions?: boolean;
}

// ─── Grid / canvas settings ───────────────────────

export interface EditorGridSettings {
  /** Grid spacing in twips */
  gridSize: number;
  /** Snap controls to grid when dragging/resizing */
  snapToGrid: boolean;
  /** Show grid dots/lines on the canvas */
  showGrid: boolean;
  /** Grid dot/line color */
  gridColor?: string;
}

// ─── Visual Editor Form — full definition ─────────

export interface VisualEditorForm {
  /** Unique form name (used for navigation routing) */
  name: string;
  /** Human-readable caption */
  caption?: string;
  /** The table or SQL query that provides the form's data */
  recordSource?: string;
  /** Whether the form allows editing */
  allowEdits?: boolean;
  /** Whether the form allows adding new records */
  allowAdditions?: boolean;
  /** Whether the form allows deleting records */
  allowDeletions?: boolean;
  /** Whether to show navigation buttons */
  navigationButtons?: boolean;
  /** Whether the form is modal */
  modal?: boolean;
  /** Whether the form is a popup */
  popup?: boolean;
  /** Default filter applied to the record source */
  filter?: string;
  /** Order by clause */
  orderBy?: string;
  /** Form sections */
  header: VisualEditorSection;
  detail: VisualEditorSection;
  footer: VisualEditorSection;
  /** Canvas/editor settings */
  editorSettings?: EditorGridSettings;
  /** Event handlers for the form itself */
  events?: EventBindings;
  /** Form-level VBA or script code */
  module?: string;
  /** Version number for optimistic concurrency */
  version: number;
  /** Timestamps (set by server) */
  createdAt?: string;
  updatedAt?: string;
  /** Who created/updated the form */
  createdBy?: string;
  updatedBy?: string;
}

// ─── Toolbox palette ──────────────────────────────

export interface ToolboxItem {
  /** Unique type identifier matching VisualEditorControlType */
  type: VisualEditorControlType;
  /** Display label in the toolbox */
  label: string;
  /** Icon name (lucide-react icon name) */
  icon: string;
  /** Category grouping */
  category: ToolboxCategory;
  /** Default size when dropped onto the canvas */
  defaultSize: Size;
  /** Description shown in tooltip */
  description?: string;
}

export type ToolboxCategory =
  | 'input'
  | 'display'
  | 'action'
  | 'container'
  | 'decoration'
  | 'data';

// ─── Default toolbox items ────────────────────────

export const TOOLBOX_ITEMS: ToolboxItem[] = [
  // Input
  { type: 'text-box',     label: 'Text Box',     icon: 'Square',       category: 'input',      defaultSize: { width: 1440, height: 270 } },
  { type: 'combo-box',    label: 'Combo Box',    icon: 'ChevronDown',  category: 'input',      defaultSize: { width: 1440, height: 270 } },
  { type: 'list-box',     label: 'List Box',     icon: 'List',         category: 'input',      defaultSize: { width: 1440, height: 720 } },
  { type: 'check-box',    label: 'Check Box',    icon: 'CheckSquare',  category: 'input',      defaultSize: { width: 1440, height: 270 } },
  { type: 'option-button', label: 'Option Button', icon: 'Circle',     category: 'input',      defaultSize: { width: 1440, height: 270 } },
  { type: 'toggle-button', label: 'Toggle Button', icon: 'ToggleLeft', category: 'input',      defaultSize: { width: 720,  height: 270 } },
  { type: 'option-group', label: 'Option Group', icon: 'Radio',        category: 'input',      defaultSize: { width: 1440, height: 540 } },
  { type: 'attachment',   label: 'Attachment',   icon: 'Paperclip',    category: 'input',      defaultSize: { width: 1440, height: 270 } },

  // Display
  { type: 'label',        label: 'Label',        icon: 'Type',         category: 'display',    defaultSize: { width: 720,  height: 270 } },
  { type: 'image',        label: 'Image',        icon: 'Image',        category: 'display',    defaultSize: { width: 1440, height: 1440 } },

  // Action
  { type: 'command-button', label: 'Button',     icon: 'MousePointerClick', category: 'action', defaultSize: { width: 1440, height: 360 } },

  // Container
  { type: 'tab-control',  label: 'Tab Control',  icon: 'Columns2',     category: 'container',  defaultSize: { width: 4320, height: 2160 } },
  { type: 'subform',      label: 'Subform',      icon: 'Table',        category: 'container',  defaultSize: { width: 4320, height: 1440 } },

  // Decoration
  { type: 'line',         label: 'Line',         icon: 'Minus',        category: 'decoration', defaultSize: { width: 1440, height: 30 } },
  { type: 'rectangle',    label: 'Rectangle',    icon: 'Crop',         category: 'decoration', defaultSize: { width: 1440, height: 720 } },
];

// ─── API response types ───────────────────────────

export interface VisualFormListItem {
  name: string;
  caption: string | null;
  recordSource: string | null;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface VisualFormCreateRequest {
  name: string;
  caption?: string;
  recordSource?: string;
}

export interface VisualFormUpdateRequest {
  /** Full form definition (replaces entire sections JSONB) */
  definition: Omit<VisualEditorForm, 'name' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;
  /** Expected version for optimistic concurrency */
  version: number;
}

// ─── Clipboard / drag-and-drop ────────────────────

export interface VisualEditorClipboard {
  /** The copied control(s) */
  controls: VisualEditorControl[];
  /** Source section name (for paste behavior) */
  sourceSection?: 'header' | 'detail' | 'footer';
  /** Offset to apply on paste so the pasted controls don't overlap the originals */
  pasteOffset?: Position;
}

// ─── Events for editor state management ───────────

export type EditorMode = 'select' | 'pan' | 'insert';

export interface EditorSelectionState {
  /** Currently selected control IDs (ordered by selection) */
  selectedIds: string[];
  /** The section being edited */
  activeSection: 'header' | 'detail' | 'footer';
  /** The current editor mode */
  mode: EditorMode;
  /** The control type being inserted (when mode === 'insert') */
  insertType?: VisualEditorControlType;
  /** Whether the property grid is open */
  propertyGridOpen: boolean;
  /** Whether the toolbox is open */
  toolboxOpen: boolean;
  /** Zoom level (0.25 – 4.0) */
  zoom: number;
}