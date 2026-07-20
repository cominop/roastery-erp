#!/usr/bin/env python3
"""Step 5 — Bulk-extract VBA event handlers from ALL 62 VBA modules.

Parses VBA source from shared.objects for every module in VBA_FORM_MAP
and extracts every event handler organized by API form name.

Output: src/events/__tests__/vba-all-extract.json
"""

import json
import re
import subprocess
import os

# ─── Full mapping (all 60 active modules) ─────────────
VBA_FORM_MAP = {
    "form_assets": "Assets",
    "form_assets_subform": "Assets subform",
    "form_bulk_product_form": "Bulk Product Form",
    "form_coffeeproductioncosts": "CoffeeProductionCosts",
    "form_customer_billingtracking_form": "Customer BillingTracking Form",
    "form_customeremailsubform": "CustomerEmailSubform",
    "form_customerexpandednotes": "CustomerExpandedNotes",
    "form_deficiencylog": "DeficiencyLog",
    "form_deliverytools": "DeliveryTools",
    "form_employeeabsencenotes": "EmployeeAbsenceNotes",
    "form_employees": "Employees",
    "form_employees_subform": "Employees",
    "form_equipment_select_form": "Equipment Select Form",
    "form_equipment_select_subform": "Equipment Select Subform",
    "form_fcc_erp_development": "FCC ERP Development",
    "form_food_categories": "Food Categories",
    "form_leads": "Leads",
    "form_marketingsites": "MarketingSites",
    "form_onlineassets_subform": "OnlineAssets Subform",
    "form_ordercomplete_form": "OrderComplete Form",
    "form_order_details_subform": "Order Details Subform",
    "form_orders": "Orders",
    "form_orders__billingtracking_subform": "Orders  BillingTracking Subform",
    "form_orders_by_customer": "Orders by Customer",
    "form_orders_by_customer_subform": "Orders by Customer Subform",
    "form_ordersproduction": "OrdersProduction",
    "form_orderview": "OrderView",
    "form_orderview_detail_subform": "OrderView Detail Subform",
    "form_orderview_detail_subform1": "OrderView Detail Subform1",
    "form_orderview_old": "OrderView",
    "form_parts": "Parts",
    "form_payment_methods": "Payment Methods",
    "form_payments": "Payments",
    "form_price_list_select_form": "Price List Select Form",
    "form_print_invoice": "Print Invoice",
    "form_print_invoice1": "Print Invoice1",
    "form_production_report_select_form": "Production Report Select Form",
    "form_products": "Products",
    "form_quote": "Quote",
    "form_quote_by_customer_subform": "Quote by Customer Subform",
    "form_quote_details_subform": "Quote Details Subform",
    "form_ready_for_pick_up_form": "Ready For Pick-up Form",
    "form_report_date_range": "Report Date Range",
    "form_report_date_range1": "Report Date Range1",
    "form_roastbatches_subform": "RoastBatches Subform",
    "form_salesimplication_subform": "SalesImplication Subform",
    "form_salesneedpayoff": "SalesNeedPayoff",
    "form_salesopens": "SalesOpens",
    "form_salesproblemimplications": "SalesProblemImplications",
    "form_salesproblempayoff": "SalesProblemPayoff",
    "form_salessituation": "SalesSituation",
    "form_setsessiondate": "SetSessionDate",
    "form_shipping_methods": "Shipping Methods",
    "form_stopwatch": "Stopwatch",
    "form_switchboard": "Switchboard",
    "form_workorder_labor": "Workorder Labor",
    "form_workorder_parts": "Workorder Parts",
    "form_workorders": "Workorders",
    "form_workorders_by_customer": "Workorders by Customer",
    "form_workorders_subform": "WorkOrders Subform",
}

