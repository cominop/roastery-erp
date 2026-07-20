#!/usr/bin/env python3
"""Step 3 — Extract VBA event handlers for 5 priority forms.

Parses VBA source from shared.objects and extracts every event handler
(Click, DblClick, AfterUpdate, BeforeUpdate, Change, Load, Open, etc.)
organized by API form name using the VBA_FORM_MAP.

Output: src/events/__tests__/vba-event-extract.json
"""

import json
import re
import subprocess
import sys
import os

# ─── The mapping (same as vba-form-mapping.ts) ───────
VBA_FORM_MAP = {
    "form_orders_by_customer": "Orders by Customer",
    "form_orders": "Orders",
    "form_products": "Products",
    "form_employees": "Employees",
    "form_workorders": "Workorders",
}

# ─── Known VBA event suffixes ─────────────────────────
VBA_EVENTS = {
    "Click", "DblClick", "AfterUpdate", "BeforeUpdate",
    "Change", "Enter", "Exit", "GotFocus", "LostFocus",
    "Load", "Open", "Close", "Current", "Delete",
    "AfterDelConfirm", "BeforeDelConfirm", "AfterInsert",
    "BeforeInsert", "MouseDown", "MouseMove", "MouseUp",
    "KeyDown", "KeyPress", "KeyUp", "Timer", "Timer",
    "NotInList", "Dirty", "Undo", "Resize", "Activate",
    "Deactivate", "Unload", "Error", "Filter", "ApplyFilter",
    "BeforeScreenTip", "AfterLayout", "AfterRender",
    "BeforeRender", "AfterFinalRender", "DataChange",
    "DataSetChange", "RowSourceChange", "PageChange",
}

# Regex to find Private Sub declarations
HANDLER_RE = re.compile(
    r'Private\s+Sub\s+(\w+)_(' + '|'.join(re.escape(e) for e in sorted(VBA_EVENTS, key=len, reverse=True)) + r')\b(.*?)\r?\nEnd Sub',
    re.DOTALL
)

# Form-level events (no control prefix, e.g., Form_Load)
FORM_EVENTS = {
    "Form_Load", "Form_Open", "Form_Close", "Form_Current",
    "Form_AfterUpdate", "Form_BeforeUpdate", "Form_Delete",
    "Form_AfterDelConfirm", "Form_BeforeDelConfirm", "Form_AfterInsert",
    "Form_BeforeInsert", "Form_Activate", "Form_Deactivate",
    "Form_Unload", "Form_Resize", "Form_Timer", "Form_Dirty",
    "Form_Error", "Form_Filter", "Form_ApplyFilter",
    "Form_KeyDown", "Form_KeyPress", "Form_KeyUp",
    "Form_MouseDown", "Form_MouseUp", "Form_MouseMove",
    "Form_GotFocus", "Form_LostFocus",
}

FORM_EVENT_RE = re.compile(
    r'Private\s+Sub\s+(Form_\w+)\b(.*?)\r?\nEnd Sub',
    re.DOTALL
)


def get_vba_source(module_name: str) -> str:
    """Fetch VBA source from database for a given module name."""
    result = subprocess.run(
        ["psql", "-d", "polyaccess", "-t", "-A",
         "-c", f"SELECT definition->>'vba_source' FROM shared.objects WHERE type='module' AND name='{module_name}' LIMIT 1;"],
        capture_output=True, text=True, timeout=10,
    )
    return result.stdout.strip() or ""


def extract_control_events(vba_source: str) -> list[dict]:
    """Extract control-level events (standard Private Sub)."""
    events = []
    for match in HANDLER_RE.finditer(vba_source):
        control_name = match.group(1)
        event_name = match.group(2)
        signature = match.group(3).strip()
        code = match.group(0)

        # Count lines of code
        lines = [l for l in code.split("\n") if l.strip() and not l.strip().startswith("'") and "End Sub" not in l and "Private Sub" not in l]
        
        events.append({
            "type": "control",
            "control": control_name,
            "event": event_name,
            "signature": signature,
            "line_count": len(lines),
            "char_count": len(code),
            "has_error_handler": "On Error GoTo" in code or "On Error Resume" in code,
            "calls_shell": "Call Shell" in code or "Shell(" in code,
            "calls_DoCmd": "DoCmd." in code,
            "calls_MsgBox": "MsgBox" in code,
            "has_exit_label": f"Exit_{control_name}_{event_name}:" in code,
            "has_error_label": f"Err_{control_name}_{event_name}:" in code,
        })
    return events


