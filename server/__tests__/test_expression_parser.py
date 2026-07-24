"""
Expression parser unit tests — tokeniser → AST; safe no-eval.

Tests cover: tokeniser, parser (AST construction), operator precedence,
error handling, and edge cases.  No eval/exec/compile is tested anywhere.
"""

import sys
import os

# Ensure the project root is on sys.path so we can import server.*
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from typing import Any

import pytest

from server.calculated_fields.expression_parser import (
    parse_expression,
    tokenise_expression,
    tokenise,
)
from server.calculated_fields.ast_types import (
    BinaryOp,
    Comparison,
    FieldRef,
    FunctionCall,
    LiteralNode,
    UnaryOp,
)
from server.calculated_fields.parse_error import ParseError
from server.calculated_fields.token_types import (
    TOKEN_AND,
    TOKEN_BOOLEAN,
    TOKEN_COMMA,
    TOKEN_EOF,
    TOKEN_EQ,
    TOKEN_FIELD_REF,
    TOKEN_GT,
    TOKEN_GTE,
    TOKEN_IDENTIFIER,
    TOKEN_LPAREN,
    TOKEN_LT,
    TOKEN_LTE,
    TOKEN_MINUS,
    TOKEN_NEQ,
    TOKEN_NOT,
    TOKEN_NULL,
    TOKEN_NUMBER,
    TOKEN_OR,
    TOKEN_PLUS,
    TOKEN_RPAREN,
    TOKEN_SLASH,
    TOKEN_STAR,
    TOKEN_STRING,
    Token,
)


# ─── Helpers ────────────────────────────────────────────


def tok(type_: str, value: str, pos: int = 0) -> Token:
    return Token(type_, value, pos)


# ─── Tokeniser Tests ────────────────────────────────────


