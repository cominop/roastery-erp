"""
Unit tests for the dependency detector.

Tests cover: simple field refs, table-qualified refs, function arguments,
arithmetic expressions, nested expressions, compound expressions (AND/OR),
comparisons, unary ops, empty expressions, and parse errors.
"""

import sys
import os

# Ensure the project root is on sys.path so we can import server.*
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest

from server.calculated_fields.dependency_detector import detect_dependencies
from server.calculated_fields.parse_error import ParseError


class TestSimpleExpressions:
    """Basic field reference detection."""

    def test_single_field_ref(self) -> None:
        result = detect_dependencies("{quantity}")
        assert result == {"depends_on": ["quantity"], "depends_on_tables": []}

    def test_bare_identifier_as_field(self) -> None:
        result = detect_dependencies("quantity")
        assert result == {"depends_on": ["quantity"], "depends_on_tables": []}

    def test_multiplication(self) -> None:
        result = detect_dependencies("{quantity} * {unit_price}")
        assert result == {"depends_on": ["quantity", "unit_price"], "depends_on_tables": []}

    def test_addition(self) -> None:
        result = detect_dependencies("{subtotal} + {tax} + {shipping}")
        assert result == {"depends_on": ["shipping", "subtotal", "tax"], "depends_on_tables": []}

    def test_literals_no_deps(self) -> None:
        result = detect_dependencies("42 + 1")
        assert result == {"depends_on": [], "depends_on_tables": []}

    def test_string_literals(self) -> None:
        result = detect_dependencies("'hello' + 'world'")
        assert result == {"depends_on": [], "depends_on_tables": []}

    def test_boolean_literals(self) -> None:
        result = detect_dependencies("TRUE AND FALSE")
        assert result == {"depends_on": [], "depends_on_tables": []}

    def test_null_literal(self) -> None:
        result = detect_dependencies("{field} = null")
        assert result == {"depends_on": ["field"], "depends_on_tables": []}


class TestTableQualifiedRefs:
    """Field refs with table qualifiers."""

    def test_table_qualified(self) -> None:
        result = detect_dependencies("{order_details.amount}")
        assert result == {"depends_on": ["amount"], "depends_on_tables": ["order_details"]}

    def test_mixed_table_and_bare(self) -> None:
        result = detect_dependencies("{order_details.amount} * {tax_rate}")
        assert result == {
            "depends_on": ["amount", "tax_rate"],
            "depends_on_tables": ["order_details"],
        }

    def test_multiple_tables(self) -> None:
        expr = "{orders.total} + {customers.discount} + {taxes.rate}"
        result = detect_dependencies(expr)
        assert set(result["depends_on"]) == {"total", "discount", "rate"}
        assert set(result["depends_on_tables"]) == {"customers", "orders", "taxes"}


class TestFunctionCalls:
    """Field refs inside function arguments."""

    def test_simple_function(self) -> None:
        result = detect_dependencies("SUM({amount})")
        assert result == {"depends_on": ["amount"], "depends_on_tables": []}

    def test_multi_arg_function(self) -> None:
        result = detect_dependencies("IF({status} = 'Shipped', {ship_date}, TODAY())")
        assert result == {"depends_on": ["ship_date", "status"], "depends_on_tables": []}

    def test_nested_function(self) -> None:
        result = detect_dependencies("ROUND(SUM({total}) / COUNT({order_id}), 2)")
        assert set(result["depends_on"]) == {"order_id", "total"}
        assert result["depends_on_tables"] == []

    def test_function_with_table_qualified_args(self) -> None:
        result = detect_dependencies("SUM({order_details.amount})")
        assert result == {"depends_on": ["amount"], "depends_on_tables": ["order_details"]}


class TestComparisons:
    """Comparison expressions."""

    def test_equality(self) -> None:
        result = detect_dependencies("{status} = 'Active'")
        assert result == {"depends_on": ["status"], "depends_on_tables": []}

    def test_greater_than(self) -> None:
        result = detect_dependencies("{total} >= 100")
        assert result == {"depends_on": ["total"], "depends_on_tables": []}

    def test_not_equal(self) -> None:
        result = detect_dependencies("{region} != 'West'")
        assert result == {"depends_on": ["region"], "depends_on_tables": []}


class TestCompoundExpressions:
    """AND/OR compound expressions."""

    def test_and(self) -> None:
        result = detect_dependencies("{region} = 'West' AND {total} >= 100")
        assert set(result["depends_on"]) == {"region", "total"}
        assert result["depends_on_tables"] == []

    def test_or(self) -> None:
        result = detect_dependencies("{status} = 'New' OR {priority} = 'High'")
        assert set(result["depends_on"]) == {"priority", "status"}
        assert result["depends_on_tables"] == []

    def test_mixed(self) -> None:
        result = detect_dependencies(
            "({status} = 'Active' AND {balance} > 0) OR {account} = 'Admin'"
        )
        assert set(result["depends_on"]) == {"account", "balance", "status"}
        assert result["depends_on_tables"] == []


class TestUnaryExpressions:
    """Unary minus and NOT."""

    def test_unary_minus(self) -> None:
        result = detect_dependencies("-{amount}")
        assert result == {"depends_on": ["amount"], "depends_on_tables": []}

    def test_not_operator(self) -> None:
        result = detect_dependencies("NOT {is_deleted}")
        assert result == {"depends_on": ["is_deleted"], "depends_on_tables": []}

    def test_double_negation(self) -> None:
        result = detect_dependencies("--{value}")
        assert result == {"depends_on": ["value"], "depends_on_tables": []}


class TestEdgeCases:
    """Edge cases."""

    def test_empty_expression(self) -> None:
        result = detect_dependencies("")
        assert result == {"depends_on": [], "depends_on_tables": []}

    def test_whitespace_only(self) -> None:
        result = detect_dependencies("   ")
        assert result == {"depends_on": [], "depends_on_tables": []}

    def test_access_style_equals_prefix(self) -> None:
        result = detect_dependencies("= {quantity} * {unit_price}")
        assert result == {"depends_on": ["quantity", "unit_price"], "depends_on_tables": []}

    def test_duplicate_field_refs_deduped(self) -> None:
        result = detect_dependencies("{a} + {a} + {b}")
        assert result == {"depends_on": ["a", "b"], "depends_on_tables": []}

    def test_star_in_aggregate(self) -> None:
        result = detect_dependencies("COUNT(*)")
        assert result == {"depends_on": [], "depends_on_tables": []}

    def test_many_field_refs(self) -> None:
        fields = [f"f{i}" for i in range(20)]
        expr = " + ".join(f"{{{f}}}" for f in fields)
        result = detect_dependencies(expr)
        assert result["depends_on"] == sorted(fields)
        assert result["depends_on_tables"] == []


class TestErrors:
    """Parse errors propagate properly."""

    def test_unclosed_field_ref_raises(self) -> None:
        with pytest.raises(ParseError):
            detect_dependencies("{unclosed")

    def test_invalid_expression_raises(self) -> None:
        with pytest.raises(ParseError):
            detect_dependencies("+")