VBA_EVENTS = {
    "Click", "DblClick", "AfterUpdate", "BeforeUpdate",
    "Change", "Enter", "Exit", "GotFocus", "LostFocus",
    "Load", "Open", "Close", "Current", "Delete",
    "AfterDelConfirm", "BeforeDelConfirm", "AfterInsert",
    "BeforeInsert", "MouseDown", "MouseMove", "MouseUp",
    "KeyDown", "KeyPress", "KeyUp", "Timer",
    "NotInList", "Dirty", "Undo", "Resize", "Activate",
    "Deactivate", "Unload", "Error", "Filter", "ApplyFilter",
    "BeforeScreenTip", "AfterLayout", "AfterRender",
    "BeforeRender", "AfterFinalRender", "DataChange",
    "DataSetChange", "RowSourceChange", "PageChange",
}

HANDLER_RE = re.compile(
    r'Private\s+Sub\s+(\w+)_(' + '|'.join(re.escape(e) for e in sorted(VBA_EVENTS, key=len, reverse=True)) + r')\b(.*?)\r?\nEnd Sub',
    re.DOTALL
)

FORM_EVENT_RE = re.compile(
    r'Private\s+Sub\s+(Form_\w+)\b(.*?)\r?\nEnd Sub',
    re.DOTALL
)

PUBLIC_SUB_RE = re.compile(
    r'Public\s+Sub\s+(\w+)\b(.*?)\r?\nEnd Sub',
    re.DOTALL
)

# Event name mapping: VBA event → Event Propagation event name
EVENT_NAME_MAP = {
    "Click": "on_click",
    "DblClick": "on_dbl_click",
    "AfterUpdate": "on_after_update",
    "BeforeUpdate": "on_before_update",
    "Change": "on_change",
    "Enter": "on_enter",
    "Exit": "on_exit",
    "GotFocus": "on_got_focus",
    "LostFocus": "on_lost_focus",
    "Load": "on_load",
    "Open": "on_open",
    "Close": "on_close",
    "Current": "on_current",
    "Delete": "on_delete",
    "AfterDelConfirm": "on_after_del_confirm",
    "BeforeDelConfirm": "on_before_del_confirm",
    "AfterInsert": "on_after_insert",
    "BeforeInsert": "on_before_insert",
    "MouseDown": "on_mouse_down",
    "MouseUp": "on_mouse_up",
    "MouseMove": "on_mouse_move",
    "KeyDown": "on_key_down",
    "KeyPress": "on_key_press",
    "KeyUp": "on_key_up",
    "Timer": "on_timer",
    "NotInList": "on_not_in_list",
    "Dirty": "on_dirty",
    "Undo": "on_undo",
    "Resize": "on_resize",
    "Activate": "on_activate",
    "Deactivate": "on_deactivate",
    "Unload": "on_unload",
    "Error": "on_error",
    "Filter": "on_filter",
    "ApplyFilter": "on_apply_filter",
    "PageChange": "on_page_change",
}


def get_vba_source(module_name: str) -> str:
    """Fetch VBA source from database."""
    result = subprocess.run(
        ["psql", "-d", "polyaccess", "-t", "-A",
         "-c", f"SELECT definition->>'vba_source' FROM shared.objects WHERE type='module' AND name='{module_name}' LIMIT 1;"],
        capture_output=True, text=True, timeout=10,
    )
    return result.stdout.strip() or ""


def clean_vba(vba_source: str) -> str:
    """Clean escaped JSON string into raw VBA."""
    if not vba_source:
        return ""
    s = vba_source
    if s.startswith('"') and s.endswith('"'):
        s = s[1:-1]
    s = s.replace('\\r\\n', '\r\n').replace('\\r', '\r').replace('\\n', '\n')
    s = s.replace('\\"', '"').replace("\\'", "'")
    return s


