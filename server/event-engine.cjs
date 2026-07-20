// Event engine — hierarchical dispatch chain
// Implements: item-level → group-level → task-level (SPEC §3.1)
// SKIP_PROPAGATION sentinel stops the chain at any level

const { Pool } = require("pg");

const pool = new Pool({ database: "polyaccess" });

const SKIP_PROPAGATION = Symbol("SKIP_PROPAGATION");

// ─── Form-to-group mapping ──────────────────────────────
// Derived from Access form types and table structures

const FORM_GROUPS = {
  // Catalogs — static reference data, lookup targets
  catalogs: [
    "Products", "Customers", "Employees", "Suppliers",
    "Parts", "Payment Methods", "Shipping Methods",
    "Food Categories", "Grind", "My Company Information",
  ],
  // Journals — transactional records, date-centric
  journals: [
    "Orders", "OrdersProduction", "OrderView", "OrderComplete Form",
    "Workorders", "Workorders by Customer",
    "Invoices", "Payments", "Quote",
    "OrderComplete Form", "Ready For Pick-up Form",
  ],
  // Details — subform data, belongs to a master
  details: [
    "Order Details Subform", "OrderView Detail Subform", "OrderView Detail Subform1",
    "Quote Details Subform", "Quote by Customer Subform",
    "Workorder Labor", "Workorder Parts", "Assets subform",
    "RoastBatches Subform", "OnlineAssets Subform",
    "Equipment Select Subform", "SalesImplication Subform",
    "CustomerEmailSubform", "CustomerExpandedNotes",
    "EmployeeAbsenceNotes",
    "Orders  BillingTracking Subform",
    "Orders by Customer Subform",
    "WorkOrders Subform",
  ],
};

// Build reverse lookup: form name → group name
const FORM_TO_GROUP = {};
for (const [group, forms] of Object.entries(FORM_GROUPS)) {
  for (const f of forms) {
    FORM_TO_GROUP[f.toLowerCase()] = group;
  }
}

function resolveGroup(formName) {
  return FORM_TO_GROUP[formName.toLowerCase()] || null;
}

// ─── Event Registry ────────────────────────────────────

async function loadHandlers(scope, eventName, level) {
  const { rows } = await pool.query(
    `SELECT * FROM shared.event_handlers 
     WHERE scope ILIKE $1 
       AND event_name = $2 
       AND level = $3
       AND enabled = true
     ORDER BY sort_order, created_at`,
    [scope, eventName, level]
  );
  return rows;
}

// ─── Dispatch Engine ───────────────────────────────────

async function dispatchEvent(formName, eventName, context = {}) {
  const chain = [];

  // 1. Item-level handlers (most specific — first)
  const itemHandlers = await loadHandlers(formName, eventName, "item");
  chain.push({ level: "item", handlers: itemHandlers });

  // Check if any item handler signaled SKIP before continuing
  for (const h of itemHandlers) {
    if (h.handler && h.handler.includes("SKIP_PROPAGATION")) {
      return { dispatched: chain, stopped_at: "item", handler_id: h.id };
    }
  }

  // 2. Group-level handlers (parent group)
  const group = resolveGroup(formName);
  if (group) {
    const groupHandlers = await loadHandlers(group, eventName, "group");
    chain.push({ level: `group:${group}`, handlers: groupHandlers });

    for (const h of groupHandlers) {
      if (h.handler && h.handler.includes("SKIP_PROPAGATION")) {
        return { dispatched: chain, stopped_at: `group:${group}`, handler_id: h.id };
      }
    }
  }

  // 3. Task-level handlers (root — most general, last)
  const taskHandlers = await loadHandlers("task", eventName, "task");
  chain.push({ level: "task", handlers: taskHandlers });

  return { dispatched: chain, stopped_at: null, handler_id: null };
}

// ─── API Routes — mounted in index.cjs ─────────────────

function mountEventEngine(app) {
  // POST /api/events/dispatch — execute event dispatch chain
  app.post("/api/events/dispatch", async (req, res) => {
    try {
      const { formName, eventName, context } = req.body;
      if (!formName || !eventName) {
        return res.status(400).json({ error: "formName and eventName required" });
      }

      const result = await dispatchEvent(formName, eventName, context || {});

      // Count total handlers resolved
      let totalHandlers = 0;
      for (const link of result.dispatched) {
        totalHandlers += link.handlers.length;
      }

      res.json({
        formName,
        eventName,
        group: resolveGroup(formName),
        totalHandlers,
        chain: result.dispatched.map((link) => ({
          level: link.level,
          handler_count: link.handlers.length,
          handlers: link.handlers.map((h) => ({
            id: h.id,
            vba_control: h.vba_control,
            language: h.language,
            enabled: h.enabled,
            description: h.description,
          })),
        })),
        stopped_at: result.stopped_at,
        stopped_handler_id: result.handler_id,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/events/groups — show the form-to-group mapping
  app.get("/api/events/groups", (_req, res) => {
    res.json(FORM_GROUPS);
  });
}

module.exports = { mountEventEngine, dispatchEvent, resolveGroup, SKIP_PROPAGATION };
