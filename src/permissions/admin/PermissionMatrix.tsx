// PermissionMatrix — table x field x role permission grid editor
// Provides a grid view for administrators to configure can_read/can_write
// permissions per field, per role, for any table in the system.
import React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Shield,
  Search,
  Loader2,
  Check,
  X,
  AlertTriangle,
  ShieldOff,
  Save,
  Eye,
  EyeOff,
  Pencil,
  PencilOff,
  Table2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface Role {
  id: number;
  name: string;
  caption: string;
  is_system: boolean;
}

interface FieldInfo {
  name: string;
  type: string;
}

interface TableInfo {
  name: string;
  label: string;
  fields: FieldInfo[];
}

interface FieldPermissionEntry {
  role_id: number;
  table_name: string;
  field_name: string;
  can_read: boolean;
  can_write: boolean;
}

interface MatrixData {
  roles: Role[];
  tables: TableInfo[];
  permissions: FieldPermissionEntry[];
}

// ─── Permission Matrix ─────────────────────────────────

export default function PermissionMatrix() {
  const { isAdmin, loading: permLoading } = usePermissions();

  // ── State ────────────────────────────────────────────
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected table
  const [selectedTable, setSelectedTable] = useState<string>("");

  // Local edits: key = `${role_id}:${field_name}`, value = { can_read, can_write }
  const [edits, setEdits] = useState<Map<string, { can_read: boolean; can_write: boolean }>>(new Map());

  // Field search
  const [fieldSearch, setFieldSearch] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Data fetching ─────────────────────────────────────

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/permissions/matrix");
      if (!res.ok) throw new Error(`Failed to load permission matrix: ${res.status}`);
      const data = (await res.json()) as MatrixData;
      setMatrixData(data);
      // Auto-select first table if none selected
      if (!selectedTable && data.tables.length > 0) {
        setSelectedTable(data.tables[0].name);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  // Reset edits when table changes
  useEffect(() => {
    setEdits(new Map());
    setSaveResult(null);
  }, [selectedTable]);

  // ── Current table fields ─────────────────────────────

  const currentTable = useMemo(() => {
    if (!matrixData || !selectedTable) return null;
    return matrixData.tables.find((t) => t.name === selectedTable) ?? null;
  }, [matrixData, selectedTable]);

  // Filtered fields
  const filteredFields = useMemo(() => {
    if (!currentTable) return [];
    if (!fieldSearch.trim()) return currentTable.fields;
    const q = fieldSearch.toLowerCase();
    return currentTable.fields.filter((f) => f.name.toLowerCase().includes(q));
  }, [currentTable, fieldSearch]);

  // ── Permission lookup ─────────────────────────────────

  function getPermission(
    roleId: number,
    tableName: string,
    fieldName: string
  ): { can_read: boolean; can_write: boolean } {
    // Check local edits first
    const editKey = `${roleId}:${fieldName}`;
    const localEdit = edits.get(editKey);
    if (localEdit) return localEdit;

    // Fall back to saved data
    if (!matrixData) return { can_read: true, can_write: true };
    const entry = matrixData.permissions.find(
      (p) =>
        p.role_id === roleId &&
        p.table_name === tableName &&
        p.field_name === fieldName
    );
    if (entry) return { can_read: entry.can_read, can_write: entry.can_write };

    // Default: all permissions granted
    return { can_read: true, can_write: true };
  }

  function isEdited(roleId: number, fieldName: string): boolean {
    return edits.has(`${roleId}:${fieldName}`);
  }

  function toggleRead(roleId: number, fieldName: string) {
    const current = getPermission(roleId, selectedTable, fieldName);
    const newValue = !current.can_read;
    const editKey = `${roleId}:${fieldName}`;
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(editKey, { can_read: newValue, can_write: newValue ? current.can_write : false });
      return next;
    });
  }

  function toggleWrite(roleId: number, fieldName: string) {
    const current = getPermission(roleId, selectedTable, fieldName);
    // If can_read is false, toggling write does nothing (can't write what you can't read)
    if (!current.can_read) return;
    const editKey = `${roleId}:${fieldName}`;
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(editKey, { can_read: true, can_write: !current.can_write });
      return next;
    });
  }

  // ── Save ─────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!matrixData || edits.size === 0) return;

    setSaving(true);
    setSaveResult(null);

    const entries: { role_id: number; table_name: string; field_name: string; can_read: boolean; can_write: boolean }[] = [];

    for (const [key, value] of edits) {
      const [roleIdStr, fieldName] = key.split(":");
      const roleId = parseInt(roleIdStr, 10);
      entries.push({
        role_id: roleId,
        table_name: selectedTable,
        field_name: fieldName,
        can_read: value.can_read,
        can_write: value.can_write,
      });
    }

    try {
      const res = await fetch("/api/permissions/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        setSaveResult({ ok: false, message: err.error });
        return;
      }

      // Refresh data
      await fetchMatrix();
      setEdits(new Map());
      setSaveResult({ ok: true, message: `${entries.length} permission${entries.length !== 1 ? "s" : ""} saved.` });

      // Clear success message after 3s
      setTimeout(() => setSaveResult(null), 3000);
    } catch (e) {
      setSaveResult({ ok: false, message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }, [matrixData, edits, selectedTable, fetchMatrix]);

  const handleReset = useCallback(() => {
    setEdits(new Map());
    setSaveResult(null);
  }, []);

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
            Only administrators can manage permissions.
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
        <Shield className="h-4 w-4" />
        <span className="text-sm font-semibold">Permission Matrix</span>
        <span className="text-xs text-muted-foreground">
          Configure field-level read/write access per role
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
            {matrixData?.tables.map((t) => (
              <option key={t.name} value={t.name}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Field search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search fields..."
            value={fieldSearch}
            onChange={(e) => setFieldSearch(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 ml-auto">
          {edits.size > 0 && (
            <Button size="sm" variant="outline" onClick={handleReset} className="text-xs">
              <X className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || edits.size === 0}
            className="text-xs"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save{edits.size > 0 ? ` (${edits.size})` : ""}
          </Button>
        </div>
      </div>

      {/* ── Status banner ──────────────────────────── */}
      {saveResult && (
        <div
          className={`px-3 py-1.5 text-xs flex items-center gap-1.5 shrink-0 ${
            saveResult.ok
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {saveResult.ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {saveResult.message}
        </div>
      )}

      {/* ── Grid ────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-xs">Loading matrix...</span>
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-destructive">{error}</div>
        ) : !currentTable ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center space-y-2">
              <Table2 className="h-8 w-8 mx-auto text-muted-foreground/20" />
              <p className="text-sm">No table selected</p>
              <p className="text-xs text-muted-foreground/60">
                Select a table from the dropdown above to configure field permissions.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            {/* Column headers */}
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b min-w-[180px]">
                  Field
                </th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground border-r border-b min-w-[80px]">
                  Type
                </th>
                {matrixData?.roles.map((role) => (
                  <th
                    key={role.id}
                    colSpan={2}
                    className={`text-center px-1 py-2 font-medium border-b min-w-[90px] ${
                      role.is_system
                        ? "bg-amber-50/50 dark:bg-amber-900/10"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="truncate">{role.caption}</span>
                      {role.is_system && (
                        <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 font-medium shrink-0">
                          sys
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                <th className="border-r border-b" />
                <th className="border-r border-b" />
                {matrixData?.roles.map((role) => (
                  <React.Fragment key={role.id}>
                    <th className="text-center px-1 py-1 font-medium text-[10px] text-muted-foreground border-b" title="Read">
                      <Eye className="h-3 w-3 mx-auto" />
                    </th>
                    <th className="text-center px-1 py-1 font-medium text-[10px] text-muted-foreground border-b border-r" title="Write">
                      <Pencil className="h-3 w-3 mx-auto" />
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredFields.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + (matrixData?.roles.length ?? 0) * 2}
                    className="text-center py-8 text-muted-foreground"
                  >
                    {fieldSearch ? "No fields match your search." : "No fields found."}
                  </td>
                </tr>
              ) : (
                filteredFields.map((field) => (
                  <tr
                    key={field.name}
                    className={`hover:bg-muted/20 transition-colors ${
                      isEdited(matrixData?.roles[0]?.id ?? 0, field.name)
                        ? ""
                        : ""
                    }`}
                  >
                    <td className="px-3 py-1.5 border-r border-b font-mono text-[11px]">
                      {field.name}
                    </td>
                    <td className="px-2 py-1.5 border-r border-b text-muted-foreground text-[10px]">
                      {field.type}
                    </td>
                    {matrixData?.roles.map((role) => {
                      const perm = getPermission(role.id, selectedTable, field.name);
                      const edited = isEdited(role.id, field.name);
                      return (
                        <React.Fragment key={role.id}>
                          {/* can_read toggle */}
                          <td
                            className={`px-1 py-1.5 text-center border-b align-middle ${
                              edited ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                            }`}
                          >
                            <button
                              onClick={() => toggleRead(role.id, field.name)}
                              className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
                                perm.can_read
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : "bg-muted text-muted-foreground/40 hover:bg-muted/80"
                              }`}
                              title={perm.can_read ? "Click to revoke read" : "Click to grant read"}
                            >
                              {perm.can_read ? (
                                <Eye className="h-3 w-3" />
                              ) : (
                                <EyeOff className="h-3 w-3" />
                              )}
                            </button>
                          </td>
                          {/* can_write toggle */}
                          <td
                            className={`px-1 py-1.5 text-center border-b border-r align-middle ${
                              edited ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                            }`}
                          >
                            <button
                              onClick={() => toggleWrite(role.id, field.name)}
                              disabled={!perm.can_read}
                              className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
                                !perm.can_read
                                  ? "opacity-20 cursor-not-allowed"
                                  : perm.can_write
                                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                                    : "bg-muted text-muted-foreground/40 hover:bg-muted/80"
                              }`}
                              title={
                                !perm.can_read
                                  ? "Grant read access first"
                                  : perm.can_write
                                    ? "Click to revoke write"
                                    : "Click to grant write"
                              }
                            >
                              {perm.can_write ? (
                                <Pencil className="h-3 w-3" />
                              ) : (
                                <PencilOff className="h-3 w-3" />
                              )}
                            </button>
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Legend ───────────────────────────────────── */}
      <div className="px-3 py-2 border-t text-[10px] text-muted-foreground flex items-center gap-4 shrink-0">
        <span className="flex items-center gap-1">
          <Eye className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Read
        </span>
        <span className="flex items-center gap-1">
          <Pencil className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Write
        </span>
        <span className="flex items-center gap-1">
          <EyeOff className="h-3 w-3 text-muted-foreground/40" /> No access
        </span>
        <span className="text-muted-foreground/40">|</span>
        <span>Fields without explicit permissions default to full access.</span>
      </div>
    </div>
  );
}
