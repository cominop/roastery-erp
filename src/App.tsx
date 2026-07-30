// App shell — sidebar with Settings panel
import { useState, useEffect, useCallback, useMemo } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Menu,
  Table2,
  Settings,
  X,
  Paintbrush,
  Type,
  Square,
  PanelTop,
} from "lucide-react";
import SidebarTree, { extractNavItems } from "@/components/SidebarTree";
import type { NavTreeNode } from "@/components/SidebarTree";
import FormRenderer from "@/components/FormRenderer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EventProvider } from "@/events/EventProvider";
import FormWorkspace from "@/components/form-window/form-workspace";
import FormWindow from "@/components/form-window/form-window";
import { useFormWindowManager } from "@/components/form-window/use-form-window-manager";
import EventHandlerEditorPage from "@/components/EventHandlerEditorPage";
import { useFilters, useFilterUrlSync } from "@/hooks";
import { FilterPanel, QuickFilterBar } from "@/filters";
import type { QuickFilterPreset } from "@/filters";
import { RoleManager, PermissionMatrix, RowFilterEditor } from "@/permissions";
import CalculatedFieldsAdmin from "@/calculated-fields/admin/CalculatedFieldsAdmin";
import AuditLogPage from "@/components/AuditLogPage";
import MetadataManager from "@/metadata/MetadataManager";
import { useUser } from "@/hooks/useUser";
import { usePermissions } from "@/hooks/usePermissions";

type ActiveView =
  | { type: "table"; name: string }
  | { type: "form"; name: string }
  | { type: "report"; name: string }
  | { type: "events" }
  | { type: "permissions" }
  | { type: "calculated-fields" }
  | { type: "audit-log" }
  | { type: "metadata" }
  | null;

// ─── Appearance Settings ───────────────────────────────

interface AppearanceSettings {
  fieldFontSize: string;
  fieldFontColor: string;
  fieldFontFamily: string;
  fieldBackgroundColor: string;
  fieldBorderRadius: string;
  labelFontSize: string;
  labelFontColor: string;
  labelFontFamily: string;
  formBackgroundColor: string;
  formResizable: boolean;
  formHeaderBackgroundColor: string;
  formHeaderFontColor: string;
  formHeaderResizable: boolean;
  formFooterBackgroundColor: string;
  formFooterFontColor: string;
  formFooterResizable: boolean;
}

const DEFAULT_APPEARANCE: AppearanceSettings = {
  fieldFontSize: "12px",
  fieldFontColor: "#1F2937",
  fieldFontFamily: "Geist Variable, sans-serif",
  fieldBackgroundColor: "#FFFFFF",
  fieldBorderRadius: "6px",
  labelFontSize: "11px",
  labelFontColor: "#374151",
  labelFontFamily: "Geist Variable, sans-serif",
  formBackgroundColor: "#FFFFFF",
  formResizable: true,
  formHeaderBackgroundColor: "#F3F4F6",
  formHeaderFontColor: "#6B7280",
  formHeaderResizable: true,
  formFooterBackgroundColor: "#F3F4F6",
  formFooterFontColor: "#6B7280",
  formFooterResizable: true,
};

const FONT_SIZES = ["9px", "10px", "11px", "12px", "13px", "14px"];
const FONT_FAMILIES = ["Geist Variable, sans-serif", "Arial, sans-serif", "Helvetica, sans-serif", "System-ui, sans-serif", "monospace"];

// ─── Color swatch picker ───────────────────────────────

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground w-20 shrink-0">{label}</Label>
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-8 h-8 opacity-0 cursor-pointer"
        />
        <div className="w-8 h-8 rounded border border-border" style={{ backgroundColor: value }} />
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-24 text-[10px] font-mono"
      />
    </div>
  );
}

// ─── Settings Panel ────────────────────────────────────

function SettingRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </div>
      <div className="pl-5 space-y-2">
        {children}
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground w-20 shrink-0">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs border rounded px-2 bg-background flex-1"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Table-specific quick filter presets ─────────────