class TestTokeniser:
    def test_simple_field_ref(self) -> None:
        tokens = tokenise("{name}")
        assert tokens == [
            tok(TOKEN_FIELD_REF, "name", 0),
            tok(TOKEN_EOF, "", 6),
        ]

    def test_string_literal_double_quotes(self) -> None:
        tokens = tokenise('"hello"')
        assert tokens == [
            tok(TOKEN_STRING, "hello", 0),
            tok(TOKEN_EOF, "", 7),
        ]

    def test_string_literal_single_quotes(self) -> None:
        tokens = tokenise("'world'")
        assert tokens == [
            tok(TOKEN_STRING, "world", 0),
            tok(TOKEN_EOF, "", 7),
        ]

    def test_number_literal_integer(self) -> None:
        tokens = tokenise("42")
        assert tokens == [
            tok(TOKEN_NUMBER, "42", 0),
            tok(TOKEN_EOF, "", 2),
        ]

    def test_number_literal_float(self) -> None:
        tokens = tokenise("3.14")
        assert len(tokens) == 2
        assert tokens[0].type == TOKEN_NUMBER
        assert tokens[0].value == "3.14"
        assert tokens[1].type == TOKEN_EOF

    def test_boolean_true(self) -> None:
        tokens = tokenise("true")
        assert tokens == [
            tok(TOKEN_BOOLEAN, "true", 0),
            tok(TOKEN_EOF, "", 4),
        ]

    def test_boolean_false(self) -> None:
        tokens = tokenise("false")
        assert tokens == [
            tok(TOKEN_BOOLEAN, "false", 0),
            tok(TOKEN_EOF, "", 5),
        ]

    def test_boolean_case_insensitive(self) -> None:
        tokens = tokenise("TRUE")
        assert tokens[0].type == TOKEN_BOOLEAN
        assert tokens[0].value == "true"

    def test_null_literal(self) -> None:
        tokens = tokenise("null")
        assert tokens == [
            tok(TOKEN_NULL, "null", 0),
            tok(TOKEN_EOF, "", 4),
        ]

    def test_mixed_expression(self) -> None:
        tokens = tokenise('{first_name} + " " + {last_name}')
        assert len(tokens) == 6
        assert tokens[0] == tok(TOKEN_FIELD_REF, "first_name", 0)
        assert tokens[1] == tok(TOKEN_PLUS, "+", 13)
        assert tokens[2] == tok(TOKEN_STRING, " ", 15)
        assert tokens[3] == tok(TOKEN_PLUS, "+", 19)
        assert tokens[4] == tok(TOKEN_FIELD_REF, "last_name", 21)
        assert tokens[5].type == TOKEN_EOF

    def test_function_call_tokens(self) -> None:
        tokens = tokenise("SUM({quantity} * {price})")
        assert len(tokens) == 7
        assert tokens[0] == tok(TOKEN_IDENTIFIER, "SUM", 0)
        assert tokens[1] == tok(TOKEN_LPAREN, "(", 3)
        assert tokens[2] == tok(TOKEN_FIELD_REF, "quantity", 4)
        assert tokens[3] == tok(TOKEN_STAR, "*", 15)
        assert tokens[4] == tok(TOKEN_FIELD_REF, "price", 17)
        assert tokens[5] == tok(TOKEN_RPAREN, ")", 24)
        assert tokens[6].type == TOKEN_EOF

    def test_comparison_tokens(self) -> None:
        tokens = tokenise("{status} = 1")
        assert len(tokens) == 4
        assert tokens[0] == tok(TOKEN_FIELD_REF, "status", 0)
        assert tokens[1] == tok(TOKEN_EQ, "=", 9)
        assert tokens[2] == tok(TOKEN_NUMBER, "1", 11)
        assert tokens[3].type == TOKEN_EOF

    def test_logical_tokens(self) -> None:
        tokens = tokenise("{a} > 10 AND {b} < 5")
        assert len(tokens) == 8
        assert tokens[0] == tok(TOKEN_FIELD_REF, "a", 0)
        assert tokens[1] == tok(TOKEN_GT, ">", 4)
        assert tokens[2] == tok(TOKEN_NUMBER, "10", 6)
        assert tokens[3] == tok(TOKEN_AND, "AND", 9)
        assert tokens[4] == tok(TOKEN_FIELD_REF, "b", 13)
        assert tokens[5] == tok(TOKEN_LT, "<", 17)
        assert tokens[6] == tok(TOKEN_NUMBER, "5", 19)
        assert tokens[7].type == TOKEN_EOF

    def test_unary_minus_token(self) -> None:
        tokens = tokenise("-{amount}")
        assert len(tokens) == 3
        assert tokens[0] == tok(TOKEN_MINUS, "-", 0)
        assert tokens[1] == tok(TOKEN_FIELD_REF, "amount", 1)
        assert tokens[2].type == TOKEN_EOF

    def test_not_keyword(self) -> None:
        tokens = tokenise("NOT {a}")
        assert tokens[0].type == TOKEN_NOT
        assert tokens[1].type == TOKEN_FIELD_REF

    def test_or_keyword(self) -> None:
        tokens = tokenise("{a} OR {b}")
        assert tokens[1].type == TOKEN_OR

    def test_inequality_operators(self) -> None:
        tokens = tokenise("{a} != {b}")
        assert tokens[1].type == TOKEN_NEQ
        tokens2 = tokenise("{a} >= {b}")
        assert tokens2[1].type == TOKEN_GTE
        tokens3 = tokenise("{a} <= {b}")
        assert tokens3[1].type == TOKEN_LTE

    def test_dotted_field_ref(self) -> None:
        tokens = tokenise("{customers.name}")
        assert tokens[0] == tok(TOKEN_FIELD_REF, "customers.name", 0)

    def test_unicode_field_name(self) -> None:
        tokens = tokenise("{caf\u00e9}")
        assert tokens[0] == tok(TOKEN_FIELD_REF, "caf\u00e9", 0)


# ─── Tokeniser Error Tests ──────────────────────────────


class TestTokeniserErrors:
    def test_unclosed_string(self) -> None:
        with pytest.raises(ParseError, match="Unclosed string literal"):
            tokenise('"hello')

    def test_unclosed_field_ref(self) -> None:
        with pytest.raises(ParseError, match="Unclosed field reference"):
            tokenise("{name")

    def test_empty_field_ref(self) -> None:
        with pytest.raises(ParseError, match="Empty field reference"):
            tokenise("{}")

    def test_unknown_character(self) -> None:
        with pytest.raises(ParseError, match="Unexpected character"):
            tokenise("{a} %% {b}")


# ─── Parser Tests ───────────────────────────────────────


class TestParserFieldRef:
    def test_simple_field(self) -> None:
        ast = parse_expression("{name}")
        assert ast == FieldRef(field="name")

    def test_table_qualified_field(self) -> None:
        ast = parse_expression("{customers.name}")
        assert isinstance(ast, FieldRef)
        assert ast.table == "customers"
        assert ast.field == "name"

    def test_bare_identifier_as_field(self) -> None:
        ast = parse_expression("name")
        assert ast == FieldRef(field="name")


