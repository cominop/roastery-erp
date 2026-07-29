// NavEditorPanel — admin-only nav tree editor (add/remove/reorder nodes)
// Step 67: Admin panel for editing the navigation tree structure
// Step 68: Regenerate from DB button — auto-generates tree from DB schema
// Step 69: Drag-to-reorder in editor — drag nodes to reorder siblings
import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  X,
  Table2,
  Layout,
  FileText,
  List,
  Menu,
  Settings,
  Code,
  Shield,
  FunctionSquare,
  AlertTriangle,
  Check,
  RotateCcw,
  GripVertical,
} from "lucide-react";
import type { NavTreeNode } from "./SidebarTree";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ───────────────────────────────────────────────

interface TreeNode extends NavTreeNode {
  children: TreeNode[];
}

interface NavEditorPanelProps {
  tree: NavTreeNode[];
  onClose: () => void;
  onRefresh: () => void;
  headers: Record<string, string>;
}

// ─── Icon resolver ─────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Table2, Layout, FileText, List, Menu, Settings, Code, Shield, FunctionSquare,
};

function resolveIcon(iconName: string | null): React.ComponentType<{ className?: string }> | null {
  if (!iconName) return null;
  return ICON_MAP[iconName] || null;
}

// ─── Target type display labels ────────────────────────

const TYPE_LABELS: Record<string, string> = {
  group: "Group",
  table: "Table",
  form: "Form",
  report: "Report",
  link: "Link",
  divider: "Divider",
};

