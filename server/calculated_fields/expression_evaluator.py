"""Expression evaluator — walks the AST and evaluates against a context.

No eval(), exec(), compile(), or __import__ is used — the evaluator
recursively walks the AST produced by the expression parser and resolves
field references from the context, calls built-in functions, and computes
aggregates across groups of records.

Safe for untrusted expressions: the AST is a pure data structure and the
evaluator only performs defined operations (arithmetic, string manipulation,
comparisons, logical ops, whitelisted functions, whitelisted aggregates).
"""

from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta
from typing import Any, Callable

from .ast_types import (
    BinaryOp,
    Comparison,
    Expression,
    FieldRef,
    FunctionCall,
    LiteralNode,
    UnaryOp,
)
from .eval_context import EvalContext
from .eval_error import EvalError
from .expression_parser import parse_expression


# ─── Type Conversions ──────────────────────────────────────


def to_number(v: Any) -> float | int:
    """Convert a value to a number (Access-style).

    - None/null → 0
    - bool True → -1, bool False → 0
    - string → parseFloat (0 on failure)
    - number → as-is
    """
    if v is None:
        return 0
    if isinstance(v, bool):
        return -1 if v else 0
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0
    return 0


def to_string(v: Any) -> str:
    """Convert a value to a string (Access-style, null → "")."""
    if v is None:
        return ""
    return str(v)


def truthy(v: Any) -> bool:
    """Access-style truthiness.

    - null → False
    - 0 / 0.0 → False
    - "" → False
    - bool → as-is
    - everything else → True
    """
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        return v != ""
    return True


# ─── Field Lookup ──────────────────────────────────────────


def field_lookup(name: str, context: EvalContext) -> Any:
    """Resolve a field name from the context record.

    Tries exact match first, then case-insensitive lookup.
    For table-qualified names (table.field), tries the qualified name
    first, then falls back to the bare field name.
    """
    record = context.record
    if record is None:
        return None

    # Exact match
    if name in record:
        return record[name]

    # For table-qualified names, try bare field name
    if "." in name:
        bare_field = name.split(".", 1)[1]
        if bare_field in record:
            return record[bare_field]

    # Case-insensitive match
    name_lower = name.lower()
    for k, v in record.items():
        if k.lower() == name_lower:
            return v

    # Case-insensitive bare field fallback
    if "." in name:
        bare_field = name.split(".", 1)[1]
        bare_lower = bare_field.lower()
        for k, v in record.items():
            if k.lower() == bare_lower:
                return v

    return None


# ─── Built-in Function Registry ────────────────────────────

# Each function receives a list of already-evaluated argument values
# and returns the result.


def _fn_iif(args: list[Any]) -> Any:
    """IIF(condition, true_value, false_value?)"""
    return args[1] if truthy(args[0]) else (args[2] if len(args) > 2 else None)


def _fn_nz(args: list[Any]) -> Any:
    """NZ(value, alternative?) — return value if not null, else alternative (default 0)."""
    val = args[0]
    if val is not None and val != "":
        return val
    return args[1] if len(args) > 1 else 0


def _fn_isnull(args: list[Any]) -> Any:
    """ISNULL(value) — -1 if null/empty, 0 otherwise."""
    val = args[0]
    return -1 if (val is None or val == "") else 0


def _fn_now(args: list[Any]) -> datetime:
    """NOW() — current date and time."""
    return datetime.now()


def _fn_date(args: list[Any]) -> date:
    """DATE() — current date only."""
    return datetime.now().date()


def _fn_left(args: list[Any]) -> str:
    """LEFT(string, n) — first n characters."""
    s = to_string(args[0])
    n = int(to_number(args[1]))
    return s[:n]


def _fn_right(args: list[Any]) -> str:
    """RIGHT(string, n) — last n characters."""
    s = to_string(args[0])
    n = int(to_number(args[1]))
    return s[-n:] if n > 0 else ""


def _fn_mid(args: list[Any]) -> str:
    """MID(string, start, count?) — substring (1-indexed start)."""
    s = to_string(args[0])
    start = int(to_number(args[1])) - 1  # 1-indexed → 0-indexed
    count = int(to_number(args[2])) if len(args) > 2 else len(s)
    return s[start : start + count]


def _fn_len(args: list[Any]) -> int:
    """LEN(string) — string length."""
    return len(to_string(args[0]))


