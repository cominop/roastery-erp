// SidebarTree — renders the navigation sidebar from the nav_tree API
// Step 63: Collapsible groups + fuzzy search
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
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
  Search,
  X,
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

// ─── Fuzzy match ──────────────────────────────────────────

/** Character-by-character in-order fuzzy match (case-insensitive) */
function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ─── Highlighted label ────────────────────────────────────

function HighlightedLabel({ text, query }: { text: string; query: string }) {
  if (!query) return <span className="truncate">{text}</span>;

  const lower = text.toLowerCase();
  const q = query.toLowerCase();

  // Find positions of fuzzy-matched characters
  const positions: number[] = [];
  let qi = 0;
  for (let ti = 0; ti < lower.length && qi < q.length; ti++) {
    if (lower[ti] === q[qi]) {
      positions.push(ti);
      qi++;
    }
  }

  if (positions.length === 0 || positions.length < q.length) {
    return <span className="truncate">{text}</span>;
  }

  // Build segments
  const segments: { start: number; end: number; highlighted: boolean }[] = [];
  let lastEnd = 0;
  for (const pos of positions) {
    if (pos > lastEnd) {
      segments.push({ start: lastEnd, end: pos, highlighted: false });
    }
    segments.push({ start: pos, end: pos + 1, highlighted: true });
    lastEnd = pos + 1;
  }
  if (lastEnd < text.length) {
    segments.push({ start: lastEnd, end: text.length, highlighted: false });
  }

  return (
    <span className="truncate">
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <mark
            key={i}
            className="bg-yellow-200 dark:bg-yellow-700 rounded-sm px-0.5"
          >
            {text.slice(seg.start, seg.end)}
          </mark>
        ) : (
          <span key={i}>{text.slice(seg.start, seg.end)}</span>
        )
      )}
    </span>
  );
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
  const childrenByParent = new Map<number | null, NavTreeNode[]>();
  for (const node of nodes) {
    const key = node.parent_id;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(node);
  }

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

// ─── Filter tree by search query ──────────────────────────

/**
 * Returns only nodes (and their ancestors) where any descendant leaf
 * or the node itself matches the fuzzy query. Groups with no matches
 * are pruned.
 */
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes;

  function matches(node: TreeNode): boolean {
    // Does this node's label match?
    if (fuzzyMatch(query, node.label)) return true;
    // Does any child match?
    for (const child of node.children) {
      if (matches(child)) return true;
    }
    return false;
  }

  function prune(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
      if (matches(node)) {
        result.push({
          ...node,
          children: prune(node.children),
        });
      }
    }
    return result;
  }

  return prune(nodes);
}

// ─── TreeNodeRow — single clickable leaf item ──────────

function TreeNodeRow({
  node,
  active,
  onSelect,
  depth,
  searchQuery,
}: {
  node: TreeNode;
  active: ActiveView;
  onSelect: (v: ActiveView) => void;
  depth: number;
  searchQuery: string;
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
      <HighlightedLabel text={node.label} query={searchQuery} />
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
  searchQuery,
}: {
  node: TreeNode;
  active: ActiveView;
  onSelect: (v: ActiveView) => void;
  defaultOpen: boolean;
  searchQuery: string;
}) {
  // When a search is active, force groups open; otherwise use user toggle state
  const [userOpen, setUserOpen] = useState(defaultOpen);
  const isSearching = searchQuery.length > 0;
  const open = isSearching ? true : userOpen;

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
        onClick={() => {
          if (!isSearching) setUserOpen(!userOpen);
        }}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <HighlightedLabel text={node.label} query={searchQuery} />
        {!isSearching && (
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
            {leafCount}
          </span>
        )}
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
                  searchQuery={searchQuery}
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
                searchQuery={searchQuery}
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
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const rootNodes = useMemo(() => buildTree(tree), [tree]);
  const filteredNodes = useMemo(
    () => filterTree(rootNodes, searchQuery),
    [rootNodes, searchQuery]
  );

  const hasResults = filteredNodes.length > 0;

  // Keyboard shortcut: focus search on Ctrl+/ or "/" key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+/ or Cmd+/ toggles focus
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        if (searchRef.current) {
          if (document.activeElement === searchRef.current) {
            searchRef.current.blur();
          } else {
            searchRef.current.focus();
          }
        }
        return;
      }
      // "/" key when not in an input focuses search
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleClear = useCallback(() => {
    setSearchQuery("");
    searchRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Fixed header */}
      <div className="p-3 font-semibold text-sm border-b shrink-0">
        ☕ Roastery ERP
      </div>

      {/* Search input */}
      <div className="px-2 py-1.5 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchRef}
            type="text"
            placeholder="Search nav…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 pr-7 text-xs"
          />
          {searchQuery && (
            <button
              onClick={handleClear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
              tabIndex={-1}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto py-1">
        {searchQuery && !hasResults && (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            <Search className="h-5 w-5 mx-auto mb-2 opacity-40" />
            <p>No results for "{searchQuery}"</p>
            <p className="mt-1 text-[10px] opacity-60">
              Try a different search term
            </p>
          </div>
        )}
        {hasResults &&
          filteredNodes.map((node) => {
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
                  searchQuery={searchQuery}
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
                searchQuery={searchQuery}
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
