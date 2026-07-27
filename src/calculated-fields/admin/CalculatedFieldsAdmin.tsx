/**
 * CalculatedFieldsAdmin — full admin page for managing calculated field
 * definitions. Includes field list, editor form with expression builder
 * (field picker + expression input + function reference), and CRUD operations.
 */

import { useEffect, useState, useCallback } from "react";
import { Plus, Save, Trash2, Loader2, AlertCircle, Variable, Tally1, Tally2, Tally3, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { CalculatedField } from "@/calculated-fields/schema/calculatedFieldSchema";
import {
  fetchCalculatedFields,
  createCalculatedField,
  updateCalculatedField,
  deleteCalculatedField,
  detectDependencies,
} from "@/calculated-fields/api/calculatedFieldsApi";
import ExpressionInput from "./ExpressionInput";
import FieldPicker from "./FieldPicker";
import FunctionReference from "./FunctionReference";
import TestPanel from "./TestPanel";

// ─── Default new field ────────────────────────────────

const DEFAULT_FIELD: Omit<CalculatedField, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  caption: "",
  tableName: "",
  calcType: "formula",
  expression: "",
  dataType: "text",
  dependsOn: [],
  dependsOnTables: [],
  readOnly: true,
  refreshOn: "read",
  nullWhenEmpty: false,
  visible: true,
  sortable: true,
  filterable: false,
};

// ─── Expression builder layout modes ───────────────────

type BuilderPanel = "fields" | "functions" | "none";

// ─── Component ─────────────────────────────────────────

interface CalculatedFieldsAdminProps {
  tables: string[];
}

