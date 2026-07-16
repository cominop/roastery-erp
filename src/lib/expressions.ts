/**
 * Access-style expression evaluator
 * Ported from accessclone/ui-react/src/lib/expressions.ts
 *
 * Supports: math, string concat, comparisons, logic,
 * Access built-ins (IIF, NZ, ISNULL, NOW, DATE, FORMAT, LEFT, RIGHT, MID, etc.),
 * and aggregates (SUM, COUNT, AVG, MIN, MAX).
 */

import type { ExprContext } from "@/types";

// ─── Token types ──────────────────────────────────────

interface Token {
  type:
    | "number"
    | "string"
    | "date"
    | "field-ref"
    | "identifier"
    | "operator"
    | "paren-open"
    | "paren-close"
    | "comma";
  value: string | number;
}

// ─── AST types ────────────────────────────────────────

export type AstNode =
  | { type: "literal"; value: unknown }
  | { type: "string"; value: string }
  | { type: "date"; value: Date }
  | { type: "field-ref"; name: string }
  | { type: "binary-op"; op: string; left: AstNode; right: AstNode }
  | { type: "concat"; left: AstNode; right: AstNode }
  | { type: "not-op"; operand: AstNode }
  | { type: "and-op"; left: AstNode; right: AstNode }
  | { type: "or-op"; left: AstNode; right: AstNode }
  | { type: "call"; fn: string; args: AstNode[] }
  | { type: "aggregate"; fn: string; arg: AstNode };

// ─── Lexer ────────────────────────────────────────────

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers
    if (/[\d.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[\d.]/.test(input[i])) {
        num += input[i++];
      }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = "";
      i++;
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) {
          str += input[++i];
        } else {
          str += input[i];
        }
        i++;
      }
      i++; // closing quote
      tokens.push({ type: "string", value: str });
      continue;
    }

    // Date literals: #MM/DD/YYYY#
    if (ch === "#") {
      let date = "";
      i++;
      while (i < input.length && input[i] !== "#") {
        date += input[i++];
      }
      i++; // closing #
      tokens.push({ type: "date", value: date });
      continue;
    }

    // Field references: [FieldName]
    if (ch === "[") {
      let ref = "";
      i++;
      while (i < input.length && input[i] !== "]") {
        ref += input[i++];
      }
      i++; // closing ]
      tokens.push({ type: "field-ref", value: ref });
      continue;
    }

    // Operators
    if ("+-*/=<>".includes(ch)) {
      let op = ch;
      i++;
      if (ch === "<" && input[i] === ">") {
        op = "<>";
        i++;
      } else if (ch === ">" && input[i] === "=") {
        op = ">=";
        i++;
      } else if (ch === "<" && input[i] === "=") {
        op = "<=";
        i++;
      }
      tokens.push({ type: "operator", value: op });
      continue;
    }

    // &
    if (ch === "&") {
      tokens.push({ type: "operator", value: "&" });
      i++;
      continue;
    }

    // Parentheses and comma
    if (ch === "(") { tokens.push({ type: "paren-open", value: "(" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "paren-close", value: ")" }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma", value: "," }); i++; continue; }

    // Identifiers (function names, field names, keywords)
    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < input.length && /[a-zA-Z0-9_.]/.test(input[i])) {
        id += input[i++];
      }
      tokens.push({ type: "identifier", value: id });
      continue;
    }

    // Unknown — skip
    i++;
  }

  return tokens;
}