class TestParserArithmetic:
    def test_addition(self) -> None:
        ast = parse_expression("{a} + {b}")
        assert ast == BinaryOp(
            operator="+",
            left=FieldRef(field="a"),
            right=FieldRef(field="b"),
        )

    def test_precedence_mul_before_add(self) -> None:
        """{a} * {b} + {c} \u2192 ((a * b) + c)"""
        ast = parse_expression("{a} * {b} + {c}")
        assert isinstance(ast, BinaryOp)
        assert ast.operator == "+"
        assert isinstance(ast.left, BinaryOp)
        assert ast.left.operator == "*"

    def test_parentheses_override_precedence(self) -> None:
        """({a} + {b}) * {c} \u2192 ((a + b) * c)"""
        ast = parse_expression("({a} + {b}) * {c}")
        assert isinstance(ast, BinaryOp)
        assert ast.operator == "*"
        assert isinstance(ast.left, BinaryOp)
        assert ast.left.operator == "+"

    def test_division(self) -> None:
        ast = parse_expression("{a} / {b}")
        assert ast == BinaryOp(
            operator="/",
            left=FieldRef(field="a"),
            right=FieldRef(field="b"),
        )


class TestParserComparison:
    def test_equality(self) -> None:
        ast = parse_expression("{a} = 5")
        assert ast == Comparison(
            operator="=",
            left=FieldRef(field="a"),
            right=LiteralNode(value=5, literal_type="number"),
        )

    def test_not_equal(self) -> None:
        ast = parse_expression("{a} != 5")
        assert isinstance(ast, Comparison)
        assert ast.operator == "!="

    def test_greater_than(self) -> None:
        ast = parse_expression("{a} > 10")
        assert isinstance(ast, Comparison)
        assert ast.operator == ">"
        assert ast.right == LiteralNode(value=10, literal_type="number")

    def test_less_than_or_equal(self) -> None:
        ast = parse_expression("{a} <= 100")
        assert isinstance(ast, Comparison)
        assert ast.operator == "<="


class TestParserUnary:
    def test_unary_minus(self) -> None:
        ast = parse_expression("-{amount}")
        assert ast == UnaryOp(operator="-", operand=FieldRef(field="amount"))

    def test_unary_minus_on_literal(self) -> None:
        ast = parse_expression("-5")
        assert ast == UnaryOp(operator="-", operand=LiteralNode(value=5, literal_type="number"))


class TestParserLogical:
    def test_and_with_comparisons(self) -> None:
        """{a} > 10 AND {b} < 5 \u2192 AND(Comparison(>), Comparison(<))"""
        ast = parse_expression("{a} > 10 AND {b} < 5")
        assert isinstance(ast, BinaryOp)
        assert ast.operator == "AND"
        assert isinstance(ast.left, Comparison)
        assert ast.left.operator == ">"
        assert isinstance(ast.right, Comparison)
        assert ast.right.operator == "<"

    def test_or_with_comparisons(self) -> None:
        ast = parse_expression("{a} = 1 OR {b} = 2")
        assert isinstance(ast, BinaryOp)
        assert ast.operator == "OR"

    def test_not_expression(self) -> None:
        ast = parse_expression("NOT {a}")
        assert ast == UnaryOp(operator="NOT", operand=FieldRef(field="a"))

    def test_chained_and_or(self) -> None:
        """{a} > 5 AND {b} < 10 OR {c} = 0 \u2192 OR(AND(>, <), =)"""
        ast = parse_expression("{a} > 5 AND {b} < 10 OR {c} = 0")
        assert isinstance(ast, BinaryOp)
        assert ast.operator == "OR"
        assert isinstance(ast.left, BinaryOp)
        assert ast.left.operator == "AND"


class TestParserFunctionCall:
    def test_sum_two_args(self) -> None:
        ast = parse_expression("SUM({a}, {b})")
        assert ast == FunctionCall(
            name="SUM",
            args=[FieldRef(field="a"), FieldRef(field="b")],
        )

    def test_no_args(self) -> None:
        ast = parse_expression("NOW()")
        assert ast == FunctionCall(name="NOW", args=[])

    def test_if_three_args(self) -> None:
        """IF({status} = 1, "Active", "Inactive")"""
        ast = parse_expression('IF({status} = 1, "Active", "Inactive")')
        assert isinstance(ast, FunctionCall)
        assert ast.name == "IF"
        assert len(ast.args) == 3
        assert isinstance(ast.args[0], Comparison)
        assert isinstance(ast.args[1], LiteralNode)
        assert ast.args[1].value == "Active"
        assert isinstance(ast.args[2], LiteralNode)
        assert ast.args[2].value == "Inactive"

    def test_nested_function_calls(self) -> None:
        """SUM(IF({a} > 0, {b}, 0), {c})"""
        ast = parse_expression("SUM(IF({a} > 0, {b}, 0), {c})")
        assert isinstance(ast, FunctionCall)
        assert ast.name == "SUM"
        assert len(ast.args) == 2
        assert isinstance(ast.args[0], FunctionCall)
        assert ast.args[0].name == "IF"
        assert ast.args[1] == FieldRef(field="c")