export default function CalculatedFieldsAdmin({ tables }: CalculatedFieldsAdminProps) {
  // ── State ────────────────────────────────────────────
  const [fields, setFields] = useState<CalculatedField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // Editor form state
  const [form, setForm] = useState<Omit<CalculatedField, "id" | "createdAt" | "updatedAt">>({ ...DEFAULT_FIELD });

  // Expression builder panel state
  const [builderPanel, setBuilderPanel] = useState<BuilderPanel>("fields");
  const [selectedTable, setSelectedTable] = useState("");

  // Test panel state
  const [testPanelOpen, setTestPanelOpen] = useState(false);

  // ── Derived ──────────────────────────────────────────
  const selectedField = fields.find((f) => f.id === selectedId) ?? null;
  const isNew = selectedId === "__new__";

  // ── Load fields ──────────────────────────────────────
  const loadFields = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCalculatedFields();
      setFields(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fields");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  // ── Select field ─────────────────────────────────────
  const handleSelect = useCallback(
    (id: string | null) => {
      if (dirty) {
        const ok = window.confirm("Discard unsaved changes?");
        if (!ok) return;
      }

      setSelectedId(id);
      setDirty(false);

      if (id === "__new__") {
        setForm({ ...DEFAULT_FIELD });
        setSelectedTable("");
        return;
      }

      const f = fields.find((x) => x.id === id);
      if (f) {
        setForm({
          name: f.name,
          caption: f.caption,
          tableName: f.tableName,
          calcType: f.calcType,
          expression: f.expression,
          dataType: f.dataType,
          dependsOn: f.dependsOn,
          dependsOnTables: f.dependsOnTables,
          readOnly: f.readOnly,
          refreshOn: f.refreshOn,
          nullWhenEmpty: f.nullWhenEmpty,
          visible: f.visible,
          sortable: f.sortable,
          filterable: f.filterable,
        });
        setSelectedTable(f.tableName);
      }
    },
    [fields, dirty],
  );

  // ── Form field update ── ─────────────────────────────
  const updateForm = useCallback(
    <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    [],
  );

  // ── Insert text into expression at cursor ────────────
  const insertIntoExpression = useCallback(
    (text: string) => {
      setForm((prev) => {
        // We don't have direct cursor access here, so append with a space separator
        const newExpr = prev.expression
          ? prev.expression + " " + text
          : text;
        return { ...prev, expression: newExpr };
      });
      setDirty(true);
    },
    [],
  );

  // ── Detect dependencies ──────────────────────────────
  const handleDetectDeps = useCallback(async () => {
    if (!form.expression.trim()) return;
    setDetecting(true);
    try {
      const result = await detectDependencies(form.expression);
      updateForm("dependsOn", result.dependsOn);
      updateForm("dependsOnTables", result.dependsOnTables);
    } catch (err) {
      // Dep detection is best-effort
      console.warn("Dependency detection failed:", err);
    } finally {
      setDetecting(false);
    }
  }, [form.expression, updateForm]);

  // ── Save ─────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!form.name || !form.expression || !form.tableName) return;

    setSaving(true);
    setError(null);

    try {
      // Auto-detect deps before save
      if (form.expression.trim()) {
        try {
          const deps = await detectDependencies(form.expression);
          form.dependsOn = deps.dependsOn;
          form.dependsOnTables = deps.dependsOnTables;
        } catch {
          // Non-blocking
        }
      }

      if (isNew) {
        await createCalculatedField(form as Parameters<typeof createCalculatedField>[0]);
      } else if (selectedId) {
        await updateCalculatedField(selectedId, form as Record<string, unknown>);
      }

      setDirty(false);
      await loadFields();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [form, isNew, selectedId, loadFields]);

  // ── Delete ───────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!selectedId || isNew) return;
    const ok = window.confirm(`Delete calculated field "${selectedField?.name}"?`);
    if (!ok) return;

    setSaving(true);
    try {
      await deleteCalculatedField(selectedId);
      setSelectedId(null);
      setDirty(false);
      await loadFields();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }, [selectedId, isNew, selectedField, loadFields]);

  // ── Table-qualified field insert ──────────────────────
  const handleInsertTableQualified = useCallback(
    (table: string, field: string) => {
      insertIntoExpression(`{${table}.${field}}`);
    },
    [insertIntoExpression],
  );

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex h-full">
      {/* ── Left sidebar: field list ──────────────────── */}
      <div className="w-64 shrink-0 border-r flex flex-col bg-muted/10">
        <div className="px-3 py-2 border-b flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-foreground">
            Calculated Fields
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => handleSelect("__new__")}
            disabled={isNew}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-xs">Loading...</span>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 text-xs text-destructive">{error}</div>
          )}

          {!loading && fields.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              No calculated fields yet. Click "New" to create one.
            </div>
          )}

          {!loading &&
            fields.map((f) => (
              <button
                key={f.id}
                onClick={() => handleSelect(f.id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs transition-colors border-b border-border/30",
                  selectedId === f.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                <div className="font-mono text-[11px] truncate">{f.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground/60">
                    {f.tableName}
                  </span>
                  <span className={cn(
                    "text-[10px] px-1 rounded",
                    f.dataType === "currency" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                    f.dataType === "number" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                    f.dataType === "text" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {f.dataType}
                  </span>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* ── Editor area ──────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedId && !isNew ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <Variable className="h-8 w-8 mx-auto opacity-40" />
              <p className="text-sm">Select a calculated field or create a new one</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-2 border-b flex items-center justify-between shrink-0 bg-muted/20">
              <div className="flex items-center gap-2">
                <Variable className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">
                  {isNew ? "New Calculated Field" : `Edit: ${selectedField?.name ?? ""}`}
                </span>
                {dirty && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    (unsaved)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isNew && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setTestPanelOpen(true)}
                  disabled={!form.expression.trim()}
                >
                  <FlaskConical className="h-3.5 w-3.5 mr-1" />
                  Test
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.expression || !form.tableName}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1" />
                  )}
                  Save
                </Button>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="px-4 py-1.5 bg-destructive/10 border-b flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Editor body — scrollable */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-4 max-w-4xl">
                {/* ── Basic properties ───────────────────── */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => updateForm("name", e.target.value)}
                      placeholder="snake_case_name"
                      className="h-8 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Unique snake_case identifier
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Caption</Label>
                    <Input
                      value={form.caption}
                      onChange={(e) => updateForm("caption", e.target.value)}
                      placeholder="Display label"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Table *</Label>
                    <select
                      value={form.tableName}
                      onChange={(e) => {
                        updateForm("tableName", e.target.value);
                        setSelectedTable(e.target.value);
                      }}
                      className="w-full h-8 text-xs border rounded px-2 bg-background"
                    >
                      <option value="">-- Select table --</option>
                      {tables.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Data Type</Label>
                    <select
                      value={form.dataType}
                      onChange={(e) => updateForm("dataType", e.target.value)}
                      className="w-full h-8 text-xs border rounded px-2 bg-background"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="currency">Currency</option>
                      <option value="boolean">Boolean</option>
                      <option value="date">Date</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Calc Type</Label>
                    <select
                      value={form.calcType}
                      onChange={(e) => updateForm("calcType", e.target.value)}
                      className="w-full h-8 text-xs border rounded px-2 bg-background"
                    >
                      <option value="formula">Formula</option>
                      <option value="scalar">Scalar</option>
                      <option value="aggregate">Aggregate</option>
                      <option value="lookup">Lookup</option>
                      <option value="stored">Stored</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Refresh On</Label>
                    <select
                      value={form.refreshOn}
                      onChange={(e) => updateForm("refreshOn", e.target.value as "read" | "save" | "manual")}
                      className="w-full h-8 text-xs border rounded px-2 bg-background"
                    >
                      <option value="read">On Read</option>
                      <option value="save">On Save</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Format (optional)</Label>
                    <Input
                      value={form.format ?? ""}
                      onChange={(e) => updateForm("format", e.target.value || undefined)}
                      placeholder="$%.2f"
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Decimals</Label>
                    <Input
                      type="number"
                      value={form.decimals ?? ""}
                      onChange={(e) => updateForm("decimals", e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="2"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Prefix</Label>
                    <Input
                      value={form.prefix ?? ""}
                      onChange={(e) => updateForm("prefix", e.target.value || undefined)}
                      placeholder="$"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Suffix</Label>
                    <Input
                      value={form.suffix ?? ""}
                      onChange={(e) => updateForm("suffix", e.target.value || undefined)}
                      placeholder="%"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                {/* ── Flags ──────────────────────────────── */}
                <div className="flex flex-wrap gap-4 py-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.readOnly}
                      onChange={(e) => updateForm("readOnly", e.target.checked)}
                      className="toggle"
                    />
                    Read Only
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.nullWhenEmpty}
                      onChange={(e) => updateForm("nullWhenEmpty", e.target.checked)}
                      className="toggle"
                    />
                    Null When Empty
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.visible}
                      onChange={(e) => updateForm("visible", e.target.checked)}
                      className="toggle"
                    />
                    Visible
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.sortable}
                      onChange={(e) => updateForm("sortable", e.target.checked)}
                      className="toggle"
                    />
                    Sortable
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.filterable}
                      onChange={(e) => updateForm("filterable", e.target.checked)}
                      className="toggle"
                    />
                    Filterable
                  </label>
                </div>

                {/* ── Expression builder ─────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-medium">Expression *</Label>
                    <div className="flex items-center gap-1">
                      {/* Panel toggle buttons */}
                      <button
                        onClick={() => setBuilderPanel(builderPanel === "fields" ? "none" : "fields")}
                        className={cn(
                          "h-7 px-2 text-[10px] rounded border transition-colors",
                          builderPanel === "fields"
                            ? "bg-muted text-foreground border-ring"
                            : "text-muted-foreground border-input hover:bg-muted/50",
                        )}
                      >
                        <Tally1 className="h-3 w-3 inline mr-1" />
                        Fields
                      </button>
                      <button
                        onClick={() => setBuilderPanel(builderPanel === "functions" ? "none" : "functions")}
                        className={cn(
                          "h-7 px-2 text-[10px] rounded border transition-colors",
                          builderPanel === "functions"
                            ? "bg-muted text-foreground border-ring"
                            : "text-muted-foreground border-input hover:bg-muted/50",
                        )}
                      >
                        <Tally2 className="h-3 w-3 inline mr-1" />
                        Functions
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] ml-2"
                        onClick={handleDetectDeps}
                        disabled={detecting || !form.expression.trim()}
                      >
                        {detecting ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Tally3 className="h-3 w-3 mr-1" />
                        )}
                        Detect Deps
                      </Button>
                    </div>
                  </div>

                  {/* Three-panel layout */}
                  <div className="border rounded-lg overflow-hidden">
                    {/* Expression input (always visible) */}
                    <ExpressionInput
                      value={form.expression}
                      onChange={(v) => updateForm("expression", v)}
                      placeholder="Enter expression... e.g., {quantity} * {unit_price}"
                    />

                    {/* Collapsible panels below the expression */}
                    {(builderPanel === "fields" || builderPanel === "functions") && (
                      <div className="border-t">
                        <div className="grid grid-cols-2 h-[280px]">
                          {builderPanel === "fields" && (
                            <FieldPicker
                              tableName={selectedTable}
                              tables={tables}
                              onTableChange={(t) => {
                                setSelectedTable(t);
                                updateForm("tableName", t);
                              }}
                              onInsertField={insertIntoExpression}
                              onInsertTableField={handleInsertTableQualified}
                            />
                          )}
                          {builderPanel === "functions" && (
                            <div className="col-span-2">
                              <FunctionReference
                                onInsert={insertIntoExpression}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Dependencies (read-only) ──────────── */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Dependencies</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {form.dependsOn.length === 0 && form.dependsOnTables.length === 0 && (
                      <span className="text-xs text-muted-foreground italic">
                        Click "Detect Deps" to auto-detect, or leave empty for manual fields
                      </span>
                    )}
                    {form.dependsOn.map((dep) => (
                      <span
                        key={dep}
                        className="text-[10px] px-1.5 py-0.5 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 rounded font-mono"
                      >
                        {dep}
                      </span>
                    ))}
                    {form.dependsOnTables.map((dep) => (
                      <span
                        key={dep}
                        className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 rounded font-mono"
                      >
                        {dep}.*
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Test Expression Panel */}
      <TestPanel
        open={testPanelOpen}
        onClose={() => setTestPanelOpen(false)}
        expression={form.expression}
        dependsOn={form.dependsOn}
      />
    </div>
  );
}
