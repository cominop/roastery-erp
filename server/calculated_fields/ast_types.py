"""AST node type definitions for the expression parser."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal as TypingLiteral, Union


@dataclass
class FieldRef:
    """Reference to a field, optionally table-qualified: {field} or {table.field}."""

    type: TypingLiteral["FIELD_REF"] = "FIELD_REF"
    table: str | None = None  # Optional table qualifier
    field: str = ""  # Field name

    def __repr__(self) -> str:
        if self.table:
            return f"FieldRef(table={self.table!r}, field={self.field!r})"
        return f"FieldRef(field={self.field!r})"


@dataclass
class LiteralNode:
    """A literal value: string, number, boolean, or null."""

    type: TypingLiteral["LITERAL"] = "LITERAL"
    value: str | float | int | bool | None = None
    literal_type: str = "null"  # 'string', 'number', 'boolean', 'null'

    def __repr__(self) -> str:
        return f"LiteralNode({self.value!r}, type={self.literal_type!r})"


@dataclass
class BinaryOp:
    """Binary arithmetic operation: +, -, *, /"""

    type: TypingLiteral["BINARY_OP"] = "BINARY_OP"
    operator: str = "+"  # '+', '-', '*', '/'
    left: Expression = field(default_factory=lambda: LiteralNode())  # type: ignore[assignment]
    right: Expression = field(default_factory=lambda: LiteralNode())  # type: ignore[assignment]

    def __repr__(self) -> str:
        return f"BinaryOp({self.operator!r}, {self.left}, {self.right})"


@dataclass
class UnaryOp:
    """Unary operation: -x, NOT x"""

    type: TypingLiteral["UNARY_OP"] = "UNARY_OP"
    operator: str = "-"  # '-', 'NOT'
    operand: Expression = field(default_factory=lambda: LiteralNode())  # type: ignore[assignment]

    def __repr__(self) -> str:
        return f"UnaryOp({self.operator!r}, {self.operand})"


@dataclass
class FunctionCall:
    """Function call: NAME(args...)"""

    type: TypingLiteral["FUNCTION_CALL"] = "FUNCTION_CALL"
    name: str = ""
    args: list[Expression] = field(default_factory=list)

    def __repr__(self) -> str:
        return f"FunctionCall({self.name!r}, {self.args})"


@dataclass
class Comparison:
    """Comparison operation: =, !=, >, <, >=, <="""

    type: TypingLiteral["COMPARISON"] = "COMPARISON"
    operator: str = "="  # '=', '!=', '>', '<', '>=', '<='
    left: Expression = field(default_factory=lambda: LiteralNode())  # type: ignore[assignment]
    right: Expression = field(default_factory=lambda: LiteralNode())  # type: ignore[assignment]

    def __repr__(self) -> str:
        return f"Comparison({self.operator!r}, {self.left}, {self.right})"


# Union type for any expression node
Expression = Union[FieldRef, LiteralNode, BinaryOp, UnaryOp, FunctionCall, Comparison]