def _fn_trim(args: list[Any]) -> str:
    """TRIM(string) — strip whitespace."""
    return to_string(args[0]).strip()


def _fn_ucase(args: list[Any]) -> str:
    """UCASE(string) — uppercase."""
    return to_string(args[0]).upper()


def _fn_lcase(args: list[Any]) -> str:
    """LCASE(string) — lowercase."""
    return to_string(args[0]).lower()


def _fn_instr(args: list[Any]) -> int:
    """INSTR(string, substring, start?) — find position (1-indexed, 0 = not found)."""
    s = to_string(args[0])
    sub = to_string(args[1])
    start = max(0, int(to_number(args[2])) - 1) if len(args) > 2 else 0
    idx = s.find(sub, start)
    return idx + 1 if idx >= 0 else 0


def _fn_replace(args: list[Any]) -> str:
    """REPLACE(string, old, new) — replace all occurrences."""
    return to_string(args[0]).replace(to_string(args[1]), to_string(args[2]))


def _fn_int(args: list[Any]) -> int:
    """INT(number) — floor (rounds down)."""
    return int(math.floor(to_number(args[0])))


def _fn_abs(args: list[Any]) -> float:
    """ABS(number) — absolute value."""
    return abs(to_number(args[0]))


def _fn_val(args: list[Any]) -> float:
    """VAL(string) — parse number (0 on failure)."""
    return to_number(args[0])


def _fn_round(args: list[Any]) -> float:
    """ROUND(number, precision?) — round to given decimal places."""
    n = to_number(args[0])
    precision = int(to_number(args[1])) if len(args) > 1 else 0
    factor = 10**precision
    return round(n * factor) / factor


def _fn_dateadd(args: list[Any]) -> datetime | None:
    """DATEADD(interval, count, date) — add interval to date.

    Intervals: 'd'/'day', 'm'/'month', 'y'/'year'/'yyyy'
    """
    interval = to_string(args[0]).strip().lower()
    count = int(to_number(args[1]))
    date_val = args[2]

    # Parse date value
    if isinstance(date_val, datetime):
        d = date_val
    elif isinstance(date_val, date):
        d = datetime.combine(date_val, datetime.min.time())
    elif isinstance(date_val, str):
        try:
            d = datetime.fromisoformat(date_val)
        except (ValueError, TypeError):
            # Try common date string formats
            for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d-%b-%Y"):
                try:
                    d = datetime.strptime(date_val, fmt)
                    break
                except (ValueError, TypeError):
                    continue
            else:
                d = datetime.now()
    else:
        d = datetime.now()

    if interval in ("d", "day"):
        return d + timedelta(days=count)
    if interval in ("m", "month"):
        total_months = d.year * 12 + (d.month - 1) + count
        year = total_months // 12
        month = total_months % 12 + 1
        # Clamp day to month's max days
        import calendar
        max_day = calendar.monthrange(year, month)[1]
        return d.replace(year=year, month=month, day=min(d.day, max_day))
    if interval in ("y", "year", "yyyy"):
        try:
            return d.replace(year=d.year + count)
        except ValueError:
            import calendar
            day = min(d.day, calendar.monthrange(d.year + count, d.month)[1])
            return d.replace(year=d.year + count, day=day)
    return None


