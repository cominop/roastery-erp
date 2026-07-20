// Subform metadata overrides — repairs incomplete Access import metadata
//
// Override keys use: "ParentFormName::SubformControlName"
// Display mode keys use the bound form name
//
// The preferred long-term fix is to write these values back into the
// form definitions in the database. Overrides are a temporary bridge.

import type { SubformControlDefinition, SubformDisplayOverride } from "./subform-types";

// ─── Metadata Overrides ────────────────────────────────
// Corrects sourceObject, link fields, and tabPage for subform controls
// where the Access import left them missing or wrong

export const SUBFORM_METADATA_OVERRIDES: Record<string, Partial<SubformControlDefinition>> = {
  // ── Orders by Customer (4 subforms) ─────────────────
  "Orders by Customer::Orders by Customer Subform": {
    sourceObject: "Orders by Customer Subform",
    linkMasterFields: ["CustomerID"],
    linkChildFields: ["CustomerID"],
    tabPage: "Orders",
  },
  "Orders by Customer::Assets subform": {
    sourceObject: "Assets subform",
    linkMasterFields: ["CustomerID"],
    linkChildFields: ["AssetID"],
    tabPage: "Assets",
  },
  "Orders by Customer::CustomerEmailSubform": {
    sourceObject: "CustomerEmailSubform",
    tabPage: "Email & Prefs",
  },
  "Orders by Customer::WorkOrders Subform": {
    sourceObject: "WorkOrders Subform",
    linkMasterFields: ["CustomerID"],
    linkChildFields: ["CustomerID"],
    tabPage: "Work Orders",
  },

  // ── Orders ──────────────────────────────────────────
  "Orders::Order Details Subform": {
    sourceObject: "Order Details Subform",
    linkMasterFields: ["OrderID"],
    linkChildFields: ["OrderID"],
  },
  "OrdersProduction::Order Details Subform": {
    sourceObject: "Order Details Subform",
    linkMasterFields: ["OrderID"],
    linkChildFields: ["OrderID"],
  },

  // ── OrderView ────────────────────────────────────────
  "OrderView::OrderView Detail Subform": {
    sourceObject: "OrderView Detail Subform",
    linkMasterFields: ["OrderID"],
    linkChildFields: ["OrderID"],
  },

  // ── Quotes ───────────────────────────────────────────
  "Quote::Quote Details Subform": {
    sourceObject: "Quote Details Subform",
    linkMasterFields: ["OrderID"],
    linkChildFields: ["OrderID"],
  },

  // ── Customer BillingTracking ─────────────────────────
  "Customer BillingTracking Form::Orders BillingTracking Subform": {
    sourceObject: "Orders  BillingTracking Subform",
    linkMasterFields: ["CustomerID"],
    linkChildFields: ["CustomerID"],
  },

  // ── Employees ────────────────────────────────────────
  "Employees::EMP_HRS Form": {
    sourceObject: "EMP_HRS subform",
    linkMasterFields: ["EmployeeID"],
    linkChildFields: ["EmployeeID"],
    tabPage: "Employment History",
  },
  "Employees::EmployeeTasks subform": {
    sourceObject: "EmployeeTasks subform",
    linkMasterFields: ["EmployeeID"],
    linkChildFields: ["EmployeeId"],
    tabPage: "Tasks",
  },
  "EmployeeTasks subform::Child17": {
    sourceObject: "EmployeeSubTasks",
    linkMasterFields: ["TaskId"],
    linkChildFields: ["TaskId"],
  },

  // ── EMP_HRS Form → EMP_HRS_DETAIL ────────────────────
  "EMP_HRS Form::EMP_HRS_DETAIL Subform": {
    sourceObject: "EMP_HRS_DETAIL Subform",
    linkMasterFields: ["PAYROLL_ID"],
    linkChildFields: ["PAYROLL_ID"],
  },

  // ── Sales (same control name, different bound forms) ─
  "SalesProblemImplications::SalesImplication Subform": {
    sourceObject: "SalesImplication Subform",
    linkMasterFields: ["ProblemID"],
    linkChildFields: ["ProblemID"],
  },
  "SalesProblemPayoff::SalesImplication Subform": {
    sourceObject: "SalesProblemPayoff",
    linkMasterFields: ["ProblemID"],
    linkChildFields: ["ProblemID"],
  },

  // ── Workorders ───────────────────────────────────────
  "Workorders::Workorder Labor": {
    sourceObject: "Workorder Labor",
    linkMasterFields: ["WorkorderID"],
    linkChildFields: ["WorkorderID"],
  },
  "Workorders::Workorder Parts": {
    sourceObject: "Workorder Parts",
    linkMasterFields: ["WorkorderID"],
    linkChildFields: ["WorkorderID"],
  },
  "Workorders by Customer::Workorders by Customer Subform": {
    sourceObject: "Workorders by Customer",
    linkMasterFields: ["CustomerID"],
    linkChildFields: ["CustomerID"],
  },

  // ── RoastSessions → RoastBatches ──────────────────────
  "RoastSessions::RoastBatches Subform": {
    sourceObject: "RoastBatches Subform",
    linkMasterFields: ["RoastID"],
    linkChildFields: ["RoastID"],
  },

  // ── Roast → RoastDetails ──────────────────────────────
  "Roast::RoastDetails Subform": {
    sourceObject: "Roast",
    linkMasterFields: ["RoastID"],
    linkChildFields: ["RoastID"],
  },

  // ── OrderComplete / Ready For Pick-up ─────────────────
  "OrderComplete Form::ReadyForPickUpQuery subform": {
    sourceObject: "ReadyForPickUpQuery subform",
    linkMasterFields: ["Customers.CustomerID"],
    linkChildFields: ["Orders.CustomerID"],
  },
  "Ready For Pick-up Form::ReadyForPickUpQuery subform": {
    sourceObject: "ReadyForPickUpQuery subform",
    linkMasterFields: ["Customers.CustomerID"],
    linkChildFields: ["Orders.CustomerID"],
  },

  // ── Leads → CustomerEmailSubform ─────────────────────
  "Leads::CustomerEmailSubform": {
    sourceObject: "CustomerEmailSubform",
    tabPage: "LeadEmails",
  },

  // ── AssetsAndCustomer → Assets subform ────────────────
  "AssetsAndCustomer::Assets subform": {
    sourceObject: "Assets subform",
    linkMasterFields: ["AssetID"],
    linkChildFields: ["AssetID"],
  },

  // ── Marketing Sites → OnlineAssets ────────────────────
  "MarketingSites::OnlineAssets Subform": {
    sourceObject: "OnlineAssets Subform",
    linkMasterFields: ["SiteID"],
    linkChildFields: ["SiteID"],
  },

  // ── Equipment Select ────────────────────���────────────
  "Equipment Select Form::Equipment Select Subform": {
    sourceObject: "Equipment Select Subform",
  },

  // ── CoffeeRecipes ────────────────────────────────────
  "CoffeeRecipes::CoffeeRecipes Query subform1": {
    sourceObject: "CoffeeRecipes Query subform",
    linkMasterFields: ["RecipeID"],
    linkChildFields: ["RecipeID"],
  },
};

