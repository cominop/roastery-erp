// TextBoxControl — Access text-box → shadcn Input/Textarea
// Adapted from accessclone/ui-react/src/views/FormEditor/controls/TextBoxControl.tsx

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseInputMask, maskPlaceholder } from "@/lib/utils";
import type { Control } from "@/types";

interface Props {
  ctrl: Control;
  field: string | null;
  value: unknown;
  onChange: (field: string, value: unknown) => void;
  allowEdits: boolean;
  autoFocus?: boolean;
  isNew?: boolean;
  tabIdx?: number;
}

function isHtmlContent(s: unknown): boolean {
  return typeof s === "string" && /<[a-zA-Z][^>]*>/.test(s);
}

export default function TextBoxControl({
  ctrl,
  field,
  value,
  onChange,
  allowEdits,
  autoFocus,
  isNew,
  tabIdx,
}: Props) {
  const mask = parseInputMask(ctrl["input-mask"] as string | undefined);
  const password =
    ((ctrl["input-mask"] as string) || "").toLowerCase().trim() === "password";
  const placeholder = mask
    ? maskPlaceholder(mask.pattern, mask.placeholderChar)
    : undefined;
  const maxLen = placeholder ? placeholder.length : undefined;
  const rich = ctrl["text-format"] === 1 || isHtmlContent(String(value ?? ""));
  const memo = (ctrl.height ?? 0) > 600; // > 600 twips = ~40px → memo field
  const multiLine =
    memo ||
    (typeof value === "string" && value.includes("\n"));

  const strVal = value == null ? "" : String(value);

  if (rich) {
    return (
      <div
        className="p-1 text-sm border rounded min-h-[24px]"
        dangerouslySetInnerHTML={{ __html: strVal }}
      />
    );
  }

  if (multiLine) {
    return (
      <Textarea
        className={`w-full resize-none text-xs rounded-[var(--app-field-border-radius,6px)] ${memo ? "overflow-y-auto" : ""}`}
        rows={memo ? 6 : undefined}
        value={strVal}
        readOnly={!allowEdits}
        autoFocus={isNew && autoFocus}
        placeholder={placeholder}
        tabIndex={tabIdx}
        onChange={(e) => {
          if (field && allowEdits) onChange(field, e.target.value);
        }}
      />
    );
  }

  return (
    <Input
      className="h-full w-full text-xs rounded-[var(--app-field-border-radius,6px)]"
      type={password ? "password" : "text"}
      value={strVal}
      readOnly={!allowEdits}
      autoFocus={isNew && autoFocus}
      placeholder={placeholder}
      maxLength={maxLen}
      tabIndex={tabIdx}
      onChange={(e) => {
        if (field && allowEdits) onChange(field, e.target.value);
      }}
    />
  );
}