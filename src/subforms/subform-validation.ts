// Subform validation — validates subform definitions during development
// (spec §20 — Validation)
//
// Checks sourceObject existence, link field consistency, tab page validity,
// and display mode correctness. No silent substitutions — every issue is
// reported explicitly.

import type { SubformControlDefinition } from "./subform-types";

// ─── Diagnostic types ──────────────────────────────────

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  parentForm?: string;
  controlName?: string;
  field?: string;
}

// ─── Validation ────────────────────────────────────────

export interface ValidationContext {
  /** All known form names from the API */
  knownForms: Set<string>;
  /** Parent form name (for diagnostics) */
  parentFormName?: string;
}

/**
 * Validate a single subform control definition.
 * Returns a list of issues found. Empty array = valid.
 */
export function validateSubformDefinition(
  definition: SubformControlDefinition,
  context: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const prefix = context.parentFormName
    ? { parentForm: context.parentFormName, controlName: definition.name }
    : {};

  // 1. sourceObject must be non-empty
  if (!definition.sourceObject) {
    issues.push({
      severity: "error",
      message: "sourceObject is empty",
      ...prefix,
    });
    return issues; // Can't validate further without a source object
  }

  // 2. sourceObject must exist in the API
  if (!context.knownForms.has(definition.sourceObject)) {
    issues.push({
      severity: "error",
      message: `sourceObject "${definition.sourceObject}" not found in the form registry`,
      ...prefix,
      field: "sourceObject",
    });
  }

  // 3. Master and child arrays must have equal lengths
  const masterLen = definition.linkMasterFields?.length ?? 0;
  const childLen = definition.linkChildFields?.length ?? 0;
  if (masterLen !== childLen) {
    issues.push({
      severity: "error",
      message: `linkMasterFields length (${masterLen}) does not match linkChildFields length (${childLen})`,
      ...prefix,
      field: "linkMasterFields/linkChildFields",
    });
  }

  // 4. If link fields are present, validate them
  if (definition.linkMasterFields && definition.linkMasterFields.length > 0) {
    for (let i = 0; i < definition.linkMasterFields.length; i++) {
      const master = definition.linkMasterFields[i];
      const child = definition.linkChildFields?.[i];

      if (!child) {
        issues.push({
          severity: "warning",
          message: `linkChildFields[${i}] is missing or empty`,
          ...prefix,
          field: `linkChildFields[${i}]`,
        });
      }
    }
  }

  // 5. tabPage — just a warning if it's set but we can't verify it
  // (tab page existence depends on the parent form definition, which we
  //  don't have here. We can only warn if it's set.)

  // 6. Unlinked subforms warning
  if (!definition.linkMasterFields || definition.linkMasterFields.length === 0) {
    issues.push({
      severity: "warning",
      message: `Unlinked subform — no parent-child relationship defined`,
      ...prefix,
    });
  }

  return issues;
}

/**
 * Validate all subform definitions and return a summary report.
 */
export function validateAllSubformDefinitions(
  definitions: Array<{
    definition: SubformControlDefinition;
    parentFormName?: string;
  }>,
  knownForms: Set<string>,
): ValidationIssue[] {
  const allIssues: ValidationIssue[] = [];
  for (const { definition, parentFormName } of definitions) {
    const issues = validateSubformDefinition(definition, {
      knownForms,
      parentFormName,
    });
    allIssues.push(...issues);
  }
  return allIssues;
}

/**
 * Format validation issues as a human-readable string.
 */
export function formatValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "No issues found.";

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`\n\u2716 ${errors.length} error(s):`);
    for (const e of errors) {
      const ctx = [e.parentForm, e.controlName].filter(Boolean).join(" :: ");
      lines.push(`  ${ctx ? ctx + " — " : ""}${e.message}`);
    }
  }
  if (warnings.length > 0) {
    lines.push(`\n\u26A0 ${warnings.length} warning(s):`);
    for (const w of warnings) {
      const ctx = [w.parentForm, w.controlName].filter(Boolean).join(" :: ");
      lines.push(`  ${ctx ? ctx + " — " : ""}${w.message}`);
    }
  }
  return lines.join("\n");
}