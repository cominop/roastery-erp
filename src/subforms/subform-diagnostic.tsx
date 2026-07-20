// SubformDiagnostic — development-only diagnostic overlay for subform controls
// (spec §21 — Development Diagnostics)
//
// Shows the resolved subform metadata, parent value, and record count.
// Disabled in normal operational use — toggled via SubformControl's devMode prop.

import type { SubformControlDefinition, DisplayMode } from "./subform-types";

// ─── Props ────────────────────────────────────────────

export interface SubformDiagnosticProps {
  definition: SubformControlDefinition;
  displayMode: DisplayMode | string;
  parentValue?: unknown;
  recordsLoaded?: number;
  loadState?: string;
  filter?: string;
}

// ─── SubformDiagnostic ────────────────────────────────

export default function SubformDiagnostic({
  definition,
  displayMode,
  parentValue,
  recordsLoaded,
  loadState,
  filter,
}: SubformDiagnosticProps) {
  return (
    <div className="absolute bottom-1 right-1 z-50 max-w-xs rounded border border-yellow-400/50 bg-yellow-50/95 p-2 text-[9px] font-mono leading-tight shadow-md">
      <div className="mb-1 font-semibold text-yellow-700 text-[10px]">
        \u25A0 Subform Diagnostic
      </div>
      <table className="w-full">
        <tbody>
          <tr>
            <td className="pr-2 text-yellow-600">Control</td>
            <td className="text-yellow-900 break-all">{definition.name}</td>
          </tr>
          <tr>
            <td className="pr-2 text-yellow-600">Source</td>
            <td className="text-yellow-900 break-all">{definition.sourceObject}</td>
          </tr>
          <tr>
            <td className="pr-2 text-yellow-600">Mode</td>
            <td className="text-yellow-900">{displayMode}</td>
          </tr>
          {definition.linkMasterFields && definition.linkMasterFields.length > 0 && (
            <tr>
              <td className="pr-2 text-yellow-600">Master</td>
              <td className="text-yellow-900">{definition.linkMasterFields.join(", ")}</td>
            </tr>
          )}
          {definition.linkChildFields && definition.linkChildFields.length > 0 && (
            <tr>
              <td className="pr-2 text-yellow-600">Child</td>
              <td className="text-yellow-900">{definition.linkChildFields.join(", ")}</td>
            </tr>
          )}
          {definition.tabPage && (
            <tr>
              <td className="pr-2 text-yellow-600">Tab</td>
              <td className="text-yellow-900">{definition.tabPage}</td>
            </tr>
          )}
          {parentValue !== undefined && (
            <tr>
              <td className="pr-2 text-yellow-600">Parent Val</td>
              <td className="text-yellow-900">{String(parentValue)}</td>
            </tr>
          )}
          {recordsLoaded !== undefined && (
            <tr>
              <td className="pr-2 text-yellow-600">Records</td>
              <td className="text-yellow-900">{recordsLoaded}</td>
            </tr>
          )}
          <tr>
            <td className="pr-2 text-yellow-600">State</td>
            <td className="text-yellow-900">{loadState || "—"}</td>
          </tr>
          {filter && filter !== "__EMPTY_PARENT_KEY__" && filter !== "__UNLINKED__" && (
            <tr>
              <td className="pr-2 text-yellow-600">Filter</td>
              <td className="text-yellow-900 break-all text-[8px]">{filter}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}