def _fn_datediff(args: list[Any]) -> int | None:
    """DATEDIFF(unit, date1, date2) — difference between two dates.

    Supports units: 'day'/'d', 'month'/'m', 'year'/'yyyy',
    'hour'/'h', 'minute'/'n', 'second'/'s'
    Returns integer count.
    """
    unit = to_string(args[0]).strip().lower()
    d1_val = args[1]
    d2_val = args[2]

    # Parse date1
    if isinstance(d1_val, datetime):
        d1 = d1_val
    elif isinstance(d1_val, date):
        d1 = datetime.combine(d1_val, datetime.min.time())
    else:
        try:
            d1 = datetime.fromisoformat(to_string(d1_val))
        except (ValueError, TypeError):
            for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d-%b-%Y"):
                try:
                    d1 = datetime.strptime(to_string(d1_val), fmt)
                    break
                except (ValueError, TypeError):
                    continue
            else:
                d1 = datetime.now()

    # Parse date2
    if isinstance(d2_val, datetime):
        d2 = d2_val
    elif isinstance(d2_val, date):
        d2 = datetime.combine(d2_val, datetime.min.time())
    else:
        try:
            d2 = datetime.fromisoformat(to_string(d2_val))
        except (ValueError, TypeError):
            for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d-%b-%Y"):
                try:
                    d2 = datetime.strptime(to_string(d2_val), fmt)
                    break
                except (ValueError, TypeError):
                    continue
            else:
                d2 = datetime.now()

    diff_ms = (d2 - d1).total_seconds() * 1000

    if unit in ("d", "day", "days"):
        return round(diff_ms / 86400000)
    if unit in ("h", "hour", "hours"):
        return round(diff_ms / 3600000)
    if unit in ("n", "minute", "minutes"):
        return round(diff_ms / 60000)
    if unit in ("s", "second", "seconds"):
        return round(diff_ms / 1000)
    if unit in ("m", "month", "months"):
        months = (d2.year - d1.year) * 12
        months += d2.month - d1.month
        return months
    if unit in ("y", "yyyy", "year", "years"):
        return d2.year - d1.year
    return None


def _fn_format(args: list[Any]) -> str:
    """FORMAT(value, format_string) — format a value.

    Supported formats: Short Date, Medium Date, Long Date,
    Short Time, Long Time, General Date, Currency, Fixed,
    Standard, Percent, Scientific, General Number
    """
    val = args[0]
    fmt = to_string(args[1]).strip().lower() if len(args) > 1 else "general number"
    return _format_value(val, fmt)


# ─── Step 44: New Function Library ─────────────────────────


def _fn_today(args: list[Any]) -> date:
    """TODAY() — alias for DATE(), returns current date."""
    return datetime.now().date()


def _fn_concat(args: list[Any]) -> str:
    """CONCAT(...values) — variadic string concatenation."""
    return "".join(to_string(v) for v in args)


def _fn_coalesce(args: list[Any]) -> Any:
    """COALESCE(...values) — return first non-null non-empty value."""
    for v in args:
        if v is not None and v != "":
            return v
    return None


def _fn_upper(args: list[Any]) -> str:
    """UPPER(str) — alias for UCASE, uppercase."""
    return to_string(args[0]).upper()


def _fn_lower(args: list[Any]) -> str:
    """LOWER(str) — alias for LCASE, lowercase."""
    return to_string(args[0]).lower()


# ─── Format Value ──────────────────────────────────────────


def _format_value(val: Any, fmt: str) -> str:
    """Format a value using Access-compatible format strings."""
    if val is None:
        return ""

    # Date/time values
    if isinstance(val, (datetime, date)):
        return _format_date(val, fmt)

    # Date-like strings
    if isinstance(val, str) and _looks_like_date(val):
        try:
            dt = datetime.fromisoformat(val)
            return _format_date(dt, fmt)
        except (ValueError, TypeError):
            pass

    n = to_number(val)

    if fmt == "currency":
        return "${:,.2f}".format(n)
    if fmt == "fixed":
        return "{:.2f}".format(n)
    if fmt == "standard":
        return "{:,.2f}".format(n)
    if fmt == "percent":
        return "{:.2f}%".format(n * 100)
    if fmt == "scientific":
        return "{:.2e}".format(n)
    if fmt == "general number":
        # Strip trailing .0 for integers
        if n == int(n):
            return str(int(n))
        return str(n)
    # Fallback: return the value as-is
    return to_string(val)


def _format_date(dt: date | datetime, fmt: str) -> str:
    """Format a date/datetime value."""
    fmt = fmt.strip().lower()
    if fmt == "short date":
        return dt.strftime("%m/%d/%y")
    if fmt == "medium date":
        return dt.strftime("%b %d, %Y")
    if fmt == "long date":
        return dt.strftime("%A, %B %d, %Y")
    if fmt == "short time":
        return dt.strftime("%I:%M %p").lstrip("0")
    if fmt == "long time":
        return dt.strftime("%I:%M:%S %p").lstrip("0")
    if fmt == "general date":
        return dt.strftime("%m/%d/%y %I:%M %p").lstrip("0")
    return dt.strftime("%m/%d/%Y")


def _looks_like_date(s: str) -> bool:
    """Rough check if a string looks like an ISO date."""
    return bool(re.match(r"\d{4}-\d{2}-\d{2}", s.strip()))