function getTablePresets(table: string): QuickFilterPreset[] {
  const name = table.toLowerCase();

  if (name === "orders") {
    return [
      {
        id: "orders-open",
        label: "Open Orders",
        expression: "status IN ('Pending', 'Processing', 'Shipped')",
        icon: "clock",
        description: "Orders not yet completed or cancelled",
      },
      {
        id: "orders-today",
        label: "Today",
        expression: "order_date >= CURRENT_DATE",
        icon: "calendar",
        description: "Orders placed today",
      },
      {
        id: "orders-high-value",
        label: "High Value",
        expression: "total_amount > 500",
        icon: "dollar",
        description: "Orders over $500",
      },
      {
        id: "orders-pending",
        label: "Pending",
        expression: "status = 'Pending'",
        icon: "alert",
        description: "Orders awaiting processing",
      },
    ];
  }

  if (name === "customers" || name === "customer") {
    return [
      {
        id: "cust-active",
        label: "Active",
        expression: "status = 'Active' OR status IS NULL",
        icon: "check",
        description: "Active customers",
      },
      {
        id: "cust-recent",
        label: "Recent",
        expression: "created_date >= CURRENT_DATE - INTERVAL '30 days'",
        icon: "clock",
        description: "Customers created in the last 30 days",
      },
      {
        id: "cust-high-balance",
        label: "High Balance",
        expression: "balance > 1000",
        icon: "dollar",
        description: "Customers with balance over $1,000",
      },
    ];
  }

  if (name === "products" || name === "product" || name === "inventory") {
    return [
      {
        id: "prod-active",
        label: "Active",
        expression: "discontinued IS DISTINCT FROM true",
        icon: "check",
        description: "Active products",
      },
      {
        id: "prod-low-stock",
        label: "Low Stock",
        expression: "quantity_on_hand <= reorder_level AND quantity_on_hand > 0",
        icon: "alert",
        description: "Products below reorder threshold",
      },
      {
        id: "prod-out-of-stock",
        label: "Out of Stock",
        expression: "quantity_on_hand = 0 OR quantity_on_hand IS NULL",
        icon: "archive",
        description: "Products with no inventory",
      },
    ];
  }

  // Generic presets for any table
  return [
    {
      id: "recently-created",
      label: "Recently Created",
      expression: "created_date >= CURRENT_DATE - INTERVAL '7 days'",
      icon: "clock",
      description: "Records created in the last 7 days",
    },
  ];
}

// ─── Table Data Browser ──────────────────────────────

