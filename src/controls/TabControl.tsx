// TabControl — Access tab control → simple button-based tab UI
// Ported from accessclone/ui-react/src/views/FormEditor/controls/TabControl.tsx
//
// Two fixes applied for FCC data:
//   1. Handle camelCase `parentPage` as well as kebab-case `parent-page`
//   2. Render ONLY the active page's controls in the DOM (no hidden content left mounted)
//      This eliminates the "ghosting" effect where all page contents stack on top of each other.

import { useState } from "react";
import { parseHotkeyText } from "@/lib/utils";
import { controlStyle } from "@/lib/utils";
import type { Control } from "@/types";

interface Props {
  ctrl: Control;
  allControls: Control[];
  currentRecord: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  allowEdits: boolean;
  renderControl: (
    ctrl: Control,
    record: Record<string, unknown>,
    onChange: (f: string, v: unknown) => void,
    opts: Record<string, unknown>
  ) => React.ReactNode;
  onActiveTabChange?: (tabName: string) => void;
}

/** Resolve parent-page from a control, accepting both camelCase and kebab-case */
function getParentPage(ctrl: Record<string, unknown>): string | undefined {
  return (ctrl["parentPage"] as string) || (ctrl["parent-page"] as string) || undefined;
}

export default function TabControl({
  ctrl,
  allControls,
  currentRecord,
  onChange,
  allowEdits,
  renderControl,
  onActiveTabChange,
}: Props) {
  // Resolve page names: either from ctrl.pages array (if populated), or
  // by scanning allControls for type==='page' controls and preserving their order in the array
  const explicitPages: string[] =
    ((ctrl as Record<string, unknown>).pages as string[]) ?? [];

  const pageControls = allControls.filter((c) => c.type === "page");
  const pageNames: string[] =
    explicitPages.length > 0
      ? explicitPages
      : pageControls.map((p) => p.name);

  const [activeTabIdx, setActiveTabIdx] = useState(0);

  if (pageNames.length === 0) {
    return (
      <div
        className="p-2 text-xs text-muted-foreground border border-dashed"
        style={controlStyle(ctrl)}
      >
        (Empty tab control)
      </div>
    );
  }

  const activePageName = pageNames[activeTabIdx];

  // Find controls belonging to the currently active tab
  const activeChildControls = allControls.filter((c) => {
    const pp = getParentPage(c as Record<string, unknown>);
    return pp === activePageName;
  });

  const handleTabChange = (idx: number) => {
    setActiveTabIdx(idx);
    onActiveTabChange?.(pageNames[idx]);
  };

  return (
    <div
      className="flex flex-col"
      style={controlStyle(ctrl)}
    >
      {/* Tab header strip */}
      <div className="flex border-b border-border bg-muted/20">
        {pageNames.map((pname, idx) => {
          const page = allControls.find(
            (c) => c.type === "page" && c.name === pname
          );
          const raw = page?.caption ?? pname;
          const isActive = idx === activeTabIdx;
          return (
            <button
              key={pname}
              type="button"
              onClick={() => handleTabChange(idx)}
              className={`
                px-3 py-1.5 text-xs border-r border-border transition-colors
                ${
                  isActive
                    ? "bg-background font-medium text-foreground border-b-2 border-b-primary -mb-px"
                    : "bg-transparent text-muted-foreground hover:bg-muted/40"
                }
              `}
            >
              {parseHotkeyText(raw).map((seg, i) =>
                typeof seg === "string" ? (
                  <span key={i}>{seg}</span>
                ) : (
                  <u key={i}>{seg.char}</u>
                )
              )}
            </button>
          );
        })}
      </div>

      {/* Active page body — only this page's controls render */}
      <div className="relative flex-1">
        {activeChildControls.map((c) => (
          <div key={c.name}>
            {renderControl(c, currentRecord, onChange, {
              allowEdits,
              allControls,
            })}
          </div>
        ))}
      </div>
    </div>
  );
}