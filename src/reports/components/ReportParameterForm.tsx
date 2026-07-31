/**
 * ReportParameterForm — auto-generated parameter entry dialog for reports.
 *
 * Step 93: Reads the ReportDefinition.parameters array and renders the
 * appropriate input for each type (text, date, number, boolean, select, lookup).
 * Detects date_from/date_to pairs and groups them as a date range.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play, FileDown } from "lucide-react";
import type { ReportDefinition, ReportParameter } from "@/reports/schema/reportSchema";
import { fetchLookupData, renderReport } from "@/reports/api/reportsApi";
import type { LookupOption } from "@/reports/api/reportsApi";

// ─── Date range pair detection ────────────────────────────

/**
 * Detect if a parameter name is a "from" date in a date-range pair.
 */
function isDateFrom(name: string): boolean {
  return /^date_from$/i.test(name);
}

/**
 * Detect if a parameter name is a "to" date in a date-range pair.
 */
function isDateTo(name: string): boolean {
  return /^date_to$/i.test(name);
}

/**
 * Group parameters for layout. Date-range pairs (date_from + date_to)
 * are combined into a single group; everything else stays individual.
 */
function groupParameters(
  params: ReportParameter[],
): { type: "single"; param: ReportParameter }[] {
  const result: { type: "single"; param: ReportParameter }[] = [];
  const used = new Set<number>();

  for (let i = 0; i < params.length; i++) {
    if (used.has(i)) continue;

    const current = params[i];

    // Check if this is a date_from followed by a date_to
    if (
      isDateFrom(current.name) &&
      i + 1 < params.length &&
      isDateTo(params[i + 1].name)
    ) {
      // Group as a date range
      result.push({ type: "single", param: current });
      result.push({ type: "single", param: params[i + 1] });
      used.add(i);
      used.add(i + 1);
    } else {
      result.push({ type: "single", param: current });
      used.add(i);
    }
  }

  return result;
}

// ─── Individual parameter field ──────────────────────────