class TestParserLiterals:
    def test_string(self) -> None:
        ast = parse_expression('"hello"')
        assert ast == LiteralNode(value="hello", literal_type="string")

    def test_number_int(self) -> None:
        ast = parse_expression("42")
        assert ast == LiteralNode(value=42, literal_type="number")

    def test_number_float(self) -> None:
        ast = parse_expression("3.14")
        assert ast == LiteralNode(value=3.14, literal_type="number")

    def test_boolean_true(self) -> None:
        ast = parse_expression("true")
        assert ast == LiteralNode(value=True, literal_type="boolean")

    def test_boolean_false(self) -> None:
        ast = parse_expression("false")
        assert ast == LiteralNode(value=False, literal_type="boolean")

    def test_null(self) -> None:
        ast = parse_expression("null")
        assert ast == LiteralNode(value=None, literal_type="null")

    def test_leading_equals(self) -> None:
        """Access-style = prefix should be stripped."""
        ast = parse_expression("=42")
        assert ast == LiteralNode(value=42, literal_type="number")
        ast2 = parse_expression('="hello"')
        assert ast2 == LiteralNode(value="hello", literal_type="string")


# ─── Parser Error Tests ─────────────────────────────────


class TestParserErrors:
    def test_empty_expression(self) -> None:
        with pytest.raises(ParseError, match="Empty expression"):
            parse_expression("")

    def test_only_whitespace(self) -> None:
        with pytest.raises(ParseError, match="Empty expression"):
            parse_expression("   ")

    def test_mismatched_parens(self) -> None:
        with pytest.raises(ParseError, match="Expected RPAREN"):
            parse_expression("({a} + {b}")

    def test_trailing_operator(self) -> None:
        with pytest.raises(ParseError):
            parse_expression("{a} +")

    def test_trailing_garbage(self) -> None:
        with pytest.raises(ParseError, match="Unexpected token"):
            parse_expression("{a} + {b} )")

    def test_invalid_expression(self) -> None:
        with pytest.raises(ParseError, match="Unexpected character"):
            parse_expression("{a} @ {b}")


# ─── Edge Cases ─────────────────────────────────────────


class TestEdgeCases:
    def test_spaces_everywhere(self) -> None:
        ast = parse_expression("  {a}  +  {b}  ")
        assert ast == BinaryOp(
            operator="+",
            left=FieldRef(field="a"),
            right=FieldRef(field="b"),
        )

    def test_deeply_nested_parens(self) -> None:
        ast = parse_expression("((({a})))")
        assert ast == FieldRef(field="a")

    def test_unicode_field_name(self) -> None:
        ast = parse_expression("{caf\u00e9}")
        assert ast == FieldRef(field="caf\u00e9")

    def test_negative_number_via_unary(self) -> None:
        ast = parse_expression("-42")
        assert isinstance(ast, UnaryOp)
        assert ast.operator == "-"
        assert ast.operand == LiteralNode(value=42, literal_type="number")


# ─── ParseError Formatting ──────────────────────────────


class TestParseErrorFormatting:
    def test_caret_position(self) -> None:
        try:
            tokenise('"hello')
        except ParseError as e:
            msg = str(e)
            assert "at position 0" in msg
            assert '"hello' in msg
            assert "^" in msg

    def test_position_accuracy(self) -> None:
        try:
            parse_expression("{a} + + {b}")
        except ParseError as e:
            # The second + is at some position in the expression
            assert e.position >= 5


# ─── Public API ─────────────────────────────────────────


class TestPublicAPI:
    def test_tokenise_expression_public(self) -> None:
        tokens = tokenise_expression("{name}")
        assert len(tokens) == 2
        assert tokens[0].type == TOKEN_FIELD_REF

    def test_parse_expression_public(self) -> None:
        ast = parse_expression("{name}")
        assert isinstance(ast, FieldRef)


# ─── Integration: Row Filter Patterns ───────────────────


class TestRowFilterPatterns:
    def test_simple_equality_filter(self) -> None:
        ast = parse_expression("{region} = \"West\"")
        assert isinstance(ast, Comparison)
        assert ast.operator == "="

    def test_compound_filter_and(self) -> None:
        ast = parse_expression('{region} = "West" AND {order_total} >= 100')
        assert isinstance(ast, BinaryOp)
        assert ast.operator == "AND"

    def test_null_check_via_equality(self) -> None:
        ast = parse_expression("{assigned_to} = null")
        assert isinstance(ast, Comparison)
        assert ast.operator == "="
        assert isinstance(ast.right, LiteralNode)
        assert ast.right.value is None
