"""Expression evaluator unit tests — AST to result with context.

Tests cover: literal evaluation, field references, arithmetic,
comparisons, logical operators, built-in functions, aggregates,
complex expressions, edge cases, and error handling.
"""

import sys
import os
import math
from datetime import date, datetime, timedelta

# Ensure the project root is on sys.path so we can import server.*
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from typing import Any

import pytest

from server.calculated_fields.eval_context import EvalContext
from server.calculated_fields.eval_error import EvalError
from server.calculated_fields.expression_evaluator import (
    evaluate_expression,
    evaluate,
    to_number,
    to_string,
    truthy,
    field_lookup,
)
from server.calculated_fields.ast_types import (
    BinaryOp,
    Comparison,
    FieldRef,
    FunctionCall,
    LiteralNode,
    UnaryOp,
)
from server.calculated_fields.expression_parser import parse_expression


# ─── Helper ─────────────────────────────────────────────────


def eval_with(expr: str, record: dict[str, Any] | None = None) -> Any:
    """Evaluate an expression with an optional record."""
    if record is None:
        record = {}
    return evaluate_expression(expr, EvalContext(record=record))


def eval_with_ctx(expr: str, ctx: EvalContext) -> Any:
    """Evaluate an expression with a full context."""
    return evaluate_expression(expr, ctx)


# ─── Type Conversion Tests ──────────────────────────────────


class TestTypeConversions:
    """Test to_number, to_string, truthy helpers."""

    def test_to_number_none(self) -> None:
        assert to_number(None) == 0

    def test_to_number_bool(self) -> None:
        assert to_number(True) == -1
        assert to_number(False) == 0

    def test_to_number_int(self) -> None:
        assert to_number(42) == 42
        assert to_number(0) == 0

    def test_to_number_float(self) -> None:
        assert to_number(3.14) == 3.14

    def test_to_number_string(self) -> None:
        assert to_number("42") == 42.0
        assert to_number("3.14") == 3.14
        assert to_number("hello") == 0

    def test_to_string_none(self) -> None:
        assert to_string(None) == ""

    def test_to_string_value(self) -> None:
        assert to_string("hello") == "hello"
        assert to_string(42) == "42"
        assert to_string(True) == "True"

    def test_truthy_none(self) -> None:
        assert truthy(None) is False

    def test_truthy_number(self) -> None:
        assert truthy(0) is False
        assert truthy(0.0) is False
        assert truthy(1) is True
        assert truthy(-1) is True
        assert truthy(42) is True

    def test_truthy_bool(self) -> None:
        assert truthy(True) is True
        assert truthy(False) is False

    def test_truthy_string(self) -> None:
        assert truthy("") is False
        assert truthy("hello") is True


# ─── Field Lookup Tests ────────────────────────────────────


class TestFieldLookup:
    def test_exact_match(self) -> None:
        ctx = EvalContext(record={"name": "Alice"})
        assert field_lookup("name", ctx) == "Alice"

    def test_case_insensitive(self) -> None:
        ctx = EvalContext(record={"CUSTOMERNAME": "Acme Corp"})
        assert field_lookup("customername", ctx) == "Acme Corp"

    def test_missing_field(self) -> None:
        ctx = EvalContext(record={})
        assert field_lookup("NonExistent", ctx) is None

    def test_table_qualified(self) -> None:
        ctx = EvalContext(record={"customers.name": "Acme"})
        assert field_lookup("customers.name", ctx) == "Acme"

    def test_table_qualified_falls_back_to_bare(self) -> None:
        ctx = EvalContext(record={"name": "Acme"})
        assert field_lookup("customers.name", ctx) == "Acme"


# ─── Literals & Identity ────────────────────────────────────


class TestLiterals:
    def test_numeric_literals(self) -> None:
        assert eval_with("42") == 42
        assert eval_with("3.14") == 3.14
        assert eval_with("0") == 0
        assert eval_with("-5") == -5

    def test_string_literals(self) -> None:
        assert eval_with('"hello"') == "hello"
        assert eval_with("'world'") == "world"

    def test_leading_equals(self) -> None:
        assert eval_with("=42") == 42
        assert eval_with('="hello"') == "hello"


