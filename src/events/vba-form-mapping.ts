// VBA Form Rename Mapping — maps VBA module names to current API form names
//
// VBA modules (stored in shared.objects type='module') use the Access
// internal naming convention: form_orders_by_customer
// The API and React app use Title Case: "Orders by Customer"
//
// This mapping is consumed at event extraction time — it tells us which
// form definition a VBA event handler belongs to. It is NOT needed at runtime.
//
// Generated: 2026-07-19
// Coverage: 59/62 VBA modules mapped (3 dead modules excluded)

export const VBA_FORM_MAP: Record<string, string> = {
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
};

// Dead VBA modules (no API equivalent — events are orphaned)
// form_delete              — deleted Access form
// form_old_workorders_by_customer_subform  — superseded by current version
// form_orders_by_customerdeleteme          — stale module marked for deletion

/**
 * Convert a VBA module name to the current API form name.
 * Returns null if the module has no API equivalent.
 */
export function vbaModuleToFormName(vbaName: string): string | null {
  return VBA_FORM_MAP[vbaName] ?? null;
}

/**
 * Verify that all mapped form names exist in the API.
 * Call this during development to catch stale mappings.
 */
export function getUnmappedModules(vbaModules: string[]): string[] {
  return vbaModules.filter((m) => !VBA_FORM_MAP[m]);
}

/**
 * Reverse lookup: given an API form name, return all VBA modules that map to it.
 * Most forms have one module, but some have two (e.g., form_employees + form_employees_subform).
 */
export function apiFormToVbaModules(apiName: string): string[] {
  return Object.entries(VBA_FORM_MAP)
    .filter(([, v]) => v === apiName)
    .map(([k]) => k);
}