# ─── Function Call Dispatcher ──────────────────────────────


BUILTIN_FUNCTIONS: dict[str, Callable[[list[Any]], Any]] = {
    "iif": _fn_iif,
    "if": _fn_iif,
    "nz": _fn_nz,
    "isnull": _fn_isnull,
    "now": _fn_now,
    "date": _fn_date,
    "today": _fn_today,
    "left": _fn_left,
    "right": _fn_right,
    "mid": _fn_mid,
    "len": _fn_len,
    "trim": _fn_trim,
    "ucase": _fn_ucase,
    "upper": _fn_upper,
    "lcase": _fn_lcase,
    "lower": _fn_lower,
    "instr": _fn_instr,
    "replace": _fn_replace,
    "int": _fn_int,
    "abs": _fn_abs,
    "val": _fn_val,
    "round": _fn_round,
    "dateadd": _fn_dateadd,
    "datediff": _fn_datediff,
    "concat": _fn_concat,
    "coalesce": _fn_coalesce,
    "format": _fn_format,
}

AGGREGATE_FUNCTIONS = frozenset({"sum", "count", "avg", "min", "max"})


# ─── Core Evaluator ───────────────────────────────────────


def evaluate(node: Expression, context: EvalContext) -> Any:
    """Recursively evaluate an AST node against a context.

    Args:
        node: An AST node (FieldRef, LiteralNode, BinaryOp, UnaryOp,
              Comparison, or FunctionCall).
        context: The evaluation context with record data.

    Returns:
        The computed value, or None for null.

    Raises:
        EvalError: If evaluation encounters an error.
    """
    # ── Literal ──
    if isinstance(node, LiteralNode):
        return None if node.literal_type == "null" else node.value

    # ── Field reference ──
    if isinstance(node, FieldRef):
        if node.table:
            return field_lookup(f"{node.table}.{node.field}", context)
        return field_lookup(node.field, context)

    # ── Unary operator ──
    if isinstance(node, UnaryOp):
        operand = evaluate(node.operand, context)
        if node.operator == "-":
            return -to_number(operand)
        if node.operator == "NOT":
            return -1 if not truthy(operand) else 0
        raise EvalError(f"Unknown unary operator: {node.operator!r}")

    # ── Binary operator ──
    if isinstance(node, BinaryOp):
        left = evaluate(node.left, context)
        right = evaluate(node.right, context)
        op = node.operator
        if op == "+":
            # Access-style: + concatenates strings, adds numbers
            if isinstance(left, str) or isinstance(right, str):
                return to_string(left) + to_string(right)
            return to_number(left) + to_number(right)
        if op == "-":
            return to_number(left) - to_number(right)
        if op == "*":
            return to_number(left) * to_number(right)
        if op == "/":
            r = to_number(right)
            if r == 0:
                return None  # Division by zero → null
            return to_number(left) / r
        if op == "AND":
            return -1 if truthy(left) and truthy(right) else 0
        if op == "OR":
            return -1 if truthy(left) or truthy(right) else 0
        raise EvalError(f"Unknown binary operator: {op!r}")

    # ── Comparison ──
    if isinstance(node, Comparison):
        left = evaluate(node.left, context)
        right = evaluate(node.right, context)
        op = node.operator
        if op == "=":
            return -1 if left == right else 0
        if op == "!=":
            return -1 if left != right else 0
        # Numeric comparisons
        l = to_number(left)
        r = to_number(right)
        if op == ">":
            return -1 if l > r else 0
        if op == "<":
            return -1 if l < r else 0
        if op == ">=":
            return -1 if l >= r else 0
        if op == "<=":
            return -1 if l <= r else 0
        raise EvalError(f"Unknown comparison operator: {op!r}")

    # ── Function call ──
    if isinstance(node, FunctionCall):
        name = node.name.lower()
        if name in AGGREGATE_FUNCTIONS:
            return _call_aggregate(name, node.args, context)
        # LOOKUP requires context for databaseLookup
        if name == "lookup":
            return _call_lookup(node.args, context)
        # Evaluate all arguments first
        evaled_args = [evaluate(arg, context) for arg in node.args]
        fn = BUILTIN_FUNCTIONS.get(name)
        if fn is None:
            return None  # Unknown function → null
        return fn(evaled_args)

    raise EvalError(f"Unknown AST node type: {type(node).__name__}")


