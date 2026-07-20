#!/usr/bin/env python3
"""Step 2 — Integration test: verify every VBA module maps to an existing API form.

Run: python3 src/events/__tests__/vba-form-mapping-test.py
"""

import json
import urllib.request
import sys

# ─── The mapping under test (verbatim from vba-form-mapping.ts) ───────
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

# Dead modules — no API equivalent, should NOT be in the map
DEAD_MODULES = {
    "form_delete",
    "form_old_workorders_by_customer_subform",
    "form_orders_by_customerdeleteme",
}


def fetch_api_forms() -> set[str]:
    """Fetch all form names from the API."""
    req = urllib.request.Request("http://localhost:3001/api/forms")
    with urllib.request.urlopen(req, timeout=10) as resp:
        forms = json.loads(resp.read())
    return {f["name"] for f in forms}


def fetch_vba_modules() -> set[str]:
    """Fetch VBA module names from the database."""
    import subprocess
    result = subprocess.run(
        ["psql", "-d", "polyaccess", "-t", "-A",
         "-c", "SELECT DISTINCT name FROM shared.objects WHERE type = 'module' AND name LIKE 'form_%' ORDER BY name;"],
        capture_output=True, text=True, timeout=10,
    )
    return {line.strip() for line in result.stdout.split("\n") if line.strip()}


def test_all_modules_mapped(vba_modules: set[str]):
    """PASS: Every VBA module has an entry in VBA_FORM_MAP (or is in DEAD_MODULES)."""
    unmapped = vba_modules - set(VBA_FORM_MAP.keys()) - DEAD_MODULES
    if unmapped:
        print(f"  ❌ FAIL — {len(unmapped)} unmapped VBA modules:")
        for m in sorted(unmapped):
            print(f"     {m}")
        return False
    print(f"  ✅ PASS — All {len(vba_modules)} VBA modules accounted for")
    return True


def test_all_mapped_names_exist(api_forms: set[str]):
    """PASS: Every mapped name in VBA_FORM_MAP exists as an API form."""
    missing = set(VBA_FORM_MAP.values()) - api_forms
    if missing:
        print(f"  ❌ FAIL — {len(missing)} mapped names not found in API:")
        for name in sorted(missing):
            # Show which VBA modules map to this name
            sources = [k for k, v in VBA_FORM_MAP.items() if v == name]
            print(f"     '{name}' (from: {', '.join(sources)})")
        return False
    print(f"  ✅ PASS — All {len(set(VBA_FORM_MAP.values()))} unique API form names exist")
    return True


def test_no_dead_modules_in_map():
    """PASS: No dead modules appear in the mapping."""
    dead_in_map = DEAD_MODULES & set(VBA_FORM_MAP.keys())
    if dead_in_map:
        print(f"  ❌ FAIL — Dead modules found in mapping: {dead_in_map}")
        return False
    print(f"  ✅ PASS — No dead modules in mapping")
    return True


def test_reverse_lookup_no_duplicates():
    """PASS: No more than 2 VBA modules map to the same form (subform modules are expected)."""
    from collections import Counter
    counts = Counter(VBA_FORM_MAP.values())
    dups = {name: cnt for name, cnt in counts.items() if cnt > 2}
    if dups:
        print(f"  ❌ FAIL — {len(dups)} form names have >2 VBA modules:")
        for name, cnt in dups.items():
            modules = [k for k, v in VBA_FORM_MAP.items() if v == name]
            print(f"     '{name}' ({cnt} modules: {', '.join(modules)})")
        return False
    print(f"  ✅ PASS — No form has >2 mapping collisions (only expected subform pairs)")
    return True


def main():
    print("=" * 70)
    print("Step 2 — VBA Form Mapping Integration Test")
    print("=" * 70)

    # Fetch live data
    print("\n[Fetching API form names...]")
    api_forms = fetch_api_forms()
    print(f"  Found {len(api_forms)} API forms")

    print("\n[Fetching VBA module names from DB...]")
    vba_modules = fetch_vba_modules()
    print(f"  Found {len(vba_modules)} VBA modules")

    # Run tests
    print("\n" + "─" * 70)
    results = []

    print("\n1. No dead modules in mapping")
    results.append(test_no_dead_modules_in_map())

    print("\n2. All VBA modules mapped (or explicitly excluded)")
    results.append(test_all_modules_mapped(vba_modules))

    print("\n3. All mapped names exist as API forms")
    results.append(test_all_mapped_names_exist(api_forms))

    print("\n4. Reverse-lookup collision check")
    results.append(test_reverse_lookup_no_duplicates())

    # Summary
    print("\n" + "─" * 70)
    passed = sum(results)
    failed = len(results) - passed
    print(f"\n{'✅ ALL TESTS PASSED' if failed == 0 else '❌ SOME TESTS FAILED'}")
    print(f"  Passed: {passed}/{len(results)}")
    if failed:
        print(f"  Failed: {failed}/{len(results)}")
        sys.exit(1)
    print(f"\n  Mapping coverage: {len(VBA_FORM_MAP)} VBA modules → {len(set(VBA_FORM_MAP.values()))} unique API forms")
    print(f"  Dead modules excluded: {len(DEAD_MODULES)}")


if __name__ == "__main__":
    main()