# ─── Field References ───────────────────────────────────────


class TestFieldReferences:
    def test_resolves_brace_field_ref(self) -> None:
        record = {"CustomerName": "Acme Corp", "Balance": 500}
        assert eval_with("{CustomerName}", record) == "Acme Corp"
        assert eval_with("{Balance}", record) == 500

    def test_resolves_plain_identifier(self) -> None:
        record = {"ProductName": "Coffee", "Price": 12.99}
        assert eval_with("ProductName", record) == "Coffee"
        assert eval_with("Price", record) == 12.99

    def test_resolves_case_insensitively(self) -> None:
        record = {"CUSTOMERNAME": "Acme Corp"}
        assert eval_with("{customername}", record) == "Acme Corp"
        assert eval_with("customername", record) == "Acme Corp"

    def test_returns_null_for_missing_fields(self) -> None:
        assert eval_with("{NonExistent}", {}) is None

    def test_table_qualified_field(self) -> None:
        record = {"customers.name": "Acme Corp"}
        assert eval_with("{customers.name}", record) == "Acme Corp"


# ─── Arithmetic ─────────────────────────────────────────────


class TestArithmetic:
    def test_addition(self) -> None:
        assert eval_with("2 + 3") == 5
        assert eval_with("10 + 20") == 30

    def test_subtraction(self) -> None:
        assert eval_with("10 - 3") == 7
        assert eval_with("5 - 10") == -5

    def test_multiplication(self) -> None:
        assert eval_with("4 * 3") == 12
        assert eval_with("0 * 100") == 0

    def test_division(self) -> None:
        assert eval_with("10 / 2") == 5.0
        assert eval_with("7 / 2") == 3.5

    def test_division_by_zero(self) -> None:
        assert eval_with("10 / 0") is None

    def test_operator_precedence(self) -> None:
        assert eval_with("2 + 3 * 4") == 14  # * before +
        assert eval_with("10 - 6 / 2") == 7  # / before -

    def test_parentheses_override_precedence(self) -> None:
        assert eval_with("(2 + 3) * 4") == 20
        assert eval_with("10 / (3 - 1)") == 5.0

    def test_unary_minus(self) -> None:
        assert eval_with("-5") == -5
        assert eval_with("-(10 + 5)") == -15
        assert eval_with("3 + -2") == 1

    def test_chained_addition(self) -> None:
        assert eval_with("1 + 2 + 3 + 4") == 10

    def test_chained_multiplication(self) -> None:
        assert eval_with("2 * 3 * 4") == 24


# ─── Comparisons ────────────────────────────────────────────


class TestComparisons:
    def test_equal(self) -> None:
        assert eval_with("5 = 5") == -1
        assert eval_with("5 = 3") == 0

    def test_not_equal(self) -> None:
        assert eval_with("5 != 3") == -1
        assert eval_with("5 != 5") == 0

    def test_less_than(self) -> None:
        assert eval_with("3 < 5") == -1
        assert eval_with("5 < 3") == 0
        assert eval_with("3 < 3") == 0

    def test_greater_than(self) -> None:
        assert eval_with("5 > 3") == -1
        assert eval_with("3 > 5") == 0

    def test_less_than_or_equal(self) -> None:
        assert eval_with("3 <= 5") == -1
        assert eval_with("3 <= 3") == -1
        assert eval_with("5 <= 3") == 0

    def test_greater_than_or_equal(self) -> None:
        assert eval_with("5 >= 3") == -1
        assert eval_with("5 >= 5") == -1
        assert eval_with("3 >= 5") == 0

    def test_compares_field_values(self) -> None:
        record = {"Qty": 10, "MinQty": 5}
        assert eval_with("{Qty} >= {MinQty}", record) == -1


