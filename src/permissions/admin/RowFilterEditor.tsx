// RowFilterEditor — manage row-level filters per role per table
// Provides a UI for administrators to create, edit, and delete row-level
// SQL filters that restrict which rows a role can see.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Filter,
  Plus,
  Trash2,
  Search,
  Loader2,
  AlertTriangle,
  ShieldOff,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface Role {
  id: number;
  name: string;
  caption: string;
  is_system: boolean;
}

interface RowFilter {
  id: number;
  role_id: number;
  table_name: string;
  filter_condition: Record<string, unknown>;
  filter_sql: string | null;
  description: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  role_name: string;
}

// ─── Row Filter Editor ─────────────────────────────────

export default function RowFilterEditor() {
  const { isAdmin, loading: permLoading } = usePermissions();

  // ── State ────────────────────────────────────────────
  const [roles, setRoles] = useState<Role[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [rowFilters, setRowFilters] = useState<RowFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [search, setSearch] = useState("");

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editFilter, setEditFilter] = useState<RowFilter | null>(null);
  const [formRoleId, setFormRoleId] = useState<string>("");
  const [formField, setFormField] = useState("");
  const [formOperator, setFormOperator] = useState("ILIKE");
  const [formValue, setFormValue] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<RowFilter | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toggle state
  const [toggling, setToggling] = useState<Set<number>>(new Set());

  // ── Data fetching ─────────────────────────────────────

  const fetchMatrix = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions/matrix");
      if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
      const data = (await res.json()) as {
        roles: Role[];
        tables: { name: string; label: string }[];
      };
      setRoles(data.roles);
      const tableNames = data.tables.map((t) => t.name);
      setTables(tableNames);
      if (!selectedTable && tableNames.length > 0) {
        setSelectedTable(tableNames[0]);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const fetchRowFilters = useCallback(async (table: string) => {
    if (!table) {
      setRowFilters([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/permissions/row-filters/${encodeURIComponent(table)}`);
      if (!res.ok) throw new Error(`Failed to load row filters: ${res.status}`);
      const data = (await res.json()) as RowFilter[];
      setRowFilters(data);
    } catch (e) {
      setError((e as Error).message);
      setRowFilters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  useEffect(() => {
    fetchRowFilters(selectedTable);
  }, [selectedTable, fetchRowFilters]);

  // ── Filtered list ─────────────────────────────────────

  const filteredFilters = useMemo(() => {
    if (!search.trim()) return rowFilters;
    const q = search.toLowerCase();
    return rowFilters.filter(
      (f) =>
        (f.description && f.description.toLowerCase().includes(q)) ||
        (f.filter_sql && f.filter_sql.toLowerCase().includes(q)) ||
        f.role_name.toLowerCase().includes(q)
    );
  }, [rowFilters, search]);

  // ── Dialog open/close ─────────────────────────────────

  const openCreate = useCallback(() => {
    setEditFilter(null);
    setFormRoleId(roles.length > 0 ? String(roles[0].id) : "");
    setFormField("");
    setFormOperator("ILIKE");
    setFormValue("");
    setFormDescription("");
    setFormEnabled(true);
    setFormError(null);
    setDialogOpen(true);
  }, [roles]);

  const openEdit = useCallback((filter: RowFilter) => {
    setEditFilter(filter);
    setFormRoleId(String(filter.role_id));
    // Extract field/operator/value from filter_condition
    const cond = filter.filter_condition as Record<string, unknown>;
    setFormField(String(cond.field || ""));
    setFormOperator(String(cond.operator || "ILIKE"));
    setFormValue(String(cond.value || ""));
    setFormDescription(filter.description || "");
    setFormEnabled(filter.enabled);
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditFilter(null);
  }, []);

  // ── Save ──────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setFormError(null);

    if (!formRoleId) {
      setFormError("Role is required");
      return;
    }
    if (!formField.trim()) {
      setFormError("Field name is required");
      return;
    }
    if (!formValue.trim()) {
      setFormError("Value is required");
      return;
    }

    setSaving(true);
    try {
      const filterCondition = {
        field: formField.trim(),
        operator: formOperator,
        value: formValue.trim(),
      };

      const body: Record<string, unknown> = {
        role_id: parseInt(formRoleId, 10),
        table_name: selectedTable,
        filter_condition: filterCondition,
        description: formDescription.trim() || null,
        enabled: formEnabled,
      };

      if (editFilter) {
        body.id = editFilter.id;
      }

      const res = await fetch("/api/permissions/row-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        setFormError(err.error);
        return;
      }

      closeDialog();
      await fetchRowFilters(selectedTable);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [formRoleId, formField, formOperator, formValue, formDescription, formEnabled, editFilter, selectedTable, closeDialog, fetchRowFilters]);

  // ── Delete ────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/permissions/row-filters/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        setError(err.error);
        return;
      }
      setDeleteTarget(null);
      await fetchRowFilters(selectedTable);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedTable, fetchRowFilters]);

  // ── Toggle enabled ────────────────────────────────────

  const toggleEnabled = useCallback(
    async (filter: RowFilter) => {
      setToggling((prev) => new Set(prev).add(filter.id));
      try {
        const body = {
          id: filter.id,
          role_id: filter.role_id,
          table_name: filter.table_name,
          filter_condition: filter.filter_condition,
          enabled: !filter.enabled,
          description: filter.description,
        };
        const res = await fetch("/api/permissions/row-filters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error: string };
          setError(err.error);
          return;
        }
        await fetchRowFilters(selectedTable);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setToggling((prev) => {
          const next = new Set(prev);
          next.delete(filter.id);
          return next;
        });
      }
    },
    [selectedTable, fetchRowFilters]
  );

  // ── Guard: only admins ────────────────────────────────

  if (permLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm">Loading permissions...</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm">Access denied</p>
          <p className="text-xs text-muted-foreground/60">
            Only administrators can manage row filters.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────── */}
      <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
        <Filter className="h-4 w-4" />
        <span className="text-sm font-semibold">Row Filters</span>
        <span className="text-xs text-muted-foreground">
          Restrict which rows each role can see
        </span>
      </div>

      {/* ── Toolbar ─────────────────────────────────── */}
      <div className="px-3 py-2 border-b flex items-center gap-3 shrink-0 flex-wrap">
        {/* Table selector */}
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0">Table</Label>
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="h-7 text-xs border rounded-lg px-2 bg-background max-w-[200px]"
          >
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search filters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Button size="sm" onClick={openCreate} className="text-xs">
            <Plus className="h-3 w-3 mr-1" />
            New Filter
          </Button>
        </div>
      </div>

      {/* ── Error banner ──────────────────────────── */}
      {error && (
        <div className="px-3 py-1.5 text-xs flex items-center gap-1.5 shrink-0 bg-destructive/10 text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </div>
      )}

      {/* ── Filter list ───────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-xs">Loading filters...</span>
          </div>
        ) : filteredFilters.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center space-y-2">
              <Filter className="h-8 w-8 mx-auto text-muted-foreground/20" />
              <p className="text-sm">
                {search ? "No filters match your search." : "No row filters configured."}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {search
                  ? "Try a different search term."
                  : "Click 'New Filter' to add a row-level filter for this table."}
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b min-w-[120px]">
                  Role
                </th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground border-r border-b min-w-[100px]">
                  Condition
                </th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground border-r border-b min-w-[200px]">
                  SQL
                </th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground border-r border-b min-w-[150px]">
                  Description
                </th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground border-r border-b w-[80px]">
                  Enabled
                </th>
                <th className="text-center px-2 py-2 font-medium text-muted-foreground border-b w-[60px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredFilters.map((filter) => (
                <tr
                  key={filter.id}
                  className={`hover:bg-muted/20 transition-colors ${
                    !filter.enabled ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-3 py-2 border-r border-b font-medium">
                    {filter.role_name}
                  </td>
                  <td className="px-2 py-2 border-r border-b font-mono text-[11px]">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground">{filter.filter_condition?.field as string}</span>
                      <span className="text-[10px] px-1 rounded bg-muted">{filter.filter_condition?.operator as string}</span>
                      <span className="text-muted-foreground">{(filter.filter_condition?.value as string) ?? ""}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 border-r border-b font-mono text-[10px] text-muted-foreground truncate max-w-[300px]">
                    {filter.filter_sql || (
                      <span className="italic text-muted-foreground/50">auto</span>
                    )}
                  </td>
                  <td className="px-2 py-2 border-r border-b text-muted-foreground">
                    {filter.description || (
                      <span className="italic text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 border-r border-b text-center">
                    <button
                      onClick={() => toggleEnabled(filter)}
                      disabled={toggling.has(filter.id)}
                      className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
                        toggling.has(filter.id)
                          ? "opacity-50 cursor-wait"
                          : filter.enabled
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground/40 hover:bg-muted/80"
                      }`}
                      title={filter.enabled ? "Click to disable" : "Click to enable"}
                    >
                      {filter.enabled ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3" />
                      )}
                    </button>
                  </td>
                  <td className="px-2 py-2 border-b text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEdit(filter)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Edit filter"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(filter)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                        title="Delete filter"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Legend ───────────────────────────────────── */}
      <div className="px-3 py-2 border-t text-[10px] text-muted-foreground flex items-center gap-4 shrink-0">
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Enabled
        </span>
        <span className="flex items-center gap-1">
          <EyeOff className="h-3 w-3 text-muted-foreground/40" /> Disabled
        </span>
        <span className="text-muted-foreground/40">|</span>
        <span>
          Row filters are appended as AND conditions to all data queries for the assigned role.
        </span>
      </div>

      {/* ── Create/Edit Dialog ───────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editFilter ? "Edit Row Filter" : "New Row Filter"}</DialogTitle>
            <DialogDescription>
              {editFilter
                ? "Update the row-level filter condition."
                : `Create a row-level filter for table "${selectedTable}".`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Role selector */}
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <select
                value={formRoleId}
                onChange={(e) => setFormRoleId(e.target.value)}
                className="h-7 w-full text-xs border rounded-lg px-2 bg-background"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.caption} ({r.name})
                  </option>
                ))}
              </select>
            </div>

            {/* Field */}
            <div className="space-y-1">
              <Label className="text-xs">Field</Label>
              <Input
                value={formField}
                onChange={(e) => setFormField(e.target.value)}
                placeholder="e.g. status, company_id, region"
                className="h-7 text-xs"
              />
            </div>

            {/* Operator */}
            <div className="space-y-1">
              <Label className="text-xs">Operator</Label>
              <select
                value={formOperator}
                onChange={(e) => setFormOperator(e.target.value)}
                className="h-7 w-full text-xs border rounded-lg px-2 bg-background"
              >
                <option value="ILIKE">ILIKE (contains)</option>
                <option value="EQ">= (equals)</option>
                <option value="NEQ">!= (not equals)</option>
                <option value="GT">&gt; (greater than)</option>
                <option value="GTE">&gt;= (greater or equal)</option>
                <option value="LT">&lt; (less than)</option>
                <option value="LTE">&lt;= (less or equal)</option>
                <option value="STARTS_WITH">Starts with</option>
                <option value="ENDS_WITH">Ends with</option>
              </select>
            </div>

            {/* Value */}
            <div className="space-y-1">
              <Label className="text-xs">Value</Label>
              <Input
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder="e.g. 'Active', 100, '2024-01-01'"
                className="h-7 text-xs"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. 'Only show active records'"
                className="h-7 text-xs"
              />
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="toggle"
                />
                Enabled
              </label>
            </div>

            {/* Form error */}
            {formError && (
              <div className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeDialog}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              {editFilter ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ───────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Row Filter</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this row filter? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && (
            <div className="text-xs space-y-1 bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">Role:</span>
                <span>{deleteTarget.role_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Condition:</span>
                <span className="font-mono text-[11px]">
                  {deleteTarget.filter_condition?.field as string}{" "}
                  {deleteTarget.filter_condition?.operator as string}{" "}
                  {(deleteTarget.filter_condition?.value as string) ?? ""}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-3 w-3 mr-1" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}