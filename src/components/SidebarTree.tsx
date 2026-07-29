// SidebarTree — renders the navigation sidebar from the nav_tree API
import { useState, useMemo, useCallback } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Table2,
  Layout,
  FileText,
  Settings,
  Code,
  Shield,
  FunctionSquare,
  List,
  Menu,
  type LucideIcon,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

interface NavTreeNode {
  id: number;
  parent_id: number | null;
  label: string;
  icon: string | null;
  target_type: string;
  target_name: string | null;
  target_params: Record<string, unknown> | null;
  sort_order: number;
  is_visible: boolean;
  is_expanded: boolean;
  color: string | null;
  badge: string | null;
  depth: number;
  path: string[];
}

type ActiveView =
  | { type: "table"; name: string }
  | { type: "form"; name: string }
  | { type: "report"; name: string }
  | { type: "events" }
  | { type: "permissions" }
  | { type: "calculated-fields" }
  | { type: "audit-log" }
  | null;

interface SidebarTreeProps {
  tree: NavTreeNode[];
  active: ActiveView;
  onSelect: (view: ActiveView) => void;
  onOpenSettings: () => void;
  settingsOpen: boolean;
}

// ─── Icon resolver ─────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Table2,
  Layout,
  FileText,
  Settings,
  Code,
  Shield,
  FunctionSquare,
  List,
  Menu,
};

function resolveIcon(iconName: string | null, fallback: LucideIcon = Table2): LucideIcon {
  if (!iconName) return fallback;
  return ICON_MAP[iconName] || fallback;
}

// ─── Tree node renderer ─────────────────────────────────

interface TreeNode extends NavTreeNode {
  children: TreeNode[];
}

function buildTree(nodes: NavTreeNode[]): TreeNode[] {
  // Group children by parent_id, preserving the sort_order from the flat list
  const childrenByParent = new Map<number | null, NavTreeNode[]>();
  for (const node of nodes) {
    const key = node.parent_id;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(node);
  }

  // Sort each group by sort_order (already in path order from the DB, but be safe)
  for (const [, children] of childrenByParent) {
    children.sort((a, b) => a.sort_order - b.sort_order);
  }

  function build(parentId: number | null): TreeNode[] {
    return (childrenByParent.get(parentId) || []).map((n) => ({
      ...n,
      children: build(n.id),
    }));
  }

  return build(null);
}

// ─── TreeNodeRow — single clickable leaf item ──────────

function TreeNodeRow({
  node,
  active,
  onSelect,
  depth,
}: {
  node: TreeNode;
  active: ActiveView;
  onSelect: (v: ActiveView) => void;
  depth: number;
}) {
  const Icon = resolveIcon(node.icon);

  const isActive =
    node.target_type === "table" || node.target_type === "form" || node.target_type === "report"
      ? active?.type === node.target_type && active?.name === node.target_name
      : node.target_type === "link" && active?.type === node.target_name;

  const handleClick = useCallback(() => {
    if (node.target_type === "table" || node.target_type === "form" || node.target_type === "report") {
      onSelect({ type: node.target_type, name: node.target_name! });
    } else if (node.target_type === "link") {
      onSelect({ type: node.target_name as "events" | "permissions" | "calculated-fields" | "audit-log" });
    }
  }, [node, onSelect]);

  const padLeft = depth > 0 ? 4 + depth * 8 : 8;

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left flex items-center gap-2 py-1 text-xs transition-colors",
        isActive
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/50"
      )}
      style={{ paddingLeft: padLeft, paddingRight: 8 }}
    >
      {Icon && node.target_type !== "divider" && (
        <Icon
          className="h-3.5 w-3.5 shrink-0"
          style={node.color ? { color: node.color } : undefined}
        />
      )}
      <span className="truncate">{node.label}</span>
      {node.badge && (
        <span className="ml-auto text-[10px] px-1 py-0.5 rounded bg-muted-foreground/10 text-muted-foreground tabular-nums">
          {node.badge}
        </span>
      )}
    </button>
  );
}

// ─── NavGroup — collapsible group node ──────────────────

function NavGroup({
  node,
  active,
  onSelect,
  defaultOpen,
}: {
  node: TreeNode;
  active: ActiveView;
  onSelect: (v: ActiveView) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = resolveIcon(node.icon);

  const leafCount = useMemo(() => {
    let count = 0;
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.target_type !== "group") count++;
        walk(n.children);
      }
    }
    walk(node.children);
    return count;
  }, [node.children]);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span>{node.label}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
          {leafCount}
        </span>
      </button>
      {open && (
        <div className="pb-0.5">
          {node.children.map((child) => {
            if (child.target_type === "divider") {
              return <Separator key={child.id} className="my-1 mx-3" />;
            }
            if (child.target_type === "group") {
              return (
                <NavGroup
                  key={child.id}
                  node={child}
                  active={active}
                  onSelect={onSelect}
                  defaultOpen={child.is_expanded ?? false}
                />
              );
            }
            return (
              <TreeNodeRow
                key={child.id}
                node={child}
                active={active}
                onSelect={onSelect}
                depth={(child.depth ?? 1) - 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── SidebarTree ────────────────────────────────────────

export default function SidebarTree({
  tree,
  active,
  onSelect,
  onOpenSettings,
  settingsOpen,
}: SidebarTreeProps) {
  const rootNodes = useMemo(() => buildTree(tree), [tree]);

  return (
    <div className="flex flex-col h-full">
      {/* Fixed header */}
      <div className="p-3 font-semibold text-sm border-b shrink-0">☕ Roastery ERP</div>

      {/* Scrollable nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto py-1">
        {rootNodes.map((node) => {
          if (node.target_type === "divider") {
            return <Separator key={node.id} className="my-1" />;
          }
          if (node.target_type === "group") {
            return (
              <NavGroup
                key={node.id}
                node={node}
                active={active}
                onSelect={onSelect}
                defaultOpen={node.is_expanded ?? false}
              />
            );
          }
          return (
            <TreeNodeRow
              key={node.id}
              node={node}
              active={active}
              onSelect={onSelect}
              depth={0}
            />
          );
        })}
      </nav>

      {/* Fixed footer */}
      <Separator />
      <div className="shrink-0 border-t bg-muted/10">
        <button
          onClick={onOpenSettings}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors",
            settingsOpen
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </button>
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
          Francesco's Coffee Co.
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────

/** Extract flat table/form/report item lists from nav tree data */
export function extractNavItems(tree: NavTreeNode[]) {
  const tables: { name: string; label: string }[] = [];
  const forms: { name: string; label: string }[] = [];
  const reports: { name: string; label: string }[] = [];

  for (const node of tree) {
    if (node.target_type === "table") tables.push({ name: node.target_name ?? node.label, label: node.label });
    else if (node.target_type === "form") forms.push({ name: node.target_name ?? node.label, label: node.label });
    else if (node.target_type === "report") reports.push({ name: node.target_name ?? node.label, label: node.label });
  }

  return { tables, forms, reports };
}

export type { NavTreeNode, ActiveView };
