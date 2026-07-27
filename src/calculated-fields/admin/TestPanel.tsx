/**
 * TestPanel — modal dialog for testing calculated field expressions
 * with sample values before saving the field definition.
 *
 * Auto-generates input fields from the expression's detected dependencies,
 * sends the expression + values to the server-side evaluator, and displays
 * the computed result.
 */

import { useState, useCallback } from "react";
import { Loader2, TestTube, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { testExpression } from "@/calculated-fields/api/calculatedFieldsApi";

// ─── Props ───────────────────────────────────────────────

interface TestPanelProps {
  open: boolean;
  onClose: () => void;
  expression: string;
  dependsOn: string[];
}

// ─── Result type helpers ─────────────────────────────────

function formatResult(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    // Render as-is; the evaluator returns plain numbers
    return String(value);
  }
  if (value instanceof Date || typeof value === "string") {
    // Try to detect if it looks like a date
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      try {
        return new Date(str).toLocaleDateString();
      } catch {
        return str;
      }
    }
    return str;
  }
  return String(value);
}

function resultTypeLabel(value: unknown): string {
  if (value === null || value === undefined) return "Null";
  if (typeof value === "boolean") return "Boolean";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "Integer" : "Number";
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "Date";
    return "Text";
  }
  return typeof value;
}

// ─── Component ───────────────────────────────────────────

export default function TestPanel({
  open,
  onClose,
  expression,
  dependsOn,
}: TestPanelProps) {
  // Sample values state: auto-init from dependsOn
  const [sampleValues, setSampleValues] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      for (const dep of dependsOn) {
        init[dep] = "";
      }
      return init;
    },
  );

  // Result state
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: true; value: unknown } | { ok: false; error: string } | null>(null);

  // Reset state when dialog opens
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      } else {
        // Re-initialise sample values when opening
        const init: Record<string, string> = {};
        for (const dep of dependsOn) {
          init[dep] = "";
        }
        setSampleValues(init);
        setResult(null);
        setTesting(false);
      }
    },
    [onClose, dependsOn],
  );

  // Update a sample value field
  const updateValue = useCallback(
    (field: string, value: string) => {
      setSampleValues((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  // Run the test
  const handleRunTest = useCallback(async () => {
    if (!expression.trim()) return;

    setTesting(true);
    setResult(null);

    try {
      // Convert string values to appropriate types for the evaluator
      const parsedValues: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(sampleValues)) {
        if (val.trim() === "") {
          parsedValues[key] = null;
        } else {
          // Try to parse as number first
          const num = Number(val);
          if (!isNaN(num) && val.trim() !== "") {
            parsedValues[key] = num;
          } else {
            parsedValues[key] = val;
          }
        }
      }

      const response = await testExpression(expression, parsedValues);
      setResult({ ok: true, value: response.result });
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  }, [expression, sampleValues]);

  // ── Render ─────────────────────────────────────────────

  const hasExpression = expression.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Test Expression
          </DialogTitle>
        </DialogHeader>

        {/* Expression (read-only) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Expression
          </label>
          <div className="rounded border bg-muted/30 px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
            {expression || (
              <span className="italic text-muted-foreground">(empty)</span>
            )}
          </div>
        </div>

        {/* Test Values */}
        {dependsOn.length === 0 ? (
          <div className="rounded border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            No dependencies to test. Add field references to your expression
            first.
          </div>
        ) : (
          <div className="rounded border">
            <div className="px-3 py-1.5 border-b bg-muted/20 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Test Values
            </div>
            <div className="p-3 space-y-2">
              {dependsOn.map((field) => (
                <div
                  key={field}
                  className="grid grid-cols-[1fr_2fr] items-center gap-2"
                >
                  <label className="text-xs font-mono text-right text-muted-foreground truncate">
                    {field}
                  </label>
                  <input
                    type="text"
                    value={sampleValues[field] ?? ""}
                    onChange={(e) => updateValue(field, e.target.value)}
                    placeholder={
                      /price|cost|amount|count|qty|quantity|rate|total|number|value/i.test(
                        field,
                      )
                        ? "0.00"
                        : "Enter value..."
                    }
                    className="h-7 text-xs border rounded px-2 bg-background font-mono w-full"
                  />
                </div>
              ))}
            </div>

            {/* Result display */}
            {result && (
              <div
                className={cn(
                  "px-3 py-2 border-t flex items-start gap-2",
                  result.ok
                    ? "bg-emerald-50 dark:bg-emerald-950/20"
                    : "bg-destructive/10",
                )}
              >
                {result.ok ? (
                  <>
                    <TestTube className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          Result:
                        </span>
                        <span className="text-sm font-mono font-bold text-foreground break-all">
                          {formatResult(result.value)}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        Type: {resultTypeLabel(result.value)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-destructive">
                        Error:
                      </span>
                      <span className="text-xs text-destructive block font-mono">
                        {result.error}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-7 text-xs"
          >
            Close
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleRunTest}
            disabled={!hasExpression || testing}
          >
            {testing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                Testing...
              </>
            ) : (
              <>
                <FlaskConical className="h-3.5 w-3.5 mr-1" />
                Run Test
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}