// ─── Display Mode Registry ────────────────────────────��
// Maps bound form name → display mode + record source
// This is used when the form definition in the DB has no display-mode

export const DISPLAY_MODE_REGISTRY: Record<string, SubformDisplayOverride> = {
  "Orders by Customer Subform": { displayMode: "grid" },
  "Assets subform": { displayMode: "fields" },
  "CustomerEmailSubform": { displayMode: "fields" },
  "WorkOrders Subform": { displayMode: "fields" },
  "Order Details Subform": { displayMode: "grid" },
  "OrderView Detail Subform": { displayMode: "grid" },
  "Orders  BillingTracking Subform": { displayMode: "grid" },
  "Quote Details Subform": { displayMode: "grid" },
  "Workorder Labor": { displayMode: "grid" },
  "Workorder Parts": { displayMode: "grid" },
  "SalesImplication Subform": { displayMode: "grid" },
  "SalesProblemPayoff": { displayMode: "grid" },
  "OnlineAssets Subform": { displayMode: "grid" },
  "EMP_HRS_DETAIL Subform": { displayMode: "grid" },
  "EMP_HRS subform": { displayMode: "fields" },
  "RoastBatches Subform": { displayMode: "grid" },
  "ReadyForPickUpQuery subform": { displayMode: "grid" },
  "EmployeeSubTasks": { displayMode: "grid" },
  "EmployeeTasks subform": { displayMode: "hybrid" },
  "Workorders by Customer": { displayMode: "grid" },
  "Equipment Select Subform": { displayMode: "grid" },
  "CoffeeRecipes Query subform": { displayMode: "grid" },
  "Roast": { displayMode: "fields" },
};

