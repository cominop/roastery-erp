#!/usr/bin/env python3
"""
Tests for the evaluate_cli.py CLI wrapper.

Tests:
- Evaluating a simple arithmetic expression without values
- Evaluating with sample values
- Error handling (bad expression, missing argument)
"""

import json
import os
import subprocess
import sys
import unittest

# Path to the CLI script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CLI_PATH = os.path.join(
    SCRIPT_DIR, "..", "calculated_fields", "evaluate_cli.py"
)
CLI_PATH = os.path.normpath(CLI_PATH)


def run_cli(*args: str) -> subprocess.CompletedProcess:
    """Run the evaluate_cli.py with the given arguments."""
    return subprocess.run(
        [sys.executable, CLI_PATH, *args],
        capture_output=True,
        text=True,
        timeout=10,
    )


class TestEvaluateCLI(unittest.TestCase):
    """Test suite for evaluate_cli.py."""

    def test_simple_arithmetic(self) -> None:
        """Test evaluating a simple arithmetic expression without values."""
        result = run_cli("--expression", "2 + 3")
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout.strip())
        self.assertIn("result", data)
        self.assertEqual(data["result"], 5)

    def test_expression_with_values(self) -> None:
        """Test evaluating an expression with sample field values."""
        values = json.dumps({"sell_price": 15.00, "cost_price": 8.50})
        result = run_cli(
            "--expression",
            "{sell_price} - {cost_price}",
            "--values",
            values,
        )
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout.strip())
        self.assertIn("result", data)
        # 15.00 - 8.50 = 6.5
        self.assertAlmostEqual(data["result"], 6.5)

    def test_expression_with_values_percentage(self) -> None:
        """Test evaluating a percentage margin expression."""
        values = json.dumps({"sell_price": 20.00, "cost_price": 10.00})
        result = run_cli(
            "--expression",
            "({sell_price} - {cost_price}) / {sell_price} * 100",
            "--values",
            values,
        )
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout.strip())
        self.assertIn("result", data)
        # (20 - 10) / 20 * 100 = 50.0
        self.assertAlmostEqual(data["result"], 50.0)

    def test_bad_expression_returns_error(self) -> None:
        """Test that a bad expression returns an error result (#Error string)."""
        result = run_cli("--expression", "2 + + 3")
        # evaluate_expression catches exceptions and returns "#Error" string,
        # so the CLI still exits 0 with a result value
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout.strip())
        self.assertIn("result", data)
        self.assertEqual(data["result"], "#Error")

    def test_missing_expression_arg(self) -> None:
        """Test that missing --expression returns an error."""
        result = run_cli()
        self.assertEqual(result.returncode, 1)
        data = json.loads(result.stdout.strip())
        self.assertIn("error", data)

    def test_invalid_json_values(self) -> None:
        """Test that invalid JSON for --values returns an error."""
        result = run_cli(
            "--expression", "{a} + {b}", "--values", "not-json"
        )
        self.assertEqual(result.returncode, 1)
        data = json.loads(result.stdout.strip())
        self.assertIn("error", data)

    def test_division_by_zero(self) -> None:
        """Test division by zero returns null result (not error)."""
        result = run_cli("--expression", "1 / 0")
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout.strip())
        self.assertIn("result", data)
        self.assertIsNone(data["result"])

    def test_function_call(self) -> None:
        """Test evaluating an expression with a function call."""
        result = run_cli("--expression", 'IIF({status} = "active", 1, 0)')
        self.assertEqual(result.returncode, 0)
        # Without values, status is None → IIF evaluates to false branch
        data = json.loads(result.stdout.strip())
        self.assertIn("result", data)
        # When status is not provided, -1 if truthy... Actually IIF(None, 1, 0) → to_number(None) = 0 → falsy → returns args[2] = 0
        self.assertEqual(data["result"], 0)

    def test_function_call_with_values(self) -> None:
        """Test IIF with sample values."""
        values = json.dumps({"status": "active"})
        result = run_cli(
            "--expression",
            'IIF({status} = "active", 1, 0)',
            "--values",
            values,
        )
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout.strip())
        self.assertIn("result", data)
        self.assertEqual(data["result"], 1)  # True → IIF returns args[1] = 1


if __name__ == "__main__":
    unittest.main()