def extract_events(vba_source: str) -> tuple[list[dict], list[dict], list[dict]]:
    """Extract control events, form events, and public subs."""
    control_events = []
    for match in HANDLER_RE.finditer(vba_source):
        control_name = match.group(1)
        event_name = match.group(2)
        signature = match.group(3).strip()
        code = match.group(0)

        lines = [l for l in code.split("\n") if l.strip() and not l.strip().startswith("'") and "End Sub" not in l and "Private Sub" not in l]

        control_events.append({
            "type": "control",
            "control": control_name,
            "event": event_name,
            "event_prop": EVENT_NAME_MAP.get(event_name, f"on_{event_name.lower()}"),
            "signature": signature,
            "line_count": len(lines),
            "char_count": len(code),
            "has_error_handler": "On Error GoTo" in code or "On Error Resume" in code,
            "calls_shell": "Call Shell" in code or "Shell(" in code,
            "calls_DoCmd": "DoCmd." in code,
            "calls_MsgBox": "MsgBox" in code,
        })

    form_events = []
    for match in FORM_EVENT_RE.finditer(vba_source):
        handler_name = match.group(1)
        signature = match.group(2).strip()
        code = match.group(0)
        event_name = handler_name[5:]

        lines = [l for l in code.split("\n") if l.strip() and not l.strip().startswith("'") and "End Sub" not in l and "Private Sub" not in l]

        form_events.append({
            "type": "form",
            "event": event_name,
            "event_prop": EVENT_NAME_MAP.get(event_name, f"on_{event_name.lower()}"),
            "handler": handler_name,
            "signature": signature,
            "line_count": len(lines),
            "char_count": len(code),
            "has_error_handler": "On Error GoTo" in code or "On Error Resume" in code,
            "calls_shell": "Call Shell" in code or "Shell(" in code,
            "calls_DoCmd": "DoCmd." in code,
        })

    public_subs = []
    for match in PUBLIC_SUB_RE.finditer(vba_source):
        name = match.group(1)
        signature = match.group(2).strip()
        code = match.group(0)
        lines = [l for l in code.split("\n") if l.strip() and not l.strip().startswith("'") and "End Sub" not in l and "Public Sub" not in l]

        public_subs.append({
            "name": name,
            "signature": signature,
            "line_count": len(lines),
            "char_count": len(code),
        })

    return control_events, form_events, public_subs


def main():
    print("=" * 70)
    print("Step 5 — Bulk VBA Event Extraction (All Modules)")
    print("=" * 70)

    all_results = {}
    total_events = 0
    total_lines = 0
    modules_with_events = 0
    modules_empty = 0
    modules_no_source = 0

    for module_name in sorted(VBA_FORM_MAP.keys()):
        api_name = VBA_FORM_MAP[module_name]

        raw = get_vba_source(module_name)
        if not raw or raw == "" or raw == '""':
            all_results[api_name] = {"module_name": module_name, "status": "no_source"}
            modules_no_source += 1
            continue

        vba_source = clean_vba(raw)
        if not vba_source.strip():
            all_results[api_name] = {"module_name": module_name, "status": "empty"}
            modules_empty += 1
            continue

        control_events, form_events, public_subs = extract_events(vba_source)
        n_events = len(control_events) + len(form_events)
        n_lines = sum(e["line_count"] for e in control_events) + sum(e["line_count"] for e in form_events)

        all_results[api_name] = {
            "module_name": module_name,
            "status": "has_events",
            "control_events": control_events,
            "form_events": form_events,
            "public_subs": public_subs,
        }

        total_events += n_events
        total_lines += n_lines
        modules_with_events += 1

        print(f"  {'✅' if n_events > 0 else '⚠'} {module_name:45s} → {api_name:30s}  ({n_events:3d} events, {n_lines:3d} lines)")

    # Summary
    print("\n" + "=" * 70)
    print(f"Modules with events: {modules_with_events}")
    print(f"Modules empty (no VBA): {modules_empty}")
    print(f"Modules no source: {modules_no_source}")
    print(f"Total: {modules_with_events + modules_empty + modules_no_source}")
    print(f"Total events extracted: {total_events}")
    print(f"Total lines of VBA: {total_lines}")
    print("=" * 70)

    # Save
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vba-all-extract.json")
    with open(output_path, "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\nSaved to: {output_path}")


if __name__ == "__main__":
    main()