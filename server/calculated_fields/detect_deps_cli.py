#!/usr/bin/env python3
"""
CLI wrapper for dependency detection.

Reads the expression from --expression argument and prints JSON result to stdout.
Used by the Node.js server to call the Python dependency detector.

Usage:
    python3 detect_deps_cli.py --expression "{quantity} * {unit_price}"
    # => {"depends_on": ["quantity", "unit_price"], "depends_on_tables": []}
"""

import json
import os
import sys


def main() -> None:
    # Ensure the project root is on sys.path so server.calculated_fields.*
    # imports resolve correctly. The script lives at:
    #   <project>/server/calculated_fields/detect_deps_cli.py
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)  # server/
    project_root = os.path.dirname(project_root)  # <project>/
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    args = sys.argv[1:]

    expression = None
    i = 0
    while i < len(args):
        if args[i] == "--expression" and i + 1 < len(args):
            expression = args[i + 1]
            i += 2
        else:
            i += 1

    if expression is None:
        print(json.dumps({"error": "Missing --expression argument"}), flush=True)
        sys.exit(1)

    try:
        from server.calculated_fields.dependency_detector import detect_dependencies

        result = detect_dependencies(expression)
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