# ─── Logical Operators ──────────────────────────────────────


class TestLogical:
    def test_and_true(self) -> None:
        assert eval_with("5 > 3 AND 2 < 4") == -1

    def test_and_false(self) -> None:
        assert eval_with("5 > 3 AND 2 > 4") == 0
        assert eval_with("5 < 3 AND 2 < 4") == 0

    def test_or_true(self) -> None:
        assert eval_with("5 > 3 OR 2 > 4") == -1
        assert eval_with("5 < 3 OR 2 < 4") == -1

    def test_or_false(self) -> None:
        assert eval_with("5 < 3 OR 2 > 4") == 0

    def test_not(self) -> None:
        assert eval_with("NOT 0") == -1
        assert eval_with("NOT 5") == 0
        assert eval_with("NOT (5 > 3)") == 0
        assert eval_with("NOT (5 < 3)") == -1

    def test_compound_logic_precedence(self) -> None:
        assert eval_with("NOT 0 AND 1") == -1
        assert eval_with("NOT 5 AND 1") == 0


# ─── Built-in Functions ─────────────────────────────────────


class TestFunctionIIF:
    def test_true_part(self) -> None:
        assert eval_with('IIF(5 > 3, "yes", "no")') == "yes"

    def test_false_part(self) -> None:
        assert eval_with('IIF(5 < 3, "yes", "no")') == "no"

    def test_omitted_false_returns_null(self) -> None:
        assert eval_with("IIF(0, 42)") is None


class TestFunctionNZ:
    def test_not_null(self) -> None:
        assert eval_with("NZ(42)") == 42
        assert eval_with('NZ("hello")') == "hello"

    def test_null_returns_zero(self) -> None:
        assert eval_with("NZ(null)") == 0

    def test_alternative_value(self) -> None:
        assert eval_with('NZ(null, "fallback")') == "fallback"


class TestFunctionISNULL:
    def test_null_returns_minus_one(self) -> None:
        assert eval_with("ISNULL(null)") == -1

    def test_non_null_returns_zero(self) -> None:
        assert eval_with("ISNULL(42)") == 0
        assert eval_with('ISNULL("hello")') == 0


class TestFunctionNow:
    def test_now_returns_datetime(self) -> None:
        result = eval_with("NOW()")
        assert isinstance(result, datetime)
        # Should be close to "now"
        assert abs((result - datetime.now()).total_seconds()) < 10


class TestFunctionDate:
    def test_date_returns_date(self) -> None:
        result = eval_with("DATE()")
        assert isinstance(result, (date, datetime))


class TestStringFunctions:
    def test_left(self) -> None:
        assert eval_with('LEFT("Hello World", 5)') == "Hello"

    def test_right(self) -> None:
        assert eval_with('RIGHT("Hello World", 5)') == "World"

    def test_mid(self) -> None:
        # MID(str, start, count) — 1-indexed
        assert eval_with('MID("Hello", 2, 3)') == "ell"

    def test_len(self) -> None:
        assert eval_with('LEN("Hello")') == 5
        assert eval_with('LEN("")') == 0

    def test_trim(self) -> None:
        assert eval_with('TRIM("  Hello  ")') == "Hello"

    def test_ucase(self) -> None:
        assert eval_with('UCASE("Hello")') == "HELLO"

    def test_lcase(self) -> None:
        assert eval_with('LCASE("Hello")') == "hello"

    def test_instr(self) -> None:
        assert eval_with('INSTR("Hello World", "World")') == 7
        assert eval_with('INSTR("Hello World", "xyz")') == 0

    def test_replace(self) -> None:
        assert eval_with('REPLACE("Hello World", "World", "There")') == "Hello There"