function TableBrowser({ table }: { table: string }) {
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; total: number } | null>(null);
  const {
    filters,
    activeFilters,
    hasActiveFilters,
    filterLogic,
    setFilterLogic,
    addFilter,
    removeFilter,
    toggleFilter,
    setFilterActive,
    clearFilters,
    updateFilter,
    setFilters,
    combinedFilter,
  } = useFilters();

  // Sync filter state to/from URL
  useFilterUrlSync(filters, setFilters, filterLogic, setFilterLogic);

  const presets = useMemo(() => getTablePresets(table), [table]);

  useEffect(() => {
    const params = new URLSearchParams({ limit: "50" });
    if (combinedFilter) {
      params.set("filter", combinedFilter);
    }
    fetch(`/api/data/${encodeURIComponent(table)}?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [table, combinedFilter]);

  if (!data) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b text-sm font-medium bg-muted/30 flex items-center gap-2">
        <Table2 className="h-4 w-4" />
        {table}
        <span className="text-xs text-muted-foreground">
          ({data.total} rows{hasActiveFilters ? ", filtered" : ""})
        </span>
      </div>

      {/* Quick filter preset buttons */}
      <QuickFilterBar
        presets={presets}
        filters={filters}
        addFilter={addFilter}
        removeFilter={removeFilter}
      />

      {/* Filter panel */}
      <FilterPanel
        filters={filters}
        activeFilters={activeFilters}
        hasActiveFilters={hasActiveFilters}
        filterLogic={filterLogic}
        setFilterLogic={setFilterLogic}
        addFilter={addFilter}
        removeFilter={removeFilter}
        toggleFilter={toggleFilter}
        setFilterActive={setFilterActive}
        clearFilters={clearFilters}
        updateFilter={updateFilter}
        setFilters={setFilters}
      />

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              {data.rows[0] &&
                Object.keys(data.rows[0]).map((col) => (
                  <th
                    key={col}
                    className="text-left px-2 py-1 font-medium border-b whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i} className="hover:bg-muted/20">
                {Object.values(row).map((val, j) => (
                  <td key={j} className="px-2 py-0.5 border-b border-muted truncate max-w-[200px]">
                    {val === null ? (
                      <span className="text-muted-foreground italic">null</span>
                    ) : (
                      String(val)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────

export default function App() {
  const [tree, setTree] = useState<NavTreeNode[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statusBadges, setStatusBadges] = useState<Record<string, { key: string; label: string; count: number; severity: string }[]>>({});
  const [active, setActive] = useState<ActiveView>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [draft, setDraft] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const win = useFormWindowManager();
  const { headers, currentUser, setUserId, availableUsers } = useUser();
  const { isAdmin } = usePermissions();

  // Derive flat nav item lists from tree for old consumers
  const navData = useMemo(() => extractNavItems(tree), [tree]);

  useEffect(() => {
    fetch("/api/nav/tree?visible_only=true&company_id=1", { headers })
      .then((r) => r.json())
      .then(setTree)
      .catch(() => setTree([]));
  }, [headers]);

  // Fetch live record counts for nav tree badges
  useEffect(() => {
    fetch("/api/nav/tree/counts?company_id=1", { headers })
      .then((r) => r.json())
      .then(setCounts)
      .catch(() => setCounts({}));
  }, [headers]);

  // Fetch status badges (pending orders, low stock indicators, etc.)
  useEffect(() => {
    fetch("/api/nav/tree/status-badges?company_id=1", { headers })
      .then((r) => r.json())
      .then(setStatusBadges)
      .catch(() => setStatusBadges({}));
  }, [headers]);

  // Load saved appearance settings
  useEffect(() => {
    fetch("/api/settings/appearance")
      .then((r) => r.json())
      .then((data) => {
        if (data && Object.keys(data).length > 0) {
          const merged = { ...DEFAULT_APPEARANCE, ...data };
          setAppearance(merged);
          setDraft(merged);
        }
      })
      .catch(() => {});
  }, []);

  // Apply appearance as CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-field-font-size", appearance.fieldFontSize);
    root.style.setProperty("--app-field-font-color", appearance.fieldFontColor);
    root.style.setProperty("--app-field-font-family", appearance.fieldFontFamily);
    root.style.setProperty("--app-field-bg-color", appearance.fieldBackgroundColor);
    root.style.setProperty("--app-field-border-radius", appearance.fieldBorderRadius);
    root.style.setProperty("--app-label-font-size", appearance.labelFontSize);
    root.style.setProperty("--app-label-font-color", appearance.labelFontColor);
    root.style.setProperty("--app-label-font-family", appearance.labelFontFamily);
    root.style.setProperty("--app-form-bg-color", appearance.formBackgroundColor);
    root.style.setProperty("--app-form-header-bg", appearance.formHeaderBackgroundColor);
    root.style.setProperty("--app-form-header-color", appearance.formHeaderFontColor);
    root.style.setProperty("--app-form-header-resizable", appearance.formHeaderResizable ? "true" : "false");
    root.style.setProperty("--app-form-footer-bg", appearance.formFooterBackgroundColor);
    root.style.setProperty("--app-form-footer-color", appearance.formFooterFontColor);
    root.style.setProperty("--app-form-footer-resizable", appearance.formFooterResizable ? "true" : "false");
  }, [appearance]);

  const handleSelect = useCallback(
    (v: ActiveView) => {
      setActive(v);
      if (v?.type === "form") {
        // Load saved window size from API and open with it
        fetch(`/api/settings/form-size/${encodeURIComponent(v.name)}`)
          .then((r) => r.json())
          .then((data) => {
            const savedSize = data.windowWidth && data.windowHeight
              ? { width: data.windowWidth, height: data.windowHeight }
              : undefined;
            win.openWindow(v.name, savedSize);
          })
          .catch(() => win.openWindow(v.name));
      }
    },
    [win]
  );

  const openSettings = useCallback(() => {
    setDraft({ ...appearance });
    setSettingsOpen(true);
  }, [appearance]);

  const saveSettings = useCallback(async () => {
    setAppearance({ ...draft });
    try {
      await fetch("/api/settings/appearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    } catch {}
    setSettingsOpen(false);
  }, [draft]);

  const cancelSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const resetSettings = useCallback(() => {
    setDraft({ ...DEFAULT_APPEARANCE });
  }, []);

  const refreshTree = useCallback(() => {
    fetch("/api/nav/tree?visible_only=true&company_id=1", { headers })
      .then((r) => r.json())
      .then(setTree)
      .catch(() => setTree([]));
  }, [headers]);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r bg-muted/20">
        <SidebarTree
          tree={tree}
          active={active}
          onSelect={handleSelect}
          onOpenSettings={openSettings}
          settingsOpen={settingsOpen}
          counts={counts}
          statusBadges={statusBadges}
          isAdmin={isAdmin}
          headers={headers}
          onRefreshTree={refreshTree}
        />
        {/* User switcher */}
        <div className="shrink-0 border-t px-2 py-1.5 flex items-center gap-2 bg-muted/10">
          <select
            value={currentUser.userId}
            onChange={(e) => setUserId(Number(e.target.value))}
            className="h-6 text-[10px] border rounded px-1 bg-background flex-1 min-w-0"
            title="Switch user to test role-based nav visibility"
          >
            {availableUsers.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild className="md:hidden absolute top-2 left-2 z-50">
          <span className="p-1 cursor-pointer">
            <Menu className="h-5 w-5" />
          </span>
        </SheetTrigger>
        <SheetContent side="left" className="w-56 p-0 flex flex-col">
          <SidebarTree
            tree={tree}
            active={active}
            onSelect={handleSelect}
            onOpenSettings={openSettings}
            settingsOpen={settingsOpen}
            counts={counts}
            statusBadges={statusBadges}
            isAdmin={isAdmin}
            headers={headers}
            onRefreshTree={refreshTree}
          />
          {/* Mobile user switcher */}
          <div className="shrink-0 border-t px-2 py-1.5 flex items-center gap-2 bg-muted/10">
            <select
              value={currentUser.userId}
              onChange={(e) => setUserId(Number(e.target.value))}
              className="h-6 text-[10px] border rounded px-1 bg-background flex-1 min-w-0"
              title="Switch user to test role-based nav visibility"
            >
              {availableUsers.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings panel */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-[480px] max-w-[100vw] p-0 flex flex-col">
          <SheetTitle className="sr-only">Settings</SheetTitle>
          <SheetDescription className="sr-only">Appearance settings for Roastery ERP</SheetDescription>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4" />
              Settings
            </div>
            <button onClick={cancelSettings} className="p-1 rounded hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            <p className="text-[10px] text-muted-foreground">
              These appearance settings apply to all forms and users.
            </p>

            {/* Fields */}
            <SettingRow icon={Type} label="Fields">
              <SelectField label="Font Size" value={draft.fieldFontSize} options={FONT_SIZES} onChange={(v) => setDraft({ ...draft, fieldFontSize: v })} />
              <ColorField label="Font Color" value={draft.fieldFontColor} onChange={(v) => setDraft({ ...draft, fieldFontColor: v })} />
              <SelectField label="Font Family" value={draft.fieldFontFamily} options={FONT_FAMILIES} onChange={(v) => setDraft({ ...draft, fieldFontFamily: v })} />
              <ColorField label="BG Color" value={draft.fieldBackgroundColor} onChange={(v) => setDraft({ ...draft, fieldBackgroundColor: v })} />
              <SelectField label="Corner Radius" value={draft.fieldBorderRadius} options={["0px", "2px", "4px", "6px", "8px", "12px"]} onChange={(v) => setDraft({ ...draft, fieldBorderRadius: v })} />
            </SettingRow>

            <Separator />

            {/* Labels */}
            <SettingRow icon={Paintbrush} label="Labels">
              <SelectField label="Font Size" value={draft.labelFontSize} options={FONT_SIZES} onChange={(v) => setDraft({ ...draft, labelFontSize: v })} />
              <ColorField label="Font Color" value={draft.labelFontColor} onChange={(v) => setDraft({ ...draft, labelFontColor: v })} />
              <SelectField label="Font Family" value={draft.labelFontFamily} options={FONT_FAMILIES} onChange={(v) => setDraft({ ...draft, labelFontFamily: v })} />
            </SettingRow>

            <Separator />

            {/* Form */}
            <SettingRow icon={Square} label="Form">
              <ColorField label="BG Color" value={draft.formBackgroundColor} onChange={(v) => setDraft({ ...draft, formBackgroundColor: v })} />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-20 shrink-0">Resizable</Label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.formResizable}
                    onChange={(e) => setDraft({ ...draft, formResizable: e.target.checked })}
                    className="toggle"
                  />
                  {draft.formResizable ? "On" : "Off"}
                </label>
              </div>
            </SettingRow>

            <Separator />

            {/* Form Header */}
            <SettingRow icon={PanelTop} label="Form Header">
              <ColorField label="BG Color" value={draft.formHeaderBackgroundColor} onChange={(v) => setDraft({ ...draft, formHeaderBackgroundColor: v })} />
              <ColorField label="Font Color" value={draft.formHeaderFontColor} onChange={(v) => setDraft({ ...draft, formHeaderFontColor: v })} />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-20 shrink-0">Resizable</Label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.formHeaderResizable}
                    onChange={(e) => setDraft({ ...draft, formHeaderResizable: e.target.checked })}
                    className="toggle"
                  />
                  {draft.formHeaderResizable ? "On" : "Off"}
                </label>
              </div>
            </SettingRow>

            <Separator />

            {/* Form Footer */}
            <SettingRow icon={PanelTop} label="Form Footer">
              <ColorField label="BG Color" value={draft.formFooterBackgroundColor} onChange={(v) => setDraft({ ...draft, formFooterBackgroundColor: v })} />
              <ColorField label="Font Color" value={draft.formFooterFontColor} onChange={(v) => setDraft({ ...draft, formFooterFontColor: v })} />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-20 shrink-0">Resizable</Label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.formFooterResizable}
                    onChange={(e) => setDraft({ ...draft, formFooterResizable: e.target.checked })}
                    className="toggle"
                  />
                  {draft.formFooterResizable ? "On" : "Off"}
                </label>
              </div>
            </SettingRow>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={resetSettings}>
              Reset
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={cancelSettings}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveSettings}>
                Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {active?.type === "table" && (
          <TableBrowser table={active.name} />
        )}
        {active?.type === "report" && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Report viewer: {active.name}</p>
          </div>
        )}
        {active?.type === "form" && (
          <FormWorkspace>
            {win.windows.map((w) => (
              <FormWindow
                key={w.id}
                id={w.id}
                title={w.id}
                state={w.state}
                zIndex={w.zIndex}
                defaultPosition={w.normalPosition}
                defaultSize={w.normalSize}
                onClose={win.closeWindow}
                onFocus={win.bringToFront}
                onStateChange={win.updateState}
                onPositionChange={win.updatePosition}
                onSizeChange={(id, size) => {
                  win.updateSize(id, size);
                  // Persist window size — merge with existing saved data
                  fetch(`/api/settings/form-size/${encodeURIComponent(id)}`)
                    .then((r) => r.json())
                    .then((existing) => {
                      const merged = { ...existing, windowWidth: size.width, windowHeight: size.height };
                      fetch(`/api/settings/form-size/${encodeURIComponent(id)}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(merged),
                      });
                    })
                    .catch(() => {});
                }}
              >
                <ErrorBoundary>
                  <EventProvider>
                    <FormRenderer formName={w.id} />
                  </EventProvider>
                </ErrorBoundary>
              </FormWindow>
            ))}
          </FormWorkspace>
        )}
        {active?.type === "events" && (
          <EventHandlerEditorPage onBack={() => setActive(null)} />
        )}
        {active?.type === "permissions" && (
          <Tabs defaultValue="roles" className="h-full flex flex-col">
            <div className="px-4 py-2 border-b shrink-0">
              <TabsList variant="line">
                <TabsTrigger value="roles">Roles & Users</TabsTrigger>
                <TabsTrigger value="matrix">Field Permissions</TabsTrigger>
                <TabsTrigger value="row-filters">Row Filters</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="roles" className="flex-1 overflow-hidden m-0">
              <RoleManager />
            </TabsContent>
            <TabsContent value="matrix" className="flex-1 overflow-hidden m-0">
              <PermissionMatrix />
            </TabsContent>
            <TabsContent value="row-filters" className="flex-1 overflow-hidden m-0">
              <RowFilterEditor />
            </TabsContent>
          </Tabs>
        )}
        {active?.type === "calculated-fields" && (
          <CalculatedFieldsAdmin tables={navData.tables.map(t => t.name)} />
        )}
        {active?.type === "audit-log" && (
          <AuditLogPage tables={navData.tables.map(t => t.name)} />
        )}
        {active?.type === "metadata" && (
          <MetadataManager />
        )}
        {!active && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center space-y-2">
              <p className="text-2xl mb-1">☕</p>
              <p className="text-lg font-semibold">Roastery ERP</p>
              <p className="text-sm">
                {navData.tables.length} tables · {navData.forms.length} forms ·{" "}
                {navData.reports.length} reports
              </p>
              <p className="text-xs text-muted-foreground/60">
                Select an item from the sidebar
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}