// ─── Parser (recursive descent) ───────────────────────

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: string, value?: string): Token {
    const t = this.peek();
    if (!t || t.type !== type || (value && t.value !== value)) {
      throw new Error(`Expected ${type}${value ? ` "${value}"` : ""}`);
    }
    return this.consume();
  }

  // expression → orExpr
  parse(): AstNode {
    return this.orExpr();
  }

  // orExpr → andExpr ("OR" andExpr)*
  private orExpr(): AstNode {
    let left = this.andExpr();
    while (this.peek()?.type === "identifier" && (this.peek() as Token).value === "OR") {
      this.consume();
      left = { type: "or-op", left, right: this.andExpr() };
    }
    return left;
  }

  // andExpr → notExpr ("AND" notExpr)*
  private andExpr(): AstNode {
    let left = this.notExpr();
    while (this.peek()?.type === "identifier" && (this.peek() as Token).value === "AND") {
      this.consume();
      left = { type: "and-op", left, right: this.notExpr() };
    }
    return left;
  }

  // notExpr → "NOT" notExpr | comparison
  private notExpr(): AstNode {
    if (this.peek()?.type === "identifier" && (this.peek() as Token).value === "NOT") {
      this.consume();
      return { type: "not-op", operand: this.notExpr() };
    }
    return this.comparison();
  }

  // comparison → concatExpr (("="|"<>"|"<"|">"|"<="|">=") concatExpr)?
  private comparison(): AstNode {
    let left = this.concatExpr();
    const t = this.peek();
    if (t?.type === "operator" && ["=", "<>", "<", ">", "<=", ">="].includes(String(t.value))) {
      this.consume();
      left = { type: "binary-op", op: String(t.value), left, right: this.concatExpr() };
    }
    return left;
  }

  // concatExpr → additiveExpr ("&" additiveExpr)*
  private concatExpr(): AstNode {
    let left = this.additiveExpr();
    while (this.peek()?.type === "operator" && (this.peek() as Token).value === "&") {
      this.consume();
      left = { type: "concat", left, right: this.additiveExpr() };
    }
    return left;
  }

  // additiveExpr → multExpr (("+"|"-") multExpr)*
  private additiveExpr(): AstNode {
    let left = this.multExpr();
    while (
      this.peek()?.type === "operator" &&
      ["+", "-"].includes(String((this.peek() as Token).value))
    ) {
      const op = String(this.consume().value);
      left = { type: "binary-op", op, left, right: this.multExpr() };
    }
    return left;
  }

  // multExpr → unaryExpr (("*"|"/") unaryExpr)*
  private multExpr(): AstNode {
    let left = this.unaryExpr();
    while (
      this.peek()?.type === "operator" &&
      ["*", "/"].includes(String((this.peek() as Token).value))
    ) {
      const op = String(this.consume().value);
      left = { type: "binary-op", op, left, right: this.unaryExpr() };
    }
    return left;
  }

  // unaryExpr → "-" primary | primary
  private unaryExpr(): AstNode {
    if (this.peek()?.type === "operator" && (this.peek() as Token).value === "-") {
      this.consume();
      return { type: "binary-op", op: "-", left: { type: "literal", value: 0 }, right: this.primary() };
    }
    return this.primary();
  }

  // primary → literal | field-ref | call | "(" expression ")"
  private primary(): AstNode {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end of expression");

    if (t.type === "number") {
      this.consume();
      return { type: "literal", value: t.value };
    }
    if (t.type === "string") {
      this.consume();
      return { type: "string", value: String(t.value) };
    }
    if (t.type === "date") {
      this.consume();
      return { type: "date", value: new Date(String(t.value)) };
    }
    if (t.type === "field-ref") {
      this.consume();
      return { type: "field-ref", name: String(t.value) };
    }

    // Function call or aggregate
    if (t.type === "identifier") {
      const name = String(t.value);
      this.consume();

      if (this.peek()?.type === "paren-open") {
        this.consume(); // (
        const args: AstNode[] = [];
        if (this.peek()?.type !== "paren-close") {
          args.push(this.parse());
          while (this.peek()?.type === "comma") {
            this.consume();
            args.push(this.parse());
          }
        }
        this.expect("paren-close");

        // Heuristic: uppercase = aggregate function
        if (name === name.toUpperCase() && name.length >= 3) {
          return { type: "aggregate", fn: name, arg: args[0] ?? { type: "literal", value: null } };
        }
        return { type: "call", fn: name, args };
      }

      return { type: "field-ref", name };
    }

    if (t.type === "paren-open") {
      this.consume();
      const node = this.parse();
      this.expect("paren-close");
      return node;
    }

    throw new Error(`Unexpected token: ${t.type} "${t.value}"`);
  }
}