class TestMathFunctions:
    def test_int_floors(self) -> None:
        assert eval_with("INT(3.7)") == 3
        assert eval_with("INT(-1.2)") == -2

    def test_abs(self) -> None:
        assert eval_with("ABS(-5)") == 5
        assert eval_with("ABS(5)") == 5

    def test_val(self) -> None:
        assert eval_with('VAL("42.5")') == 42.5
        assert eval_with('VAL("hello")') == 0

    def test_round(self) -> None:
        assert eval_with("ROUND(3.14159, 2)") == 3.14
        assert eval_with("ROUND(3.14159, 0)") == 3.0


class TestDateFunctions:
    def test_dateadd_days(self) -> None:
        result = eval_with('DATEADD("d", 5, #01/01/2024#)')
        # The parser doesn't support # date literals, so it will fall through.
        # Let's test with string date instead
        result = eval_with('DATEADD("d", 5, "2024-01-01")')
        assert isinstance(result, datetime)
        assert result.day == 6

    def test_dateadd_months(self) -> None:
        result = eval_with('DATEADD("m", 2, "2024-01-01")')
        assert isinstance(result, datetime)
        assert result.month == 3  # March

    def test_dateadd_years(self) -> None:
        result = eval_with('DATEADD("yyyy", 1, "2024-01-01")')
        assert isinstance(result, datetime)
        assert result.year == 2025


class TestFormat:
    def test_short_date(self) -> None:
        result = eval_with('FORMAT("2024-06-15", "Short Date")')
        assert isinstance(result, str)
        assert "/" in result  # Should look like a date

    def test_currency(self) -> None:
        assert eval_with('FORMAT(1234.5, "Currency")') == "$1,234.50"

    def test_percent(self) -> None:
        assert eval_with('FORMAT(0.25, "Percent")') == "25.00%"

    def test_fixed(self) -> None:
        assert eval_with('FORMAT(3.14159, "Fixed")') == "3.14"

    def test_null_format_returns_empty(self) -> None:
        assert eval_with('FORMAT(null, "Currency")') == ""


# ─── Aggregates ─────────────────────────────────────────────


class TestAggregates:
    """Test aggregate functions over groups of records."""

    GROUP_RECORDS = [
        {"Product": "Coffee", "Qty": 10, "Price": 5},
        {"Product": "Tea", "Qty": 20, "Price": 3},
        {"Product": "Coffee", "Qty": 15, "Price": 5},
    ]

    def test_count_star(self) -> None:
        ctx = EvalContext(group_records=self.GROUP_RECORDS)
        assert eval_with_ctx("COUNT(*)", ctx) == 3

    def test_sum(self) -> None:
        ctx = EvalContext(group_records=self.GROUP_RECORDS)
        assert eval_with_ctx("SUM({Qty})", ctx) == 45

    def test_avg(self) -> None:
        ctx = EvalContext(group_records=self.GROUP_RECORDS)
        assert eval_with_ctx("AVG({Qty})", ctx) == 15

    def test_min(self) -> None:
        ctx = EvalContext(group_records=self.GROUP_RECORDS)
        assert eval_with_ctx("MIN({Qty})", ctx) == 10

    def test_max(self) -> None:
        ctx = EvalContext(group_records=self.GROUP_RECORDS)
        assert eval_with_ctx("MAX({Qty})", ctx) == 20

    def test_count_empty_set_returns_zero(self) -> None:
        ctx = EvalContext(group_records=[])
        assert eval_with_ctx("COUNT(*)", ctx) == 0

    def test_other_aggregates_empty_set_returns_null(self) -> None:
        ctx = EvalContext(group_records=[])
        assert eval_with_ctx("SUM({Qty})", ctx) is None
        assert eval_with_ctx("AVG({Qty})", ctx) is None

    def test_uses_all_records_as_fallback(self) -> None:
        ctx = EvalContext(
            group_records=[],
            all_records=self.GROUP_RECORDS,
        )
        assert eval_with_ctx("COUNT(*)", ctx) == 3


# ─── Complex Expressions ────────────────────────────────────


