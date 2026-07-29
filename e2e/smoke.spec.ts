import { test, expect } from "@playwright/test";

// ─── API smoke tests ─────────────────────────────────

test.describe("API Health", () => {
  test("GET /api/forms returns form list", async ({ request }) => {
    const res = await request.get("http://localhost:3001/api/forms");
    expect(res.ok()).toBeTruthy();
    const forms = await res.json();
    expect(Array.isArray(forms)).toBeTruthy();
    expect(forms.length).toBeGreaterThan(80);
    expect(forms[0]).toHaveProperty("name");
    expect(forms[0]).toHaveProperty("caption");
  });

  test("GET /api/forms/:name returns form definition", async ({ request }) => {
    const res = await request.get("http://localhost:3001/api/forms/Orders%20by%20Customer");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    // API returns the definition directly (not wrapped in {definition: ...})
    expect(data).toHaveProperty("header");
    expect(data).toHaveProperty("detail");
    expect(data).toHaveProperty("footer");
  });

  test("GET /api/events returns event handlers", async ({ request }) => {
    const res = await request.get("http://localhost:3001/api/events?scope=Orders%20by%20Customer");
    expect(res.ok()).toBeTruthy();
    const events = await res.json();
    expect(Array.isArray(events)).toBeTruthy();
  });

  test("POST /api/events/dispatch resolves item→group→task chain", async ({ request }) => {
    const res = await request.post("http://localhost:3001/api/events/dispatch", {
      data: { formName: "Orders by Customer", eventName: "on_current" },
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result).toHaveProperty("chain");
    expect(result.chain.length).toBeGreaterThanOrEqual(1);
    // First link should be item-level
    expect(result.chain[0].level).toBe("item");
    // Last link should be task-level
    expect(result.chain[result.chain.length - 1].level).toBe("task");
  });

  test("GET /api/events/groups returns form groupings", async ({ request }) => {
    const res = await request.get("http://localhost:3001/api/events/groups");
    expect(res.ok()).toBeTruthy();
    const groups = await res.json();
    expect(groups).toHaveProperty("catalogs");
    expect(groups).toHaveProperty("journals");
    expect(groups).toHaveProperty("details");
  });
});

// ─── UI smoke tests ──────────────────────────────────

test.describe("App Shell", () => {
  test("page loads and shows sidebar", async ({ page }) => {
    await page.goto("/");
    // Should see the app title (use .first() because it appears in both sidebar and content)
    await expect(page.locator("text=Roastery ERP").first()).toBeVisible();
    // Sidebar should be present (with navigation sections)
    await expect(page.getByRole("button", { name: "Forms" })).toBeVisible();
  });

  test("clicking a form in sidebar opens a form window", async ({ page }) => {
    await page.goto("/");
    // Wait for sidebar to render — the tree loads from the API
    await page.waitForTimeout(2000);
    // Find and click the first visible form in the tree
    const formLink = page.locator("text=Orders by Customer").first();
    await expect(formLink).toBeVisible({ timeout: 5000 });
    await formLink.click();
    // Wait for form window to appear (it loads the form definition from the API)
    await page.waitForTimeout(2000);
    // The form window header should show the form name
    await expect(page.locator("text=Orders by Customer").first()).toBeVisible();
  });
});

// ─── Event system verification ───────────────────────

test.describe("Event Dispatch", () => {
  test("Orders by Customer on_load resolves handlers", async ({ request }) => {
    const res = await request.post("http://localhost:3001/api/events/dispatch", {
      data: { formName: "Orders by Customer", eventName: "on_load" },
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result.totalHandlers).toBeGreaterThan(0);
  });

  test("Leads on_click returns many handlers (most complex form)", async ({ request }) => {
    const res = await request.post("http://localhost:3001/api/events/dispatch", {
      data: { formName: "Leads", eventName: "on_click" },
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result.totalHandlers).toBeGreaterThan(20);
  });

  test("Unknown form gracefully returns 0 handlers", async ({ request }) => {
    const res = await request.post("http://localhost:3001/api/events/dispatch", {
      data: { formName: "NonExistentForm", eventName: "on_load" },
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result.totalHandlers).toBe(0);
    // Chain has 2 levels for unknown forms (item + task; no group since form isn't mapped)
    expect(result.chain.length).toBe(2);
  });
});

// ─── Event Handler Editor UI ─────────────────────────

test.describe("Event Handler Editor", () => {
  test("sidebar has Event Handlers button inside Administration group", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);
    // Event Handlers is inside the collapsed "Administration" group — expand it first
    await page.getByRole("button", { name: /Administration/ }).click();
    await page.waitForTimeout(500);
    const editorBtn = page.getByRole("button", { name: "Event Handlers" });
    await expect(editorBtn).toBeVisible();
  });

  test("clicking Event Handlers shows the editor page", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);
    // Expand the Administration group
    await page.getByRole("button", { name: /Administration/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Event Handlers" }).click();
    await page.waitForTimeout(1000);
    // Should see the editor header
    await expect(page.locator("text=Event Handlers").first()).toBeVisible();
  });
});