function ParamField({
  param,
  value,
  onChange,
  error,
}: {
  param: ReportParameter;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  error?: string;
}) {
  const handleChange = useCallback(
    (v: unknown) => onChange(param.name, v),
    [param.name, onChange],
  );

  switch (param.type) {
    case "text":
      return (
        <div className="space-y-1">
          <Label htmlFor={`param-${param.name}`}>
            {param.label}
            {param.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={`param-${param.name}`}
            type="text"
            placeholder={param.placeholder || `Enter ${param.label.toLowerCase()}…`}
            value={String(value ?? param.default ?? "")}
            onChange={(e) => handleChange(e.target.value)}
            className="h-8 text-xs"
          />
          {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>
      );

    case "number":
      return (
        <div className="space-y-1">
          <Label htmlFor={`param-${param.name}`}>
            {param.label}
            {param.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={`param-${param.name}`}
            type="number"
            placeholder={param.placeholder || "0"}
            value={value !== undefined && value !== null ? String(value) : (param.default !== undefined ? String(param.default) : "")}
            onChange={(e) => {
              const v = e.target.value;
              handleChange(v === "" ? null : Number(v));
            }}
            className="h-8 text-xs"
          />
          {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>
      );

    case "date":
      return (
        <div className="space-y-1">
          <Label htmlFor={`param-${param.name}`}>
            {param.label}
            {param.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={`param-${param.name}`}
            type="date"
            value={String(value ?? param.default ?? "")}
            onChange={(e) => handleChange(e.target.value)}
            className="h-8 text-xs"
          />
          {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`param-${param.name}`}
            checked={value === true || value === "true" || value === 1}
            onCheckedChange={(checked) => handleChange(checked === true)}
          />
          <Label htmlFor={`param-${param.name}`} className="text-xs font-normal cursor-pointer">
            {param.label}
            {param.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          {error && <p className="text-[10px] text-destructive ml-6">{error}</p>}
        </div>
      );

    case "select":
      return (
        <SelectField
          param={param}
          value={value}
          onChange={handleChange}
          error={error}
          options={param.options || []}
        />
      );

    case "lookup":
      return (
        <LookupField
          param={param}
          value={value}
          onChange={handleChange}
          error={error}
        />
      );

    default:
      return (
        <div className="space-y-1">
          <Label htmlFor={`param-${param.name}`}>
            {param.label}
            {param.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={`param-${param.name}`}
            type="text"
            placeholder={param.placeholder || ""}
            value={String(value ?? param.default ?? "")}
            onChange={(e) => handleChange(e.target.value)}
            className="h-8 text-xs"
          />
          {error && <p className="text-[10px] text-destructive">{error}</p>}
        </div>
      );
  }
}

// ─── Select field (static options) ───────────────────────

function SelectField({
  param,
  value,
  onChange,
  error,
  options,
}: {
  param: ReportParameter;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  options: string[];
}) {
  const currentValue = String(value ?? param.default ?? "");

  return (
    <div className="space-y-1">
      <Label htmlFor={`param-${param.name}`}>
        {param.label}
        {param.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Select
        value={currentValue}
        onValueChange={(v) => onChange(v)}
      >
        <SelectTrigger
          id={`param-${param.name}`}
          className="h-8 text-xs w-full"
        >
          <SelectValue placeholder={param.placeholder || `Select ${param.label.toLowerCase()}…`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

// ─── Lookup field (dynamically loaded from API) ──────────

function LookupField({
  param,
  value,
  onChange,
  error,
}: {
  param: ReportParameter;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!param.table) return;

    const fetchId = ++fetchIdRef.current;
    setLoading(true);

    fetchLookupData(param.table, {
      idColumn: param.options?.[0] || undefined,
      labelColumn: param.options?.[1] || undefined,
    })
      .then((data) => {
        if (fetchId === fetchIdRef.current) {
          setOptions(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (fetchId === fetchIdRef.current) {
          setOptions([]);
          setLoading(false);
        }
      });
  }, [param.table, param.options]);

  const currentValue = String(value ?? param.default ?? "");

  return (
    <div className="space-y-1">
      <Label htmlFor={`param-${param.name}`}>
        {param.label}
        {param.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {loading ? (
        <div className="flex items-center gap-2 h-8 px-2.5 text-xs text-muted-foreground rounded-lg border border-input">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading options…
        </div>
      ) : options.length === 0 ? (
        <Input
          id={`param-${param.name}`}
          type="text"
          placeholder={param.placeholder || `Enter ${param.label.toLowerCase()}…`}
          value={currentValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs"
        />
      ) : (
        <Select
          value={currentValue}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger
            id={`param-${param.name}`}
            className="h-8 text-xs w-full"
          >
            <SelectValue placeholder={param.placeholder || `Select ${param.label.toLowerCase()}…`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

// ─── Date range group ────────────────────────────────────

function DateRangeGroup({
  fromParam,
  toParam,
  fromValue,
  toValue,
  onFromChange,
  onToChange,
}: {
  fromParam: ReportParameter;
  toParam: ReportParameter;
  fromValue: unknown;
  toValue: unknown;
  onFromChange: (name: string, value: unknown) => void;
  onToChange: (name: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">
        {fromParam.label} &rarr; {toParam.label}
        {(fromParam.required || toParam.required) && (
          <span className="text-destructive ml-0.5">*</span>
        )}
      </Label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            type="date"
            value={String(fromValue ?? "")}
            onChange={(e) => onFromChange(fromParam.name, e.target.value)}
            className="h-8 text-xs w-full"
            placeholder="From"
          />
        </div>
        <span className="text-muted-foreground text-xs shrink-0">&ndash;</span>
        <div className="flex-1">
          <Input
            type="date"
            value={String(toValue ?? "")}
            onChange={(e) => onToChange(toParam.name, e.target.value)}
            className="h-8 text-xs w-full"
            placeholder="To"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────

export interface ReportParameterFormProps {
  report: ReportDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenderComplete?: (result: { url: string; output: string }) => void;
}

export default function ReportParameterForm({
  report,
  open,
  onOpenChange,
  onRenderComplete,
}: ReportParameterFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [format, setFormat] = useState(report.output_formats[0] || "pdf");

  // Reset state when dialog opens with a new report
  useEffect(() => {
    if (open) {
      setValues({});
      setErrors({});
      setSubmitting(false);
      setFormat(report.output_formats[0] || "pdf");
    }
  }, [open, report.id, report.output_formats]);

  const handleChange = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  // Group parameters (detect date range pairs)
  const groupedParams = useMemo(() => groupParameters(report.parameters || []), [report.parameters]);

  // Validate required fields
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    let valid = true;

    for (const param of report.parameters || []) {
      if (param.required) {
        const v = values[param.name];
        if (v === undefined || v === null || v === "") {
          newErrors[param.name] = `${param.label} is required`;
          valid = false;
        }
      }
    }

    setErrors(newErrors);
    return valid;
  }, [report.parameters, values]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    setSubmitting(true);

    try {
      const result = await renderReport(report.id, {
        parameters: values,
        format,
      });

      if (result.success) {
        onRenderComplete?.({ url: result.url, output: result.output });
        onOpenChange(false);
      } else {
        // Backend returned an unexpected shape
        setErrors({ _form: result.error || "Render returned an unknown error" });
        setSubmitting(false);
      }
    } catch (err) {
      setErrors({
        _form: err instanceof Error ? err.message : "Failed to render report",
      });
      setSubmitting(false);
    }
  }, [validate, report.id, values, format, onRenderComplete, onOpenChange]);

  const hasDateFrom = useMemo(
    () => report.parameters?.some((p) => isDateFrom(p.name)),
    [report.parameters],
  );
  const hasDateTo = useMemo(
    () => report.parameters?.some((p) => isDateTo(p.name)),
    [report.parameters],
  );

  // If no parameters and filterable is false, this dialog won't be shown
  // (the listing page handles that). But guard anyway.
  if (!report.filterable && (report.parameters?.length ?? 0) === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-4 w-4" />
            {report.caption}
          </DialogTitle>
          {report.description && (
            <DialogDescription>{report.description}</DialogDescription>
          )}
        </DialogHeader>

        {/* Parameter fields */}
        <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
          {report.parameters && report.parameters.length > 0 ? (
            <>
              {/* Date range pair */}
              {hasDateFrom && hasDateFrom && hasDateTo && (
                (() => {
                  const fromParam = report.parameters!.find((p) => isDateFrom(p.name))!;
                  const toParam = report.parameters!.find((p) => isDateTo(p.name))!;
                  return (
                    <DateRangeGroup
                      fromParam={fromParam}
                      toParam={toParam}
                      fromValue={values[fromParam.name]}
                      toValue={values[toParam.name]}
                      onFromChange={handleChange}
                      onToChange={handleChange}
                    />
                  );
                })()
              )}

              {/* Individual params (skip date_from/date_to as they're handled above) */}
              {report.parameters
                .filter((p) => !isDateFrom(p.name) && !isDateTo(p.name))
                .map((param) => (
                  <ParamField
                    key={param.name}
                    param={param}
                    value={values[param.name]}
                    onChange={handleChange}
                    error={errors[param.name]}
                  />
                ))}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              This report requires no parameters. Click Run to generate.
            </p>
          )}

          {/* Output format selector (if multiple formats) */}
          {report.output_formats.length > 1 && (
            <div className="space-y-1 pt-2 border-t">
              <Label className="text-xs">Output Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {report.output_formats.map((fmt) => (
                    <SelectItem key={fmt} value={fmt}>
                      {fmt.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Form-level error */}
          {errors._form && (
            <p className="text-[10px] text-destructive bg-destructive/5 p-2 rounded">
              {errors._form}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Rendering…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1" />
                Run Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}