// ─── Evaluator ────────────────────────────────────────

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  if (typeof v === "boolean") return v ? -1 : 0;
  return 0;
}

function toString(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "";
  if (typeof v === "boolean") return v;
  return true;
}

function fieldLookup(name: string, ctx: ExprContext): unknown {
  const rec = ctx.record ?? {};
  // Exact match
  if (rec[name] !== undefined) return rec[name];
  // Case-insensitive
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(rec)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

function evaluate(node: AstNode, ctx: ExprContext): unknown {
  switch (node.type) {
    case "literal":
      return node.value;
    case "string":
      return node.value;
    case "date":
      return node.value;
    case "field-ref":
      return fieldLookup(node.name, ctx);

    case "concat":
      return toString(evaluate(node.left, ctx)) + toString(evaluate(node.right, ctx));

    case "not-op":
      return truthy(evaluate(node.operand, ctx)) ? 0 : -1;
    case "and-op":
      return truthy(evaluate(node.left, ctx)) && truthy(evaluate(node.right, ctx)) ? -1 : 0;
    case "or-op":
      return truthy(evaluate(node.left, ctx)) || truthy(evaluate(node.right, ctx)) ? -1 : 0;

    case "binary-op": {
      const l = evaluate(node.left, ctx);
      const r = evaluate(node.right, ctx);
      switch (node.op) {
        case "+": return toNumber(l) + toNumber(r);
        case "-": return toNumber(l) - toNumber(r);
        case "*": return toNumber(l) * toNumber(r);
        case "/": return toNumber(r) === 0 ? null : toNumber(l) / toNumber(r);
        case "=": return l === r ? -1 : 0;
        case "<>": return l !== r ? -1 : 0;
        case "<": return toNumber(l) < toNumber(r) ? -1 : 0;
        case ">": return toNumber(l) > toNumber(r) ? -1 : 0;
        case "<=": return toNumber(l) <= toNumber(r) ? -1 : 0;
        case ">=": return toNumber(l) >= toNumber(r) ? -1 : 0;
        default: return null;
      }
    }

    case "call":
      return callFunction(node.fn, node.args, ctx);

    case "aggregate":
      return callAggregate(node.fn, node.arg, ctx);
  }
}

function callFunction(fn: string, args: AstNode[], ctx: ExprContext): unknown {
  const evaled = args.map((a) => evaluate(a, ctx));

  switch (fn.toLowerCase()) {
    case "iif":
      return truthy(evaled[0]) ? evaled[1] : (evaled[2] ?? null);
    case "nz":
      return evaled[0] != null && evaled[0] !== "" ? evaled[0] : (evaled[1] ?? 0);
    case "isnull":
      return evaled[0] == null || evaled[0] === "" ? -1 : 0;
    case "now":
      return new Date();
    case "date":
      return new Date();

    // String
    case "left":
      return toString(evaled[0]).slice(0, toNumber(evaled[1]));
    case "right":
      return toString(evaled[0]).slice(-toNumber(evaled[1]));
    case "mid":
      return toString(evaled[0]).slice(toNumber(evaled[1]) - 1, toNumber(evaled[1]) - 1 + toNumber(evaled[2]));
    case "len":
      return toString(evaled[0]).length;
    case "trim":
      return toString(evaled[0]).trim();
    case "ucase":
      return toString(evaled[0]).toUpperCase();
    case "lcase":
      return toString(evaled[0]).toLowerCase();
    case "instr": {
      const [str, substr, start] = [toString(evaled[0]), toString(evaled[1]), toNumber(evaled[2] ?? 1)];
      const idx = str.indexOf(substr, start - 1);
      return idx >= 0 ? idx + 1 : 0;
    }
    case "replace":
      return toString(evaled[0]).split(toString(evaled[1])).join(toString(evaled[2]));

    // Math
    case "int":
      return Math.floor(toNumber(evaled[0]));
    case "abs":
      return Math.abs(toNumber(evaled[0]));
    case "val":
      return toNumber(evaled[0]);
    case "round":
      return Math.round(toNumber(evaled[0]) * Math.pow(10, toNumber(evaled[1] ?? 0))) / Math.pow(10, toNumber(evaled[1] ?? 0));

    // Date
    case "dateadd": {
      const [interval, count, date] = evaled;
      const d = date instanceof Date ? new Date(date) : new Date(toString(date));
      const c = toNumber(count);
      switch (toString(interval).toLowerCase().trim()) {
        case "d":
        case "day":
          d.setDate(d.getDate() + c);
          break;
        case "m":
        case "month":
          d.setMonth(d.getMonth() + c);
          break;
        case "y":
        case "year":
          d.setFullYear(d.getFullYear() + c);
          break;
        default:
          return null;
      }
      return d;
    }

    // Format
    case "format": {
      const val = evaled[0];
      const fmt = toString(evaled[1]).toLowerCase();
      return formatValue(val, fmt);
    }

    default:
      return null;
  }
}

function callAggregate(fn: string, arg: AstNode, ctx: ExprContext): unknown {
  const records = ctx.groupRecords ?? ctx.allRecords ?? [];
  if (records.length === 0) return fn === "COUNT" ? 0 : null;

  switch (fn) {
    case "COUNT": {
      if ((arg as { type?: string }).type === "literal" && (arg as { value?: unknown }).value === "*") {
        return records.length;
      }
      return records.filter((r) => truthy(evaluate(arg, { ...ctx, record: r }))).length;
    }
    case "SUM": {
      let sum = 0;
      for (const r of records) sum += toNumber(evaluate(arg, { ...ctx, record: r }));
      return sum;
    }
    case "AVG": {
      const vals = records.map((r) => toNumber(evaluate(arg, { ...ctx, record: r })));
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    case "MIN": {
      let min = Infinity;
      for (const r of records) min = Math.min(min, toNumber(evaluate(arg, { ...ctx, record: r })));
      return min === Infinity ? null : min;
    }
    case "MAX": {
      let max = -Infinity;
      for (const r of records) max = Math.max(max, toNumber(evaluate(arg, { ...ctx, record: r })));
      return max === -Infinity ? null : max;
    }
    default:
      return null;
  }
}

function formatValue(val: unknown, fmt: string): string {
  if (val == null) return "";

  // Dates
  if (val instanceof Date || (typeof val === "string" && !isNaN(Date.parse(val)))) {
    const d = val instanceof Date ? val : new Date(val);
    switch (fmt) {
      case "short date":
        return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
      case "medium date":
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      case "long date":
        return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      case "short time":
        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      case "long time":
        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
      case "general date":
        return d.toLocaleString("en-US");
      default:
        return d.toLocaleDateString();
    }
  }

  // Numbers
  const n = toNumber(val);
  switch (fmt) {
    case "currency":
      return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    case "fixed":
      return n.toFixed(2);
    case "standard":
      return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    case "percent":
      return (n * 100).toFixed(2) + "%";
    case "scientific":
      return n.toExponential(2);
    case "general number":
      return String(n);
    default:
      return String(val);
  }
}

// ─── Public API ───────────────────────────────────────

const parseCache = new Map<string, AstNode>();

export function evaluateExpression(exprString: string, context: ExprContext): unknown {
  // Strip leading =
  const expr = exprString.startsWith("=") ? exprString.slice(1) : exprString;

  try {
    let ast = parseCache.get(expr);
    if (!ast) {
      const tokens = tokenize(expr);
      const parser = new Parser(tokens);
      ast = parser.parse();
      // Cache management
      if (parseCache.size > 500) parseCache.clear();
      parseCache.set(expr, ast);
    }
    return evaluate(ast, context);
  } catch {
    return "#Error";
  }
}