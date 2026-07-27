#!/usr/bin/env python3
"""
CLI wrapper for expression evaluation.

Reads the expression from --expression and optional sample values from
--values as a JSON string, then evaluates the expression against those
values and prints the JSON result to stdout.

Used by the Node.js server to call the Python expression evaluator.

Usage:
    python3 evaluate_cli.py --expression "{sell_price} - {cost_price}" --values '{"sell_price": 15.00, "cost_price": 8.50}'
    # => {"result": 6.5}

    python3 evaluate_cli.py --expression "1 / 0"
    # => {"result": null}
"""

import json
import os
import sys


def main() -> None:
    # Ensure the project root is on sys.path so server.calculated_fields.*
    # imports resolve correctly.
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)  # server/
    project_root = os.path.dirname(project_root)  # <project>/
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    args = sys.argv[1:]

    expression = None
    values_str = None
    i = 0
    while i < len(args):
        if args[i] == "--expression" and i + 1 < len(args):
            expression = args[i + 1]
            i += 2
        elif args[i] == "--values" and i + 1 < len(args):
            values_str = args[i + 1]
            i += 2
        else:
            i += 1

    if expression is None:
        print(json.dumps({"error": "Missing --expression argument"}), flush=True)
        sys.exit(1)

    try:
        from server.calculated_fields.expression_evaluator import (
            evaluate_expression,
        )

        # Parse sample values (JSON object like {"sell_price": 15.00})
        values: dict = {}
        if values_str:
            try:
                values = json.loads(values_str)
            except json.JSONDecodeError as e:
                print(
                    json.dumps({"error": f"Invalid --values JSON: {e}"}),
                    flush=True,
                )
                sys.exit(1)

        # Build context with the sample values as the record
        context = {"record": values}
        result = evaluate_expression(expression, context)
        print(json.dumps({"result": result}, default=str), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()