# ─── Aggregates ────────────────────────────────────────────


def _call_aggregate(fn: str, args: list[Expression], context: EvalContext) -> Any:
    """Evaluate an aggregate function over group records.

    The argument expression is re-evaluated for each record in the group.
    """
    records = (
        context.group_records
        if context.group_records is not None and len(context.group_records) > 0
        else context.all_records
    )
    if records is None:
        records = []

    if not records:
        return 0 if fn == "count" else None

    # Default arg is * for COUNT(*)
    arg = args[0] if args else LiteralNode(value="*", literal_type="string")

    if fn == "count":
        # COUNT(*) — count all rows
        if isinstance(arg, LiteralNode) and arg.value == "*":
            return len(records)
        # COUNT(field) — count non-null values
        return sum(
            1
            for r in records
            if truthy(
                evaluate(arg, _child_context(r, context))
            )
        )

    if fn == "sum":
        return sum(
            to_number(evaluate(arg, _child_context(r, context)))
            for r in records
        )

    if fn == "avg":
        vals = [
            to_number(evaluate(arg, _child_context(r, context)))
            for r in records
        ]
        return sum(vals) / len(vals) if vals else None

    if fn == "min":
        vals = [
            to_number(evaluate(arg, _child_context(r, context)))
            for r in records
        ]
        return min(vals) if vals else None

    if fn == "max":
        vals = [
            to_number(evaluate(arg, _child_context(r, context)))
            for r in records
        ]
        return max(vals) if vals else None

    return None


def _child_context(record: dict[str, Any], parent: EvalContext) -> EvalContext:
    """Create a child context for aggregate evaluation over one record."""
    return EvalContext(
        record=record,
        group_records=parent.group_records,
        all_records=parent.all_records,
        page=parent.page,
        pages=parent.pages,
    )


# ─── LOOKUP ────────────────────────────────────────────────


def _call_lookup(args: list[Expression], context: EvalContext) -> Any:
    """LOOKUP(tableAndField, keyValue) — lookup a value from related table.

    Syntax: LOOKUP(customers.name, {customer_id})
    Parses 'customers.name' into table='customers', field='name'
    and calls context.database_lookup(table, field, keyValue).
    """
    if len(args) < 2:
        return None
    table_and_field = evaluate(args[0], context)
    key_value = evaluate(args[1], context)
    tf_str = to_string(table_and_field)
    dot_idx = tf_str.find(".")
    if dot_idx == -1:
        return None
    table_name = tf_str[:dot_idx]
    field_name = tf_str[dot_idx + 1 :]
    if context.database_lookup is not None:
        return context.database_lookup(table_name, field_name, key_value)
    return None


# ─── Parse Cache ────────────────────────────────────────────


_parse_cache: dict[str, Expression] = {}
_MAX_CACHE_SIZE = 500


# ─── Public API ─────────────────────────────────────────────


def evaluate_expression(
    expression_str: str,
    context: EvalContext | dict[str, Any] | None = None,
) -> Any:
    """Parse and evaluate an expression string.

    This is the main entry point. Combines parsing and evaluation
    with expression caching for repeated expressions.

    Args:
        expression_str: Raw expression string (e.g., '{a} + {b} * 5').
        context: Evaluation context with record data. Accepts an EvalContext
                 instance or a plain dict.

    Returns:
        The computed result, or ``"#Error"`` on failure (Access-style).

    Examples:
        >>> evaluate_expression("2 + 3")
        5
        >>> evaluate_expression("{name}", {"record": {"name": "Alice"}})
        'Alice'
        >>> evaluate_expression("1 / 0") is None
        True
        >>> evaluate_expression("bad syntax + +")
        '#Error'
    """
    if context is None:
        context = EvalContext()
    elif isinstance(context, dict):
        context = EvalContext(**context)

    # Strip leading = (Access-style expression prefix)
    expr = expression_str.lstrip()
    if expr.startswith("="):
        expr = expr[1:]

    try:
        ast = _parse_cache.get(expr)
        if ast is None:
            ast = parse_expression(expr)
            if len(_parse_cache) >= _MAX_CACHE_SIZE:
                _parse_cache.clear()
            _parse_cache[expr] = ast
        return evaluate(ast, context)
    except Exception:
        return "#Error"
