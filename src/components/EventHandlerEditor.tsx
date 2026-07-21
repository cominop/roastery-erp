/**
 * EventHandlerEditor — Admin UI for managing event handlers
 *
 * Scope selector → fetches handlers from /api/events?scope=X
 * Each handler is a card with: event name, enabled toggle, code editor, Save/Delete
 * "Add New Event" creates a new handler inline
 * "Show inherited" reveals handlers from parent levels
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  getEventHandlers,
  createEventHandler,
  updateEventHandler,
  deleteEventHandler,
  runEventHandler,
  getFormList,
  getGroups,
  type EventHandler,
  type ExecutionResult,
} from "@/lib/api";
import {
  Code,
  Plus,
  Trash2,
  Save,
  Play,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

type ScopeMode = "form" | "group" | "task";

interface ScopeOption {
  value: string;
  label: string;
}

interface EditorState {
  saving: string | null; // handler id being saved, or "new"
  error: string | null;
}

// ─── Helpers ────────────────────────────────────────────

function eventColor(eventName: string): string {
  if (eventName.startsWith("on_before")) return "border-l-blue-500";
  if (eventName.startsWith("on_after")) return "border-l-emerald-500";
  if (eventName.startsWith("on_current") || eventName.startsWith("on_load") || eventName.startsWith("on_open"))
    return "border-l-amber-500";
  return "border-l-muted-foreground/30";
}

function levelBadge(level: string): { label: string; cls: string } {
  switch (level) {
    case "item":
      return { label: "Item", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };
    case "group":
      return { label: "Group", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" };
    case "task":
      return { label: "Task", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
    default:
      return { label: level, cls: "bg-gray-100 text-gray-600" };
  }
}

// ─── Component ──────────────────────────────────────────

export default function EventHandlerEditor() {
  // Scope state
  const [mode, setMode] = useState<ScopeMode>("group");
  const [scopeValue, setScopeValue] = useState("catalogs");
  const [forms, setForms] = useState<ScopeOption[]>([]);
  const [groups, setGroups] = useState<Record<string, string[]>>({});

  // Handler state
  const [handlers, setHandlers] = useState<EventHandler[]>([]);
  const [inherited, setInherited] = useState<EventHandler[]>([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ saving: null, error: null });

  // "Add new" form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newEventName, setNewEventName] = useState("");
  const [newHandlerCode, setNewHandlerCode] = useState("def handle(context):\n    record = context.get('record', {})\n    return record\n");
  const [newDescription, setNewDescription] = useState("");

  // Show inherited
  const [showInherited, setShowInherited] = useState(false);

  const handleScopeChange = useCallback((value: string | null) => {
    if (value != null) setScopeValue(value);
  }, []);

  // ─── Load scope options ─────────────────────────────────

  useEffect(() => {
    getFormList()
      .then((list) => {
        const opts = list
          .filter((f) => f.name)
          .map((f) => ({
            value: f.name,
            label: f.caption || f.name,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setForms(opts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getGroups()
      .then((g) => setGroups(g))
      .catch(() => {});
  }, []);

  // ─── Build scope options for current mode ───────────────

  const scopeOptions = useCallback((): ScopeOption[] => {
    switch (mode) {
      case "form":
        return forms;
      case "group":
        return Object.keys(groups).map((name) => ({
          value: name,
          label: name.charAt(0).toUpperCase() + name.slice(1),
        }));
      case "task":
        return [{ value: "task", label: "Task (root)" }];
    }
  }, [mode, forms, groups]);

  // Reset scope value when mode changes
  useEffect(() => {
    const opts = scopeOptions();
    if (opts.length > 0) {
      setScopeValue(opts[0].value);
    } else {
      setScopeValue("");
    }
  }, [mode, scopeOptions]);

  // ─── Fetch handlers when scope changes ──────────────────

  useEffect(() => {
    if (!scopeValue) return;
    setLoading(true);
    setEditor({ saving: null, error: null });

    Promise.all([
      getEventHandlers(scopeValue),
      // Also fetch inherited: for form mode, get the group and task handlers
      // For group mode, get task handlers
      // For task mode, nothing inherited
      mode === "form"
        ? getEventHandlers("task")
            .then((t) => t.filter((h) => h.level === "task"))
        : mode === "group"
        ? getEventHandlers("task")
            .then((t) => t.filter((h) => h.level === "task"))
        : Promise.resolve([] as EventHandler[]),
    ])
      .then(([direct, inh]) => {
        setHandlers(direct);
        setInherited(inh);
      })
      .catch((err) => {
        setEditor({ saving: null, error: `Failed to load: ${err.message}` });
        setHandlers([]);
        setInherited([]);
      })
      .finally(() => setLoading(false));
  }, [scopeValue, mode]);

  // ─── Mutations ──────────────────────────────────────────

  const handleToggleEnabled = useCallback(
    async (h: EventHandler) => {
      setEditor({ saving: h.id, error: null });
      try {
        const updated = await updateEventHandler(h.id, { enabled: !h.enabled });
        setHandlers((prev) => prev.map((p) => (p.id === h.id ? updated : p)));
      } catch (err: any) {
        setEditor({ saving: null, error: `Failed to toggle: ${err.message}` });
      } finally {
        setEditor({ saving: null, error: null });
      }
    },
    []
  );

  const handleSaveCode = useCallback(
    async (h: EventHandler, newCode: string) => {
      setEditor({ saving: h.id, error: null });
      try {
        const updated = await updateEventHandler(h.id, {
          handler: newCode,
          description: h.description || undefined,
        });
        setHandlers((prev) => prev.map((p) => (p.id === h.id ? updated : p)));
      } catch (err: any) {
        setEditor({ saving: null, error: `Failed to save: ${err.message}` });
      } finally {
        setEditor({ saving: null, error: null });
      }
    },
    []
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this event handler?")) return;
      setEditor({ saving: id, error: null });
      try {
        await deleteEventHandler(id);
        setHandlers((prev) => prev.filter((p) => p.id !== id));
      } catch (err: any) {
        setEditor({ saving: null, error: `Failed to delete: ${err.message}` });
      } finally {
        setEditor({ saving: null, error: null });
      }
    },
    []
  );

  const handleAddNew = useCallback(async () => {
    if (!newEventName.trim()) return;
    setEditor({ saving: "new", error: null });
    try {
      const level = mode === "task" ? "task" : mode;
      const created = await createEventHandler({
        level,
        scope: scopeValue,
        event_name: newEventName.trim(),
        handler: newHandlerCode,
        language: "python",
        description: newDescription.trim() || undefined,
      });
      setHandlers((prev) => [...prev, created]);
      setShowNewForm(false);
      setNewEventName("");
      setNewHandlerCode("def handle(context):\n    record = context.get('record', {})\n    return record\n");
      setNewDescription("");
    } catch (err: any) {
      setEditor({ saving: null, error: `Failed to create: ${err.message}` });
    } finally {
      setEditor({ saving: null, error: null });
    }
  }, [newEventName, newHandlerCode, newDescription, mode, scopeValue]);

  // ─── Render ─────────────────────────────────────────────

  const opts = scopeOptions();
  const scopeLabel =
    mode === "form" ? "Form" : mode === "group" ? "Group" : "Scope";

  return (
    <div className="space-y-4">
      {/* ─── Scope selector bar ──────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Mode tabs */}
        <div className="flex items-center border rounded-lg overflow-hidden text-xs">
          {(["group", "task"] as ScopeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 transition-colors ${
                mode === m
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {m === "group" ? "Groups" : m === "task" ? "Task Level" : m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">{scopeLabel}:</span>
          {opts.length > 50 ? (
            <select
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              className="h-8 text-xs border rounded px-2 bg-background min-w-[180px]"
            >
              {opts.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <Select value={scopeValue} onValueChange={handleScopeChange}>
              <SelectTrigger className="min-w-[180px] text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {opts.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Form picker shown only in form mode */}
          {mode === "form" && forms.length > 0 && (
            <Select value={scopeValue} onValueChange={handleScopeChange}>
              <SelectTrigger className="min-w-[220px] text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {forms.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* ─── Error banner ────────────────────────────────── */}
      {editor.error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {editor.error}
          <button
            onClick={() => setEditor((prev) => ({ ...prev, error: null }))}
            className="ml-auto p-0.5 rounded hover:bg-destructive/10"
          >
            ×
          </button>
        </div>
      )}

      {/* ─── Loading state ────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
          <div className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading handlers...
        </div>
      )}

      {/* ─── Handler cards ────────────────────────────────── */}
      {!loading && (
        <div className="space-y-3">
          {handlers.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              <Code className="mx-auto h-6 w-6 mb-2 opacity-40" />
              No event handlers for this scope.
              <br />
              Click <strong>+ New Event</strong> to add one.
            </div>
          )}

          {handlers.map((h) => (
            <EventHandlerCard
              key={h.id}
              handler={h}
              saving={editor.saving === h.id}
              onToggle={() => handleToggleEnabled(h)}
              onSave={(code) => handleSaveCode(h, code)}
              onDelete={() => handleDelete(h.id)}
            />
          ))}

          {/* ─── "Add New Event" button / form ────────────── */}
          {!showNewForm ? (
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewForm(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                New Event
              </Button>
              {(mode === "form" || mode === "group") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInherited(!showInherited)}
                  className="text-muted-foreground"
                >
                  {showInherited ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {showInherited ? "Hide inherited" : "Show inherited handlers"}
                </Button>
              )}
            </div>
          ) : (
            <Card className="border-dashed border-blue-300 dark:border-blue-700">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  New Event Handler
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Event Name
                  </label>
                  <Input
                    placeholder="e.g., on_before_apply_record"
                    value={newEventName}
                    onChange={(e) => setNewEventName(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Description (optional)
                  </label>
                  <Input
                    placeholder="Brief description of this handler"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Handler Code (Python)
                  </label>
                  <Textarea
                    value={newHandlerCode}
                    onChange={(e) => setNewHandlerCode(e.target.value)}
                    className="min-h-[120px] text-xs font-mono"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowNewForm(false);
                    setNewEventName("");
                    setNewHandlerCode("def handle(context):\n    record = context.get('record', {})\n    return record\n");
                    setNewDescription("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddNew}
                  disabled={!newEventName.trim() || editor.saving === "new"}
                >
                  {editor.saving === "new" ? (
                    <span className="flex items-center gap-1">
                      <div className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Creating...
                    </span>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      Create
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* ─── Inherited handlers section ───────────────── */}
          {showInherited && inherited.length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                Inherited from Task Level
              </h4>
              <div className="space-y-2">
                {inherited.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${levelBadge(h.level).cls}`}
                    >
                      {levelBadge(h.level).label}
                    </span>
                    <code className="font-mono text-foreground/70">{h.event_name}</code>
                    <span className="text-muted-foreground/50 truncate">
                      — {h.description || "No description"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showInherited && inherited.length === 0 && (
            <div className="mt-4 text-xs text-muted-foreground italic">
              No inherited handlers from parent levels.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── EventHandlerCard ──────────────────────────────────

function EventHandlerCard({
  handler: h,
  saving,
  onToggle,
  onSave,
  onDelete,
}: {
  handler: EventHandler;
  saving: boolean;
  onToggle: () => void;
  onSave: (code: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftCode, setDraftCode] = useState(h.handler);

  // Run state
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<ExecutionResult | null>(null);

  // Sync draft when handler changes (e.g., after save)
  useEffect(() => {
    setDraftCode(h.handler);
  }, [h.handler]);

  const badge = levelBadge(h.level);
  const dirty = draftCode !== h.handler;

  const handleRun = useCallback(async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const result = await runEventHandler(draftCode, {}, h.event_name);
      setRunResult(result);
    } catch (err: any) {
      setRunResult({
        success: false,
        result: null,
        stdout: "",
        stderr: "",
        execution_time_ms: 0,
        error: err.message,
      });
    } finally {
      setRunning(false);
    }
  }, [draftCode, h.event_name]);

  return (
    <Card
      className={`border-l-4 ${eventColor(h.event_name)}`}
      size="sm"
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>
              {badge.label}
            </span>
            <code className="font-mono text-xs">{h.event_name}</code>
            {h.description && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[200px] hidden sm:inline">
                — {h.description}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={h.enabled}
                onCheckedChange={onToggle}
                disabled={saving}
              />
              <span className="text-[10px] text-muted-foreground min-w-[40px]">
                {h.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <Textarea
            value={draftCode}
            onChange={(e) => {
              setDraftCode(e.target.value);
              setEditing(true);
            }}
            onFocus={() => setEditing(true)}
            className={`min-h-[60px] text-xs font-mono bg-muted/30 ${
              !h.enabled ? "opacity-50" : ""
            }`}
            placeholder="# No handler code yet"
            disabled={saving}
          />
          {saving && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </div>
      </CardContent>

      {/* ─── Run result output ──────────────────────────── */}
      {runResult && (
        <div className={`mx-4 mb-2 rounded-md border p-2.5 text-xs font-mono ${
          runResult.success
            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
            : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
        }`}>
          <div className="flex items-center gap-1.5 mb-1">
            {runResult.success ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            )}
            <span className={`font-semibold ${runResult.success ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
              {runResult.success ? "Success" : "Error"}
            </span>
            <span className="text-muted-foreground ml-auto">{runResult.execution_time_ms}ms</span>
          </div>
          {runResult.error && (
            <div className="text-red-600 dark:text-red-400 mb-1 whitespace-pre-wrap">{runResult.error}</div>
          )}
          {runResult.stdout && (
            <div className="text-foreground/80 mb-1">
              <span className="text-[10px] font-semibold text-muted-foreground">stdout:</span>
              <pre className="whitespace-pre-wrap mt-0.5">{runResult.stdout}</pre>
            </div>
          )}
          {runResult.stderr && (
            <div className="text-amber-600 dark:text-amber-400">
              <span className="text-[10px] font-semibold text-muted-foreground">stderr:</span>
              <pre className="whitespace-pre-wrap mt-0.5">{runResult.stderr}</pre>
            </div>
          )}
          {runResult.success && runResult.result !== undefined && runResult.result !== null && (
            <div className="mt-1 pt-1 border-t border-emerald-200 dark:border-emerald-800">
              <span className="text-[10px] font-semibold text-muted-foreground">returned:</span>
              <pre className="whitespace-pre-wrap mt-0.5 text-foreground">{JSON.stringify(runResult.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      <CardFooter className="flex justify-end gap-1.5">
        {dirty && (
          <Button
            variant="default"
            size="xs"
            onClick={() => onSave(draftCode)}
            disabled={saving}
          >
            <Save className="h-3 w-3" />
            Save
          </Button>
        )}
        {!editing && !dirty && (
          <span className="text-[10px] text-muted-foreground px-1">
            <CheckCircle2 className="h-3 w-3 inline mr-0.5 text-emerald-500" />
            Saved
          </span>
        )}
        <Button
          variant="outline"
          size="xs"
          onClick={handleRun}
          disabled={running || saving}
          className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950/30"
        >
          {running ? (
            <span className="flex items-center gap-1">
              <div className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Running...
            </span>
          ) : (
            <>
              <Play className="h-3 w-3" />
              Run
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={onDelete}
          disabled={saving}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}
