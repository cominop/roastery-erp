// Merged utilities: shadcn/ui cn() + accessclone form helpers
// Ported from accessclone/ui-react/src/lib/utils.ts

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Control, ControlType, HotkeySegment } from "@/types";

// ─── shadcn ───────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Coordinate helpers ───────────────────────────────

/** Convert Access twips to CSS pixels (1 twip = 1/1440 inch, 96 DPI → 15 twips/px) */
export function twipsToPx(twips: number): number {
  return twips / 15;
}

export function snapToGrid(value: number, ctrlKey: boolean, gridSize = 8): number {
  if (ctrlKey) return value;
  return Math.round(value / gridSize) * gridSize;
}

// ─── Color conversion ─────────────────────────────────

/** Convert Access BGR integer to CSS hex (#RRGGBB) */
export function accessColorToHex(color: number | string | null | undefined): string {
  if (color == null) return "transparent";
  if (typeof color === "string") {
    if (color.startsWith("#")) return color;
    const n = parseInt(color, 10);
    if (isNaN(n)) return "transparent";
    color = n;
  }
  if (color < 0) color = 0x1000000 + color; // handle negative (Access system colors)
  const b = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const r = color & 0xff;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ─── Control style generation ─────────────────────────

const TRANSPARENT_BY_DEFAULT = new Set<ControlType>([
  "label",
  "option-button",
  "check-box",
  "toggle-button",
  "image",
  "line",
]);

export function controlStyle(ctrl: Control): React.CSSProperties {
  const style: React.CSSProperties = {
    position: "absolute",
    left: twipsToPx(ctrl.left),
    top: twipsToPx(ctrl.top),
    width: twipsToPx(ctrl.width),
    height: twipsToPx(ctrl.height),
  };

  // Font
  if (ctrl["font-name"]) style.fontFamily = `"${ctrl["font-name"]}", sans-serif`;
  if (ctrl["font-size"]) style.fontSize = ctrl["font-size"] * 0.75; // Access pts → CSS px (approximate)
  if (ctrl["font-bold"]) style.fontWeight = "bold";
  if (ctrl["font-italic"]) style.fontStyle = "italic";

  // Colors
  const isTransparent = TRANSPARENT_BY_DEFAULT.has(ctrl.type);
  const backStyle = ctrl["back-style"] ?? (isTransparent ? 0 : 1);
  style.color = accessColorToHex(ctrl["fore-color"] ?? (isTransparent ? undefined : 0));
  style.backgroundColor =
    backStyle === 0 ? "transparent" : accessColorToHex(ctrl["back-color"] ?? undefined);

  // Border
  if (ctrl["border-color"] != null) {
    style.borderColor = accessColorToHex(ctrl["border-color"]);
    style.borderStyle = "solid";
  }

  // Text alignment
  const alignMap: Record<number, React.CSSProperties["textAlign"]> = {
    1: "left",
    2: "center",
    3: "right",
  };
  if (ctrl["text-align"] && alignMap[ctrl["text-align"]]) {
    style.textAlign = alignMap[ctrl["text-align"]];
  }

  return style;
}

/**
 * Like controlStyle but WITHOUT position/left/top/width/height.
 * Used for controls that participate in CSS Grid layout instead of absolute positioning.
 */
export function controlAppearance(ctrl: Control): React.CSSProperties {
  const style: React.CSSProperties = {};

  // Font
  if (ctrl["font-name"]) style.fontFamily = `"${ctrl["font-name"]}", sans-serif`;
  if (ctrl["font-size"]) style.fontSize = ctrl["font-size"] * 0.75;
  if (ctrl["font-bold"]) style.fontWeight = "bold";
  if (ctrl["font-italic"]) style.fontStyle = "italic";

  // Colors
  const isTransparent = TRANSPARENT_BY_DEFAULT.has(ctrl.type);
  const backStyle = ctrl["back-style"] ?? (isTransparent ? 0 : 1);
  const fc = ctrl["fore-color"] ?? (isTransparent ? undefined : 0);
  if (fc != null) style.color = accessColorToHex(fc);
  style.backgroundColor =
    backStyle === 0 ? "transparent" : accessColorToHex(ctrl["back-color"] ?? undefined);

  // Border
  if (ctrl["border-color"] != null) {
    style.borderColor = accessColorToHex(ctrl["border-color"]);
    style.borderStyle = "solid";
  }

  // Text alignment
  const alignMap: Record<number, React.CSSProperties["textAlign"]> = {
    1: "left",
    2: "center",
    3: "right",
  };
  if (ctrl["text-align"] && alignMap[ctrl["text-align"]]) {
    style.textAlign = alignMap[ctrl["text-align"]];
  }

  // For labels, set a min-width to ensure alignment
  if (ctrl.type === "label") {
    style.display = "flex";
    style.alignItems = "center";
  }

  // For text-boxes, fill the cell width
  if (ctrl.type === "text-box" || ctrl.type === "combo-box" || ctrl.type === "check-box") {
    style.width = "100%";
  }

  return style;
}

// ─── Hotkey parsing ───────────────────────────────────

export function parseHotkeyText(s: string | null | undefined): HotkeySegment[] {
  if (!s) return [];
  const segments: HotkeySegment[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "&" && i + 1 < s.length) {
      if (s[i + 1] === "&") {
        segments.push("&" as unknown as HotkeySegment);
        i += 2;
      } else {
        segments.push({ hotkey: true, char: s[i + 1] });
        i += 2;
      }
    } else {
      // Accumulate plain text
      let j = i;
      while (j < s.length && s[j] !== "&") j++;
      segments.push(s.slice(i, j) as unknown as HotkeySegment);
      i = j;
    }
  }
  return segments;
}

