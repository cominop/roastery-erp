// App shell — categorized sidebar: Tables · Forms · Reports
import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Menu,
  ChevronDown,
  ChevronRight,
  Table2,
  Layout,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import FormRenderer from "@/components/FormRenderer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import FormWorkspace from "@/components/form-window/form-workspace";
import FormWindow from "@/components/form-window/form-window";
import { useFormWindowManager } from "@/components/form-window/use-form-window-manager";

interface NavItem {
  name: string;
  label: string;
}

interface NavData {
  tables: NavItem[];
  forms: NavItem[];
  reports: NavItem[];
}

type ActiveView =
  | { type: "table"; name: string }
  | { type: "form"; name: string }
  | { type: "report"; name: string }
  | null;

// ─── Collapsible section ──────────────────────────────

function NavSection({
  title,
  icon: Icon,
  items,
  active,
  onSelect,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  active: ActiveView;
  onSelect: (v: ActiveView) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Icon className="h-3 w-3" />
        {title}
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {items.length}
        </span>
      </button>
      {open && (
        <div key={`${title}-items`} className="pb-0.5">
          {items.map((item) => {
            const isActive =
              active?.name === item.name &&
              active?.type === title.toLowerCase().slice(0, -1);
            return (
              <button
                key={item.name}
                className={cn(
                  "w-full text-left pl-8 pr-2 py-1 text-xs transition-colors",
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
                onClick={() => {
                  const type = title.toLowerCase().slice(0, -1) as NonNullable<ActiveView>["type"];
                  onSelect({ type, name: item.name });
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Table Data Browser (simple) ──────────────────────

function TableBrowser({ table }: { table: string }) {
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; total: number } | null>(null);

  useEffect(() => {
    fetch(`/api/data/${table}?limit=50`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [table]);

  if (!data) return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b text-sm font-medium bg-muted/30 flex items-center gap-2">
        <Table2 className="h-4 w-4" />
        {table}
        <span className="text-xs text-muted-foreground">
          ({data.total} rows)
        </span>
      </div>
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
  const [nav, setNav] = useState<NavData>({ tables: [], forms: [], reports: [] });
  const [active, setActive] = useState<ActiveView>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const win = useFormWindowManager();

  useEffect(() => {
    fetch("/api/nav")
      .then((r) => r.json())
      .then(setNav)
      .catch(() => setNav({ tables: [], forms: [], reports: [] }));
  }, []);

  // When a nav item is clicked, open forms in windows and tables/reports inline
  const handleSelect = useCallback(
    (v: ActiveView) => {
      setActive(v);
      if (v?.type === "form") {
        win.openWindow(v.name);
      }
    },
    [win]
  );

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-3 font-semibold text-sm border-b">☕ Roastery ERP</div>
      <nav className="flex-1 overflow-auto py-1">
        <NavSection
          key="tables"
          title="Tables"
          icon={Table2}
          items={nav.tables}
          active={active}
          onSelect={handleSelect}
          defaultOpen
        />
        <Separator className="my-1" />
        <NavSection
          key="forms"
          title="Forms"
          icon={Layout}
          items={nav.forms}
          active={active}
          onSelect={handleSelect}
        />
        <Separator className="my-1" />
        <NavSection
          key="reports"
          title="Reports"
          icon={FileText}
          items={nav.reports}
          active={active}
          onSelect={handleSelect}
        />
      </nav>
      <Separator />
      <div className="p-2 text-[10px] text-muted-foreground">
        Francesco's Coffee Co.
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r bg-muted/20">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild className="md:hidden absolute top-2 left-2 z-50">
          <span className="p-1 cursor-pointer">
            <Menu className="h-5 w-5" />
          </span>
        </SheetTrigger>
        <SheetContent side="left" className="w-56 p-0">
          {sidebar}
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
                onSizeChange={win.updateSize}
              >
                <ErrorBoundary>
                  <FormRenderer formName={w.id} />
                </ErrorBoundary>
              </FormWindow>
            ))}
          </FormWorkspace>
        )}
        {!active && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center space-y-2">
              <p className="text-2xl mb-1">☕</p>
              <p className="text-lg font-semibold">Roastery ERP</p>
              <p className="text-sm">
                {nav.tables.length} tables · {nav.forms.length} forms ·{" "}
                {nav.reports.length} reports
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
