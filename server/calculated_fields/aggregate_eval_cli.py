#!/usr/bin/env python3
"""CLI wrapper for aggregate expression evaluation.

Parses an aggregate expression (e.g., SUM(order_details.{quantity} * {unit_price}))
and returns the parsed components as JSON. Optionally evaluates against the
CalcCache for testing.

Used by the Node.js server and for standalone testing.

Usage:
    python3 aggregate_eval_cli.py --expression "SUM(order_details.{quantity})"
    # => {"fn": "SUM", "related_table": "order_details", "field_expr": "quantity"}

    python3 aggregate_eval_cli.py --expression "COUNT(order_details.*)" --parent "orders" --record_id 42
    # => {"fn": "COUNT", "related_table": "order_details", "field_expr": "*", "is_count_star": true}
"""

import json
import os
import re
import sys


def parse_aggregate_expression(expression: str) -> dict:
    """Parse an aggregate expression into its components.

    Supported patterns:
        FUNCTION(related_table.{field_expr})
        FUNCTION(related_table.{field1} * {field2})
        FUNCTION(related_table.{field1} * related_table.{field2})
        COUNT(related_table.*)

    Returns:
        dict with keys: fn, related_table, field_expr, is_count_star
        or dict with "error" key on failure.
    """
    trimmed = expression.strip()

    # Match: FUNCTION(related_table.rest_of_expression)
    # The rest may contain {field} references, arithmetic, etc.
    # e.g., SUM(order_details.{quantity} * {unit_price})
    # or    SUM(order_details.{quantity} * order_details.{unit_price})
    pattern = re.compile(
        r"^(\w+)\s*\(\s*(\w+)\.(.+)\)\s*$",
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.match(trimmed)
    if match:
        fn = match.group(1).upper()
        related_table = match.group(2)
        field_expr = match.group(3).strip()

        # Remove trailing closing paren from field_expr if present
        # (the outer .+ may capture it)
        while field_expr.endswith(")"):
            field_expr = field_expr[:-1].strip()

        is_count_star = fn == "COUNT" and (field_expr == "*" or field_expr == related_table + ".*")
        return {
            "fn": fn,
            "related_table": related_table,
            "field_expr": field_expr,
            "is_count_star": is_count_star,
        }

    return {"error": f"Could not parse aggregate expression: {expression!r}"}


def resolve_field_reference(field_expr: str) -> str:
    """Resolve Jam.py-style {field} references to SQL column references.

    Replaces {field_name} with the bare column name.
    For COUNT(*) the field is already '*'.

    Args:
        field_expr: The field expression from the aggregate (e.g., "quantity * unit_price"
                    or "{quantity} * {unit_price}").

    Returns:
        SQL-safe column expression.
    """
    if field_expr == "*":
        return "*"

    # Replace {field_name} with field_name (column ref)
    result = re.sub(r"\{(\w+)\}", r"\1", field_expr)
    return result


def infer_foreign_key(parent_table: str) -> str:
    """Infer the foreign key column name in a related table.

    Heuristic: singularize the parent table name and append '_id'.
    Simple singularization removes trailing 's' or 'es'.

    Args:
        parent_table: The parent table name (e.g., 'orders').

    Returns:
        Inferred foreign key column name (e.g., 'order_id').
    """
    name = parent_table.lower()
    if name.endswith("ies"):
        name = name[:-3] + "y"
    elif name.endswith("ses"):
        name = name[:-2]
    elif name.endswith("shes"):
        name = name[:-2]
    elif name.endswith("ches"):
        name = name[:-2]
    elif name.endswith("xes"):
        name = name[:-2]
    elif name.endswith("s") and not name.endswith("ss"):
        name = name[:-1]
    return f"{name}_id"


def main() -> None:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    args = sys.argv[1:]

    expression = None
    parent_table = None
    record_id = None

    i = 0
    while i < len(args):
        if args[i] == "--expression" and i + 1 < len(args):
            expression = args[i + 1]
            i += 2
        elif args[i] == "--parent" and i + 1 < len(args):
            parent_table = args[i + 1]
            i += 2
        elif args[i] == "--record-id" and i + 1 < len(args):
            record_id = args[i + 1]
            i += 2
        else:
            i += 1

    if expression is None:
        print(json.dumps({"error": "Missing --expression argument"}), flush=True)
        sys.exit(1)

    try:
        parsed = parse_aggregate_expression(expression)

        if "error" in parsed:
            print(json.dumps(parsed), flush=True)
            sys.exit(1)

        # Resolve field references to SQL
        sql_field = resolve_field_reference(parsed["field_expr"])
        parsed["sql_field"] = sql_field

        # Infer FK if parent table provided
        if parent_table:
            parsed["foreign_key"] = infer_foreign_key(parent_table)
            parsed["parent_table"] = parent_table

            # Build the SQL query
            fn = parsed["fn"]
            related_table = parsed["related_table"]
            fk = parsed["foreign_key"]

            if parsed["is_count_star"]:
                sql = f"SELECT COUNT(*) AS result FROM {related_table} WHERE {fk} = $1"
            elif sql_field == "*":
                sql = f"SELECT COUNT(*) AS result FROM {related_table} WHERE {fk} = $1"
            else:
                sql = f"SELECT {fn}({sql_field}) AS result FROM {related_table} WHERE {fk} = $1"

            parsed["sql"] = sql

        print(json.dumps(parsed), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
