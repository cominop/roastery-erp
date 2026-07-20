// Subform type definitions — mirrors Access subform control properties
// Each subform control carries its own metadata (sourceObject, link fields, tab page)
// The bound child form determines its own display mode

export type DisplayMode = "grid" | "fields" | "hybrid";

export interface SubformControlDefinition {
  /** Control name as stored in the parent form definition */
  name: string;
  /** The bound child form to load (e.g. "Orders by Customer - SUB") */
  sourceObject: string;
  /** Parent fields used to filter the child (e.g. ["CustomerID"]) */
  linkMasterFields?: string[];
  /** Child fields receiving the parent filter values (e.g. ["CustomerID"]) */
  linkChildFields?: string[];
  /** Tab page containing this subform (when inside a tab control) */
  tabPage?: string;
}

export interface SubformDisplayOverride {
  /** The bound child form's display mode */
  displayMode: DisplayMode;
  /** Optional record source for the child query */
  recordSource?: string;
}

export interface SubformControlProps {
  definition: SubformControlDefinition;
  parentRecord?: Record<string, unknown>;
  /** When true, shows a diagnostic overlay on the subform (spec §21) */
  devMode?: boolean;
}