// ─── Grid Column Overrides ──────────────────────────
// Maps bound form name → ordered list of columns to show
// Used when the form definition's detail controls are empty or
// when we want to override the auto-derived columns from data keys.
// (spec §14 — Grid display mode)

export interface GridColumnOverride {
  field: string;
  label: string;
  width?: number;
}

export const GRID_COLUMN_OVERRIDES: Record<string, GridColumnOverride[]> = {
  "Orders by Customer Subform": [
    { field: "orderid", label: "Order ID", width: 80 },
    { field: "order_total", label: "Total Sale", width: 100 },
    { field: "orderdate", label: "Order Date", width: 120 },
    { field: "shipdate", label: "Ship Date", width: 120 },
    { field: "order_payment_due", label: "Amount Due", width: 100 },
  ],
};

// ─── Helpers ───────────────────────────────────────────

/** Build the override lookup key from parent form + control name */
export function subformKey(parentFormName: string, controlName: string): string {
  return `${parentFormName}::${controlName}`;
}

/** Resolve a subform definition from a control, applying overrides */
export function resolveSubformDefinition(
  parentFormName: string,
  control: Record<string, unknown>
): SubformControlDefinition {
  const name = (control.name as string) || "";
  const key = subformKey(parentFormName, name);
  const override = SUBFORM_METADATA_OVERRIDES[key];

  return {
    name,
    sourceObject: override?.sourceObject ?? (control["source-object"] as string) ?? (control["sourceObject"] as string) ?? "",
    linkMasterFields: override?.linkMasterFields ?? (control["link-master-fields"] as string[]) ?? (control["linkMasterFields"] as string[]) ?? undefined,
    linkChildFields: override?.linkChildFields ?? (control["link-child-fields"] as string[]) ?? (control["linkChildFields"] as string[]) ?? undefined,
    tabPage: override?.tabPage ?? (control["tab-page"] as string) ?? (control["tabPage"] as string) ?? undefined,
  };
}

/** Get the display mode for a bound form, checking DB definition first then registry */
export function resolveDisplayMode(boundFormName: string, formDefinition?: Record<string, unknown>): string {
  // Check DB definition first
  const dbMode = (formDefinition?.["display-mode"] as string) ?? (formDefinition?.["displayMode"] as string);
  if (dbMode) return dbMode;
  // Fall back to registry
  return DISPLAY_MODE_REGISTRY[boundFormName]?.displayMode ?? "fields";
}

/** Read a value from a record, supporting qualified names like "Customers.CustomerID" */
export function getRecordValue(record: Record<string, unknown>, fieldName: string): unknown {
  if (record == null) return undefined;

  // 1. Exact match
  if (fieldName in record) return record[fieldName];

  // 2. Qualified path: take the last segment
  const parts = fieldName.split(".");
  const terminal = parts[parts.length - 1];
  if (terminal in record) return record[terminal];

  // 3. Case-insensitive fallback — PostgreSQL returns lowercase keys
  const lowerField = fieldName.toLowerCase();
  const lowerTerminal = terminal.toLowerCase();
  for (const key of Object.keys(record)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === lowerField || lowerKey === lowerTerminal) {
      return record[key];
    }
  }

  return undefined;
}