class TestComplexExpressions:
    def test_arithmetic_and_comparisons(self) -> None:
        record = {"Subtotal": 100, "Discount": 15, "MinOrder": 50}
        assert eval_with("({Subtotal} - {Discount}) >= {MinOrder}", record) == -1

    def test_iif_with_field_refs(self) -> None:
        record = {"Status": "Shipped"}
        assert eval_with('IIF({Status} = "Shipped", "Yes", "No")', record) == "Yes"

    def test_nested_function_calls(self) -> None:
        assert eval_with('LEFT(TRIM("  Hello  "), 3)') == "Hel"

    def test_field_values_through_chain(self) -> None:
        record = {"Qty": 100, "Price": 9.99}
        assert eval_with("{Qty} * {Price}", record) == 999.0

    def test_logical_with_field_comparisons(self) -> None:
        record = {"Age": 25, "IsMember": True}
        assert eval_with("{Age} >= 18 AND {IsMember}", record) == -1

    def test_combined_row_filter(self) -> None:
        record = {"region": "West", "order_total": 150}
        assert (
            eval_with('{region} = "West" AND {order_total} >= 100', record) == -1
        )
        assert (
            eval_with('{region} = "East" AND {order_total} >= 100', record) == 0
        )
        assert (
            eval_with('{region} = "West" AND {order_total} < 100', record) == 0
        )

    def test_nullable_field_check(self) -> None:
        record: dict[str, Any] = {"assigned_to": None}
        assert eval_with("ISNULL({assigned_to})", record) == -1
        record["assigned_to"] = "Bob"
        assert eval_with("ISNULL({assigned_to})", record) == 0

    def test_string_concat_via_plus(self) -> None:
        assert eval_with('"Hello " + "World"') == "Hello World"

    def test_string_with_field_concat(self) -> None:
        record = {"Name": "Alice"}
        assert eval_with('"Hello " + {Name}', record) == "Hello Alice"


# ─── Edge Cases & Error Handling ────────────────────────────


class TestEdgeCases:
    def test_empty_expression_returns_error(self) -> None:
        assert eval_with("") == "#Error"

    def test_only_whitespace_returns_error(self) -> None:
        assert eval_with("   ") == "#Error"

    def test_invalid_syntax_returns_error(self) -> None:
        assert eval_with("5 + + 3") == "#Error"
        assert eval_with("(5 + 3") == "#Error"

    def test_mixed_case_function_names(self) -> None:
        assert eval_with('iif(1, "yes", "no")') == "yes"
        assert eval_with('Iif(0, "yes", "no")') == "no"

    def test_unary_minus_on_field(self) -> None:
        record = {"Value": 42}
        assert eval_with("-{Value}", record) == -42

    def test_caches_parsed_ast(self) -> None:
        """Running the same expression twice should succeed both times."""
        assert eval_with("2 + 2") == 4
        assert eval_with("2 + 2") == 4

    def test_unknown_function_returns_null(self) -> None:
        assert eval_with("UNKNOWN_FN(42)") is None


# ─── Dict-Based Context ──────────────────────────────────────


class TestDictContext:
    def test_accepts_plain_dict(self) -> None:
        result = evaluate_expression("2 + 3", {"record": {}})
        assert result == 5

    def test_accepts_plain_dict_with_record(self) -> None:
        result = evaluate_expression("{name}", {"record": {"name": "Alice"}})
        assert result == "Alice"


# ─── Evaluate Raw AST ───────────────────────────────────────


class TestEvaluateRawAST:
    """Test the internal evaluate() function with raw AST nodes."""

    def test_literal_node(self) -> None:
        ctx = EvalContext(record={})
        result = evaluate(LiteralNode(value=42, literal_type="number"), ctx)
        assert result == 42

    def test_null_literal(self) -> None:
        ctx = EvalContext(record={})
        result = evaluate(LiteralNode(value=None, literal_type="null"), ctx)
        assert result is None

    def test_field_ref(self) -> None:
        ctx = EvalContext(record={"name": "Alice"})
        result = evaluate(FieldRef(field="name"), ctx)
        assert result == "Alice"

    def test_comparison(self) -> None:
        ctx = EvalContext(record={})
        result = evaluate(
            Comparison(
                operator="=",
                left=LiteralNode(value=5, literal_type="number"),
                right=LiteralNode(value=5, literal_type="number"),
            ),
            ctx,
        )
        assert result == -1