def extract_form_events(vba_source: str) -> list[dict]:
    """Extract form-level events (Form_Load, Form_Current, etc.)."""
    events = []
    for match in FORM_EVENT_RE.finditer(vba_source):
        handler_name = match.group(1)
        signature = match.group(2).strip()
        code = match.group(0)

        # Extract the event name after "Form_"
        event_name = handler_name[5:]  # remove "Form_" prefix
        
        lines = [l for l in code.split("\n") if l.strip() and not l.strip().startswith("'") and "End Sub" not in l and "Private Sub" not in l]
        
        events.append({
            "type": "form",
            "event": event_name,
            "handler": handler_name,
            "signature": signature,
            "line_count": len(lines),
            "char_count": len(code),
            "has_error_handler": "On Error GoTo" in code or "On Error Resume" in code,
            "calls_shell": "Call Shell" in code or "Shell(" in code,
            "calls_DoCmd": "DoCmd." in code,
        })
    return events


def extract_public_subroutines(vba_source: str) -> list[dict]:
    """Extract Public Sub routines (helper functions called by events)."""
    events = []
    for match in re.finditer(r'Public\s+Sub\s+(\w+)\b(.*?)\r?\nEnd Sub', vba_source, re.DOTALL):
        name = match.group(1)
        signature = match.group(2).strip()
        code = match.group(0)
        lines = [l for l in code.split("\n") if l.strip() and not l.strip().startswith("'") and "End Sub" not in l and "Public Sub" not in l]
        
        events.append({
            "type": "public_sub",
            "name": name,
            "signature": signature,
            "line_count": len(lines),
            "char_count": len(code),
        })
    return events


def main():
    print("=" * 70)
    print("Step 3 — VBA Event Handler Extraction")
    print("=" * 70)

    all_results = {}
    total_events = 0
    total_lines = 0

    for module_name in sorted(VBA_FORM_MAP.keys()):
        api_name = VBA_FORM_MAP[module_name]

        print(f"\n── {module_name:40s} → {api_name} ──")

        vba_source = get_vba_source(module_name)
        if not vba_source or vba_source == "":
            print(f"  ⚠ No VBA source found")
            continue

        vba_source = vba_source.replace('\\r\\n', '\r\n').replace('\\n', '\n').replace('\\"', '"')
        # Strip outer quotes if needed
        if vba_source.startswith('"') and vba_source.endswith('"'):
            vba_source = vba_source[1:-1]
        # Handle escape sequences
        vba_source = vba_source.replace('\\r\\n', '\r\n').replace('\\n', '\n').replace('\\r', '\r').replace('\\"', '"').replace("\\'", "'")

        control_events = extract_control_events(vba_source)
        form_events = extract_form_events(vba_source)
        public_subs = extract_public_subroutines(vba_source)

        all_results[api_name] = {
            "module_name": module_name,
            "control_events": control_events,
            "form_events": form_events,
            "public_subs": public_subs,
        }

        n_events = len(control_events) + len(form_events)
        n_lines = sum(e["line_count"] for e in control_events) + sum(e["line_count"] for e in form_events)
        total_events += n_events
        total_lines += n_lines

        print(f"  Control events: {len(control_events):2d}  |  Form events: {len(form_events):2d}  |  Public subs: {len(public_subs):2d}")
        print(f"  Total code lines: {n_lines}")

        # Print details
        if control_events:
            print(f"  Handlers:")
            for e in control_events:
                err = " ⚠" if e["has_error_handler"] else ""
                shell = " 📧" if e["calls_shell"] else ""
                docmd = " 🔧" if e["calls_DoCmd"] else ""
                mb = " 💬" if e["calls_MsgBox"] else ""
                print(f"    {e['control']:30s}.{e['event']:<15s}  ({e['line_count']:3d} lines){err}{shell}{docmd}{mb}")

    # Summary
    print("\n" + "=" * 70)
    print(f"TOTAL: {total_events} events across {len(VBA_FORM_MAP)} forms ({total_lines} lines of VBA)")
    print("=" * 70)

    # Save to file
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(output_dir, "vba-event-extract.json")
    with open(output_path, "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\nExtract saved to: {output_path}")


if __name__ == "__main__":
    main()