const TYPE_COLORS: Record<string, string> = {
  group: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  table: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  form: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  report: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  link: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  divider: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

// ─── Build tree from flat list ──────────────────────────

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

// ─── Flatten tree with depth info for display ──────────

interface FlatItem {
  node: TreeNode;
  depth: number;
  hasChildren: boolean;
  isLastChild: boolean;
  parentId: number | null;
}

function flattenTree(nodes: TreeNode[], depth = 0, parentId: number | null = null): FlatItem[] {
  const result: FlatItem[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    result.push({
      node,
      depth,
      hasChildren: node.children.length > 0,
      isLastChild: i === nodes.length - 1,
      parentId,
    });
    result.push(...flattenTree(node.children, depth + 1, node.id));
  }
  return result;
}

// ─── Add node form ─────────────────────────────────────

interface AddNodeFormProps {
  tree: TreeNode[];
  onAdd: (data: {
    parent_id: number | null;
    label: string;
    target_type: string;
    target_name: string | null;
    icon: string | null;
    is_visible: boolean;
    is_expanded: boolean;
    badge: string | null;
    color: string | null;
  }) => void;
  onCancel: () => void;
  submitting: boolean;
}

// Flat list of all nodes for parent dropdown
function getParentOptions(nodes: TreeNode[]): { id: number | null; label: string; depth: number }[] {
  const result: { id: number | null; label: string; depth: number }[] = [
    { id: null, label: "(root — top-level)", depth: 0 },
  ];
  function walk(items: TreeNode[], depth: number) {
    for (const item of items) {
      result.push({ id: item.id, label: item.label, depth });
      walk(item.children, depth + 1);
    }
  }
  walk(nodes, 0);
  return result;
}

function AddNodeForm({ tree, onAdd, onCancel, submitting }: AddNodeFormProps) {
  const [parentId, setParentId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [targetType, setTargetType] = useState("group");
  const [targetName, setTargetName] = useState("");
  const [icon, setIcon] = useState("");

  const parentOptions = useMemo(() => getParentOptions(tree), [tree]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!label.trim()) return;
      onAdd({
        parent_id: parentId,
        label: label.trim(),
        target_type: targetType,
        target_name: targetType === "table" || targetType === "form" || targetType === "report" ? targetName.trim() || null : null,
        icon: icon.trim() || null,
        is_visible: true,
        is_expanded: targetType === "group",
        badge: null,
        color: null,
      });
    },
    [parentId, label, targetType, targetName, icon, onAdd]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 p-3 border rounded-md bg-muted/20">
      <div className="text-[11px] font-semibold text-foreground">Add New Node</div>

      {/* Label */}
      <div>
        <label className="text-[10px] text-muted-foreground block mb-0.5">Label *</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full h-7 text-xs border rounded px-2 bg-background"
          placeholder="Node label"
          autoFocus
          required
        />
      </div>

      {/* Target type */}
      <div>
        <label className="text-[10px] text-muted-foreground block mb-0.5">Type</label>
        <select
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
          className="w-full h-7 text-xs border rounded px-2 bg-background"
        >
          <option value="group">Group</option>
          <option value="table">Table</option>
          <option value="form">Form</option>
          <option value="report">Report</option>
          <option value="link">Link</option>
          <option value="divider">Divider</option>
        </select>
      </div>

      {/* Target name (for table/form/report only) */}
      {(targetType === "table" || targetType === "form" || targetType === "report") && (
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Target Name</label>
          <input
            type="text"
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            className="w-full h-7 text-xs border rounded px-2 bg-background"
            placeholder="e.g. orders, customers"
          />
        </div>
      )}

      {/* Icon (optional) */}
      <div>
        <label className="text-[10px] text-muted-foreground block mb-0.5">Icon (optional)</label>
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="w-full h-7 text-xs border rounded px-2 bg-background"
          placeholder="e.g. Table2, Layout, FileText"
        />
      </div>

      {/* Parent */}
      <div>
        <label className="text-[10px] text-muted-foreground block mb-0.5">Parent</label>
        <select
          value={parentId ?? ""}
          onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
          className="w-full h-7 text-xs border rounded px-2 bg-background"
        >
          {parentOptions.map((opt) => (
            <option key={String(opt.id)} value={opt.id ?? ""}>
              {"  ".repeat(opt.depth)}{opt.depth > 0 ? "↳ " : ""}{opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!label.trim() || submitting}
          className="h-7 px-3 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Adding..." : "Add Node"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Confirm dialog ────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  loading,
  confirmLabel = "Delete",
  loadingLabel = "Deleting...",
  variant = "danger",
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  confirmLabel?: string;
  loadingLabel?: string;
  variant?: "danger" | "default";
}) {
  const btnClass = variant === "danger"
    ? "bg-red-600 text-white hover:bg-red-700"
    : "bg-primary text-primary-foreground hover:bg-primary/90";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border rounded-lg shadow-lg p-4 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-3 flex-1">
            <p className="text-sm text-foreground">{message}</p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={onCancel}
                className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`h-7 px-3 text-xs font-medium rounded disabled:opacity-50 transition-colors ${btnClass}`}
              >
                {loading ? loadingLabel : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable node editor row ──────────────────────────

function SortableNodeEditorRow({
  item,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  item: FlatItem;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: String(item.node.id),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-1 px-1 py-1 text-xs border-b border-muted/20 group",
        isDragging && "opacity-40 z-10"
      )}
      style={{ ...style, paddingLeft: 8 + item.depth * 12 }}
    >
      {/* Drag handle (always visible, activates drag) */}
      <button
        className="p-0.5 rounded cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {/* Tree branch indicator */}
      {item.depth > 0 && (
        <span className="text-muted-foreground/30 mr-0.5">
          {item.isLastChild ? "└" : "├"}
        </span>
      )}

      {/* Icon */}
      {(() => {
        const Icon = resolveIcon(item.node.icon);
        if (Icon && item.node.target_type !== "divider") {
          return <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />;
        } else if (item.node.target_type === "divider") {
          return <span className="text-muted-foreground/40 text-[10px]">—</span>;
        }
        return <span className="w-3 shrink-0" />;
      })()}

      {/* Label */}
      <span className="truncate flex-1 min-w-0 text-[11px]">
        {item.node.label}
      </span>

      {/* Type badge */}
      <span
        className={cn(
          "text-[9px] px-1 rounded shrink-0",
          TYPE_COLORS[item.node.target_type] || "bg-muted text-muted-foreground"
        )}
      >
        {TYPE_LABELS[item.node.target_type] || item.node.target_type}
      </span>

      {/* Action buttons (visible on hover) */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onMoveUp}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Move up"
        >
          <ArrowUp className="h-3 w-3" />
        </button>
        <button
          onClick={onMoveDown}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Move down"
        >
          <ArrowDown className="h-3 w-3" />
        </button>
        <button
          onClick={onDelete}
          className="p-0.5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600"
          title="Delete node"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Drag overlay (renders while dragging) ─────────────

function DragOverlayContent({ item }: { item: FlatItem }) {
  const Icon = resolveIcon(item.node.icon);
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-1 py-1 text-xs border rounded-md bg-background shadow-lg"
      )}
      style={{ paddingLeft: 8 + item.depth * 12 }}
    >
      <span className="text-muted-foreground shrink-0">
        <GripVertical className="h-3 w-3" />
      </span>
      {item.depth > 0 && (
        <span className="text-muted-foreground/30 mr-0.5">
          {item.isLastChild ? "└" : "├"}
        </span>
      )}
      {Icon && item.node.target_type !== "divider" ? (
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      ) : item.node.target_type === "divider" ? (
        <span className="text-muted-foreground/40 text-[10px]">—</span>
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <span className="truncate flex-1 min-w-0 text-[11px] font-medium">
        {item.node.label}
      </span>
      <span
        className={cn(
          "text-[9px] px-1 rounded shrink-0",
          TYPE_COLORS[item.node.target_type] || "bg-muted text-muted-foreground"
        )}
      >
        {TYPE_LABELS[item.node.target_type] || item.node.target_type}
      </span>
    </div>
  );
}

// ─── NavEditorPanel ─────────────────────────────────────

export default function NavEditorPanel({ tree, onClose, onRefresh, headers }: NavEditorPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const rootNodes = useMemo(() => buildTree(tree), [tree]);
  const flatItems = useMemo(() => flattenTree(rootNodes), [rootNodes]);

  const sortableIds = useMemo(() => flatItems.map((f) => String(f.node.id)), [flatItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4, // 4px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Clear success message after 3 seconds
  const flashSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }, []);

  // ── Add node ─────────────────────────────────────────
  const handleAdd = useCallback(
    async (data: {
      parent_id: number | null;
      label: string;
      target_type: string;
      target_name: string | null;
      icon: string | null;
      is_visible: boolean;
      is_expanded: boolean;
      badge: string | null;
      color: string | null;
    }) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/nav/tree", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to create node" }));
          throw new Error(err.error || "Failed to create node");
        }
        setShowAddForm(false);
        flashSuccess(`Added "${data.label}"`);
        onRefresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to create node");
      } finally {
        setSubmitting(false);
      }
    },
    [headers, onRefresh, flashSuccess]
  );

  // ── Delete node ──────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/nav/tree/${deleteTarget.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to delete node" }));
        throw new Error(err.error || "Failed to delete node");
      }
      flashSuccess(`Deleted "${deleteTarget.label}"`);
      setDeleteTarget(null);
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete node");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, headers, onRefresh, flashSuccess]);

  // ── Move node up/down ────────────────────────────────
  const handleMove = useCallback(
    async (item: FlatItem, direction: "up" | "down") => {
      setError(null);

      // Find siblings at the same depth/parent level
      const siblings = flatItems.filter(
        (f) => f.parentId === item.parentId && f.depth === item.depth
      );
      const currentIndex = siblings.findIndex((s) => s.node.id === item.node.id);
      if (currentIndex < 0) return;

      const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (swapIndex < 0 || swapIndex >= siblings.length) return;

      const current = siblings[currentIndex];
      const swapWith = siblings[swapIndex];

      // Swap sort_order values
      const siblingsPayload = [
        { id: current.node.id, sort_order: swapWith.node.sort_order },
        { id: swapWith.node.id, sort_order: current.node.sort_order },
      ];

      try {
        const res = await fetch("/api/nav/tree/reorder", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ siblings: siblingsPayload }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Reorder failed" }));
          throw new Error(err.error || "Reorder failed");
        }
        onRefresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Reorder failed");
      }
    },
    [flatItems, headers, onRefresh]
  );

  // ── Drag-to-reorder ──────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = Number(active.id);
      const overId = Number(over.id);

      // Find the dragged item and the drop target
      const activeItem = flatItems.find((f) => f.node.id === activeId);
      const overItem = flatItems.find((f) => f.node.id === overId);
      if (!activeItem || !overItem) return;

      // Only allow reorder within the same parent group
      if (activeItem.parentId !== overItem.parentId) return;

      // Get all siblings in this parent group, ordered by visual position
      const siblings = flatItems
        .filter((f) => f.parentId === activeItem.parentId && f.depth === activeItem.depth)
        .sort((a, b) => a.node.sort_order - b.node.sort_order);

      const oldIndex = siblings.findIndex((s) => s.node.id === activeId);
      const newIndex = siblings.findIndex((s) => s.node.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;

      // Reorder the array
      const reordered = [...siblings];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      // Assign new sequential sort_order values
      const siblingsPayload = reordered.map((s, i) => ({
        id: s.node.id,
        sort_order: i,
      }));

      try {
        const res = await fetch("/api/nav/tree/reorder", {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ siblings: siblingsPayload }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Reorder failed" }));
          throw new Error(err.error || "Reorder failed");
        }
        flashSuccess(`Reordered "${activeItem.node.label}"`);
        onRefresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Reorder failed");
      }
    },
    [flatItems, headers, onRefresh, flashSuccess]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const activeDragItem = useMemo(
    () => (activeDragId ? flatItems.find((f) => String(f.node.id) === activeDragId) ?? null : null),
    [activeDragId, flatItems]
  );

  // ── Regenerate from DB ─────────────────────────────
  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/nav/tree/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ keep_existing: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Regenerate failed" }));
        throw new Error(err.error || "Regenerate failed");
      }
      const result = await res.json();
      setShowRegenConfirm(false);
      flashSuccess(
        `Tree regenerated: ${result.groups} groups, ${result.tables} tables, ${result.forms} forms, ${result.reports} reports`
      );
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }, [headers, onRefresh, flashSuccess]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Settings className="h-3.5 w-3.5" />
          Nav Editor
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
          title="Close editor"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Status messages */}
      {error && (
        <div className="px-3 py-1.5 text-[10px] text-red-600 bg-red-50 dark:bg-red-950/30 border-b flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
      {successMsg && (
        <div className="px-3 py-1.5 text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-b flex items-center gap-1.5">
          <Check className="h-3 w-3 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Add button */}
      <div className="px-3 py-1.5 border-b shrink-0">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={cn(
            "w-full h-7 text-xs flex items-center justify-center gap-1.5 rounded border transition-colors",
            showAddForm
              ? "bg-muted text-muted-foreground border-muted-foreground/20"
              : "border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary"
          )}
        >
          {showAddForm ? (
            <>
              <X className="h-3 w-3" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" /> Add Node
            </>
          )}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="px-3 py-2 border-b shrink-0">
          <AddNodeForm
            tree={rootNodes}
            onAdd={handleAdd}
            onCancel={() => setShowAddForm(false)}
            submitting={submitting}
          />
        </div>
      )}

      {/* Regenerate button */}
      <div className="px-3 py-1.5 border-b shrink-0">
        <button
          onClick={() => setShowRegenConfirm(true)}
          disabled={regenerating}
          className="w-full h-7 text-xs flex items-center justify-center gap-1.5 rounded border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-amber-500/50 hover:text-amber-600 transition-colors disabled:opacity-50"
          title="Scan the database schema and regenerate the entire navigation tree"
        >
          <RotateCcw className="h-3 w-3" />
          {regenerating ? "Regenerating..." : "Regenerate from DB"}
        </button>
      </div>

      {/* Node list with drag-to-reorder */}
      <div className="flex-1 overflow-y-auto py-1">
        {flatItems.length === 0 && (
          <div className="px-3 py-8 text-center text-[10px] text-muted-foreground">
            No nodes in the tree. Add one above.
          </div>
        )}
        {flatItems.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              {flatItems.map((item) => (
                <SortableNodeEditorRow
                  key={item.node.id}
                  item={item}
                  onMoveUp={() => handleMove(item, "up")}
                  onMoveDown={() => handleMove(item, "down")}
                  onDelete={() => setDeleteTarget({ id: item.node.id, label: item.node.label })}
                />
              ))}
            </SortableContext>
            <DragOverlay>
              {activeDragItem ? <DragOverlayContent item={activeDragItem} /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.label}" and all its children? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {/* Regenerate confirmation */}
      {showRegenConfirm && (
        <ConfirmDialog
          message={`Regenerate the entire navigation tree from the database schema? This will replace all existing nodes with a fresh auto-generated tree. Custom changes will be lost.`}
          onConfirm={handleRegenerate}
          onCancel={() => setShowRegenConfirm(false)}
          loading={regenerating}
          confirmLabel="Regenerate"
          loadingLabel="Regenerating..."
          variant="default"
        />
      )}
    </div>
  );
}