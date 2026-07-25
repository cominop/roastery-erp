"""
Dependency detector — extracts field references from an expression AST.

Walks the AST produced by the expression parser and collects all FieldRef
nodes, handling all expression node types recursively. Deduplicates results
before returning.

Safe for any well-formed expression (including invalid expressions that
would fail to evaluate at runtime — this only cares about AST structure).

Usage:
    from server.calculated_fields.dependency_detector import detect_dependencies
    result = detect_dependencies("{quantity} * {unit_price}")
    # => {"depends_on": ["quantity", "unit_price"], "depends_on_tables": []}
"""

from __future__ import annotations

from server.calculated_fields.ast_types import (
    BinaryOp,
    Comparison,
    Expression,
    FieldRef,
    FunctionCall,
    LiteralNode,
    UnaryOp,
)
from server.calculated_fields.expression_parser import parse_expression
from server.calculated_fields.parse_error import ParseError


def detect_dependencies(expression: str) -> dict[str, list[str]]:
    """Parse an expression and extract all field references.

    Args:
        expression: Raw expression string (e.g., '{quantity} * {unit_price}')

    Returns:
        dict with two keys:
          - "depends_on": sorted list of unique field names referenced
          - "depends_on_tables": sorted list of unique table qualifiers

    Raises:
        ParseError: If the expression cannot be parsed.
    """
    if not expression or not expression.strip():
        return {"depends_on": [], "depends_on_tables": []}

    ast = parse_expression(expression)
    field_refs: list[FieldRef] = []
    _walk(ast, field_refs)

    # Deduplicate — preserve order of first occurrence
    seen_fields: set[str] = set()
    seen_tables: set[str] = set()
    depends_on: list[str] = []
    depends_on_tables: list[str] = []

    for ref in field_refs:
        if ref.field and ref.field not in seen_fields:
            seen_fields.add(ref.field)
            depends_on.append(ref.field)
        if ref.table and ref.table not in seen_tables:
            seen_tables.add(ref.table)
            depends_on_tables.append(ref.table)

    depends_on.sort()
    depends_on_tables.sort()

    return {
        "depends_on": depends_on,
        "depends_on_tables": depends_on_tables,
    }


def _walk(node: Expression, results: list[FieldRef]) -> None:
    """Recursively walk an AST node, collecting FieldRefs into ``results``."""
    if isinstance(node, FieldRef):
        results.append(node)
        return

    if isinstance(node, LiteralNode):
        return  # no child nodes, nothing to walk

    if isinstance(node, UnaryOp):
        _walk(node.operand, results)
        return

    if isinstance(node, BinaryOp):
        _walk(node.left, results)
        _walk(node.right, results)
        return

    if isinstance(node, Comparison):
        _walk(node.left, results)
        _walk(node.right, results)
        return

    if isinstance(node, FunctionCall):
        for arg in node.args:
            _walk(arg, results)
        return

    # Unknown node type — skip silently (forward-compatible)