export function extractHotkey(s: string | null | undefined): string | null {
  if (!s) return null;
  const idx = s.indexOf("&");
  if (idx >= 0 && idx + 1 < s.length && s[idx + 1] !== "&") {
    return s[idx + 1].toLowerCase();
  }
  return null;
}

export function stripAccessHotkey(s: string): string {
  return s.replace(/&(.)/g, "$1").replace(/&&/g, "&");
}

// ─── Display text ─────────────────────────────────────

export function displayText(ctrl: Control): string {
  const raw = (ctrl.text as string) || ctrl.caption || "";
  // Decode Access octal escape sequences: \015 = CR, \012 = LF
  return raw.replace(/\\015\\012/g, "\n").replace(/\\015/g, "\n").replace(/\\012/g, "\n");
}

// ─── Section helpers ──────────────────────────────────

export function getSectionControls(
  def: Record<string, unknown>,
  section: string
): Control[] {
  const sec = (def[section] as Record<string, unknown>) ?? {};
  return (sec.controls as Control[]) ?? [];
}

export function getSectionHeight(
  def: Record<string, unknown>,
  section: string
): number {
  const sec = (def[section] as Record<string, unknown>) ?? {};
  return (sec.height as number) ?? 0;
}

// ─── Input masks ──────────────────────────────────────

interface ParsedMask {
  pattern: string;
  storeLiterals: boolean;
  placeholderChar: string;
}

export function parseInputMask(
  maskStr: string | null | undefined
): ParsedMask | null {
  if (!maskStr || maskStr.toLowerCase().trim() === "password") return null;
  const parts = maskStr.split(";");
  const pattern = parts[0] || "";
  const placeholderChar = parts[2] || "_";
  const storeLiterals = parts[1] !== "0";
  return { pattern, storeLiterals, placeholderChar: placeholderChar[0] };
}

export function maskPlaceholder(pattern: string, placeholderChar = "_"): string {
  let result = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) {
      result += pattern[i + 1];
      i += 2;
    } else if ("09#L?Aa&C".includes(ch)) {
      result += placeholderChar;
      i++;
    } else if ("<>!".includes(ch)) {
      i++; // skip case/fill markers
    } else {
      result += ch;
      i++;
    }
  }
  return result;
}

// ─── Key normalization: camelCase → kebab-case ────────

/** Convert camelCase string to kebab-case */
function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Recursively convert all object keys from camelCase to kebab-case */
export function normalizeKeys(obj: unknown, depth = 0): unknown {
  if (depth > 50) return obj; // prevent infinite recursion
  if (Array.isArray(obj)) return obj.map(item => normalizeKeys(item, depth + 1));
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const entry of Object.entries(obj as Record<string, unknown>)) {
      const [key, value] = entry;
      result[camelToKebab(key)] = normalizeKeys(value, depth + 1);
    }
    return result;
  }
  return obj;
}

// ─── Field binding ────────────────────────────────────

export function resolveControlField(ctrl: Control): string | null {
  // Try both kebab-case and camelCase
  const src = (ctrl as Record<string, unknown>)["control-source"]
    ?? (ctrl as Record<string, unknown>)["controlSource"];
  if (!src) return null;
  const s = String(src).trim();
  if (s.startsWith("=")) return s; // expression — return raw
  // Strip table-qualified prefixes like "Customers.CompanyName" → "CompanyName"
  const parts = s.split(".");
  let bare = parts[parts.length - 1]; // take the last part after any dot
  bare = bare.toLowerCase();

  // Common-name fallback map: Access field names → PostgreSQL column names
  const nameMap: Record<string, string> = {
    'clientname': 'companyname',
    'client name': 'companyname',
    'street address': 'billingaddress',
    'address': 'billingaddress',
    'province': 'stateorprovince',
    'state/province': 'stateorprovince',
    'state': 'stateorprovince',
    'phone': 'phonenumber',
    'fax': 'faxnumber',
    'zip': 'postalcode',
    'zipcode': 'postalcode',
    'post code': 'postalcode',
    'ext': 'phoneextension',
    'extension': 'phoneextension',
    'phone ext': 'phoneextension',
    'equipment': 'assetid',
    'asset': 'assetid',
    'product': 'productid',
    'orderid': 'orderid',
    'order id': 'orderid',
  };

  return nameMap[bare] ?? bare;
}

export function isExpression(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("=");
}