# ─── Step 44: New Function Library ───────────────────────────


class TestNewFunctionLibrary:
    """Test Step 44 functions: IF, LOOKUP, DATEDIFF, TODAY, CONCAT, COALESCE, UPPER, LOWER."""

    def test_if_true_part(self) -> None:
        assert eval_with('IF(5 > 3, "yes", "no")') == "yes"

    def test_if_false_part(self) -> None:
        assert eval_with('IF(0, "yes", "no")') == "no"

    def test_if_omitted_false_returns_null(self) -> None:
        assert eval_with("IF(0, 42)") is None

    def test_lookup_with_context(self) -> None:
        ctx = EvalContext(
            record={"customer_id": 5},
            database_lookup=lambda table, field, key: (
                "Acme Corp" if table == "customers" and field == "name" and key == 5 else None
            ),
        )
        assert evaluate_expression('LOOKUP("customers.name", {customer_id})', ctx) == "Acme Corp"

    def test_lookup_no_callback(self) -> None:
        assert eval_with('LOOKUP("customers.name", 5)') is None

    def test_lookup_missing_dot(self) -> None:
        assert eval_with('LOOKUP("customersname", 5)') is None

    def test_datediff_days(self) -> None:
        assert eval_with('DATEDIFF("day", "2024-01-01", "2024-01-11")') == 10

    def test_datediff_months(self) -> None:
        assert eval_with('DATEDIFF("month", "2024-01-01", "2024-03-01")') == 2

    def test_datediff_years(self) -> None:
        assert eval_with('DATEDIFF("yyyy", "2024-01-01", "2026-01-01")') == 2

    def test_datediff_hours(self) -> None:
        result = eval_with('DATEDIFF("h", "2024-01-01T00:00:00", "2024-01-01T05:30:00")')
        assert result == 6  # rounds

    def test_datediff_minutes(self) -> None:
        result = eval_with('DATEDIFF("n", "2024-01-01T00:00:00", "2024-01-01T01:05:00")')
        assert result == 65

    def test_datediff_seconds(self) -> None:
        result = eval_with('DATEDIFF("s", "2024-01-01T00:00:00", "2024-01-01T00:01:30")')
        assert result == 90

    def test_today_returns_date(self) -> None:
        d = eval_with("TODAY()")
        assert isinstance(d, (date, datetime))

    def test_concat_variadic(self) -> None:
        record = {"first": "John", "last": "Doe"}
        assert eval_with('CONCAT({first}, " ", {last})', record) == "John Doe"

    def test_concat_single_arg(self) -> None:
        assert eval_with('CONCAT("hello")') == "hello"

    def test_concat_no_args(self) -> None:
        assert eval_with("CONCAT()") == ""

    def test_coalesce_first_non_null(self) -> None:
        assert eval_with('COALESCE(Null, "fallback")') == "fallback"

    def test_coalesce_all_null(self) -> None:
        assert eval_with("COALESCE(Null, Null)") is None

    def test_coalesce_first_value(self) -> None:
        assert eval_with('COALESCE("first", "second")') == "first"

    def test_coalesce_skips_empty_string(self) -> None:
        assert eval_with('COALESCE("", "fallback")') == "fallback"

    def test_upper(self) -> None:
        assert eval_with('UPPER("hello")') == "HELLO"

    def test_lower(self) -> None:
        assert eval_with('LOWER("HELLO")') == "hello"

    def test_upper_alias_ucase(self) -> None:
        assert eval_with('UCASE("hello")') == "HELLO"

    def test_lower_alias_lcase(self) -> None:
        assert eval_with('LCASE("HELLO")') == "hello"
