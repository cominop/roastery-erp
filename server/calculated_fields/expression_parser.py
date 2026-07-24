"""
Expression parser — tokenise then recursive-descent to build an AST.

Tokeniser converts raw expression strings into a list of tokens.
Parser builds an AST from those tokens using recursive descent with
proper operator precedence.

No eval(), exec(), compile(), or __import__ is used — the output is a
pure data structure (AST nodes) that can be walked safely.
"""

from __future__ import annotations

from typing import List, Optional

from .ast_types import (
    BinaryOp,
    Comparison,
    Expression,
    FieldRef,
    FunctionCall,
    LiteralNode,
    UnaryOp,
)
from .parse_error import ParseError
from .token_types import (
    TOKEN_AND,
    TOKEN_BOOLEAN,
    TOKEN_COMMA,
    TOKEN_EQ,
    TOKEN_EOF,
    TOKEN_FIELD_REF,
    TOKEN_GTE,
    TOKEN_GT,
    TOKEN_IDENTIFIER,
    TOKEN_LPAREN,
    TOKEN_LTE,
    TOKEN_LT,
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
    TokenType,
)


# ─── Tokeniser ──────────────────────────────────────────


def tokenise(expression: str) -> list[Token]:
    """Convert an expression string into a list of Tokens.

    Raises ParseError on invalid input (unclosed strings, field refs, etc.).
    """
    tokens: list[Token] = []
    i = 0
    length = len(expression)

    while i < length:
        ch = expression[i]

        # Whitespace
        if ch.isspace():
            i += 1
            continue

        # Numbers
        if ch.isdigit() or (ch == "." and i + 1 < length and expression[i + 1].isdigit()):
            start = i
            i += 1
            while i < length and (expression[i].isdigit() or expression[i] == "."):
                i += 1
            tokens.append(Token(TOKEN_NUMBER, expression[start:i], start))
            continue

        # Single/double quoted strings
        if ch in ('"', "'"):
            quote = ch
            start = i
            i += 1
            while i < length and expression[i] != quote:
                if expression[i] == "\\" and i + 1 < length:
                    i += 2  # skip escaped character
                else:
                    i += 1
            if i >= length:
                raise ParseError(f"Unclosed string literal", start, expression)
            i += 1  # closing quote
            # Store the raw string content (without quotes)
            raw = expression[start + 1 : i - 1]
            # Unescape
            raw = raw.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")
            tokens.append(Token(TOKEN_STRING, raw, start))
            continue

        # Field references: {field} or {table.field}
        if ch == "{":
            start = i
            i += 1
            while i < length and expression[i] != "}":
                i += 1
            if i >= length:
                raise ParseError("Unclosed field reference", start, expression)
            i += 1  # closing }
            inner = expression[start + 1 : i - 1].strip()
            if not inner:
                raise ParseError("Empty field reference", start, expression)
            tokens.append(Token(TOKEN_FIELD_REF, inner, start))
            continue

        # Two-character operators
        if ch == "!" and i + 1 < length and expression[i + 1] == "=":
            tokens.append(Token(TOKEN_NEQ, "!=", i))
            i += 2
            continue

        if ch == ">" and i + 1 < length and expression[i + 1] == "=":
            tokens.append(Token(TOKEN_GTE, ">=", i))
            i += 2
            continue

        if ch == "<" and i + 1 < length and expression[i + 1] == "=":
            tokens.append(Token(TOKEN_LTE, "<=", i))
            i += 2
            continue

        if ch == "<" and i + 1 < length and expression[i + 1] == ">":
            # Note: <> is not a standard operator in this language
            # but handle it gracefully
            tokens.append(Token(TOKEN_NEQ, "<>", i))
            i += 2
            continue

        # Single-character operators
        if ch == "+":
            tokens.append(Token(TOKEN_PLUS, "+", i))
            i += 1
            continue
        if ch == "-":
            tokens.append(Token(TOKEN_MINUS, "-", i))
            i += 1
            continue
        if ch == "*":
            tokens.append(Token(TOKEN_STAR, "*", i))
            i += 1
            continue
        if ch == "/":
            tokens.append(Token(TOKEN_SLASH, "/", i))
            i += 1
            continue
        if ch == "=":
            tokens.append(Token(TOKEN_EQ, "=", i))
            i += 1
            continue
        if ch == ">":
            tokens.append(Token(TOKEN_GT, ">", i))
            i += 1
            continue
        if ch == "<":
            tokens.append(Token(TOKEN_LT, "<", i))
            i += 1
            continue

        # Parentheses and comma
        if ch == "(":
            tokens.append(Token(TOKEN_LPAREN, "(", i))
            i += 1
            continue
        if ch == ")":
            tokens.append(Token(TOKEN_RPAREN, ")", i))
            i += 1
            continue
        if ch == ",":
            tokens.append(Token(TOKEN_COMMA, ",", i))
            i += 1
            continue

        # Identifiers, keywords, and boolean/null literals
        if ch.isalpha() or ch == "_":
            start = i
            while i < length and (expression[i].isalnum() or expression[i] == "_"):
                i += 1
            word = expression[start:i]
            upper = word.upper()
            if upper == "AND":
                tokens.append(Token(TOKEN_AND, word, start))
            elif upper == "OR":
                tokens.append(Token(TOKEN_OR, word, start))
            elif upper == "NOT":
                tokens.append(Token(TOKEN_NOT, word, start))
            elif upper == "TRUE":
                tokens.append(Token(TOKEN_BOOLEAN, "true", start))
            elif upper == "FALSE":
                tokens.append(Token(TOKEN_BOOLEAN, "false", start))
            elif upper == "NULL":
                tokens.append(Token(TOKEN_NULL, "null", start))
            else:
                tokens.append(Token(TOKEN_IDENTIFIER, word, start))
            continue

        # Unknown character — report error with position
        raise ParseError(f"Unexpected character {ch!r}", i, expression)

    tokens.append(Token(TOKEN_EOF, "", length))
    return tokens


# ─── Parser ─────────────────────────────────────────────


class Parser:
    """Recursive-descent expression parser.

    Operator precedence (highest to lowest):
        1. Unary: -, NOT
        2. Multiplicative: *, /
        3. Additive: +, -
        4. Comparison: =, !=, >, <, >=, <=
        5. Logical AND
        6. Logical OR
    """

    def __init__(self, tokens: list[Token], expression: str = "") -> None:
        self.tokens = tokens
        self.pos = 0
        self.expression = expression

    def peek(self) -> Token:
        """Return the current token without consuming it."""
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return Token(TOKEN_EOF, "", 0)

    def consume(self) -> Token:
        """Consume and return the current token, advancing position."""
        token = self.tokens[self.pos]
        self.pos += 1
        return token

    def expect(self, *expected_types: TokenType) -> Token:
        """Consume and return the current token, expecting one of the given types.

        Raises ParseError on mismatch.
        """
        token = self.peek()
        if token.type not in expected_types:
            found = f"{token.type}({token.value!r})"
            expected = " or ".join(expected_types)
            raise ParseError(
                f"Expected {expected}, got {found}",
                token.position,
                self.expression,
            )
        return self.consume()

    def is_token(self, *types: TokenType) -> bool:
        """Check if the current token matches one of the given types."""
        return self.peek().type in types

    def parse(self) -> Expression:
        """Parse a single expression from the token stream.

        Returns the root expression node.  Does NOT verify EOF — that is
        the responsibility of the top-level parse_expression() caller,
        so that recursive calls inside parenthesised sub-expressions and
        function argument lists work correctly.
        """
        if self.peek().type == TOKEN_EOF:
            raise ParseError("Empty expression", 0, self.expression)

        return self.or_expr()

    # or_expr → and_expr ("OR" and_expr)*
    def or_expr(self) -> Expression:
        left = self.and_expr()
        while self.peek().type == TOKEN_OR:
            self.consume()
            right = self.and_expr()
            left = BinaryOp(operator="OR", left=left, right=right)
        return left

    # and_expr → comparison ("AND" comparison)*
    def and_expr(self) -> Expression:
        left = self.comparison()
        while self.peek().type == TOKEN_AND:
            self.consume()
            right = self.comparison()
            left = BinaryOp(operator="AND", left=left, right=right)
        return left

    # comparison → additive (("=" | "!=" | ">" | "<" | ">=" | "<=") additive)?
    def comparison(self) -> Expression:
        left = self.additive()
        token = self.peek()
        if token.type in (TOKEN_EQ, TOKEN_NEQ, TOKEN_GT, TOKEN_LT, TOKEN_GTE, TOKEN_LTE):
            self.consume()
            right = self.additive()
            return Comparison(operator=token.value, left=left, right=right)
        return left

    # additive → multiplicative (("+" | "-") multiplicative)*
    def additive(self) -> Expression:
        left = self.multiplicative()
        while self.peek().type in (TOKEN_PLUS, TOKEN_MINUS):
            op = self.consume().value
            right = self.multiplicative()
            left = BinaryOp(operator=op, left=left, right=right)
        return left

    # multiplicative → unary (("*" | "/") unary)*
    def multiplicative(self) -> Expression:
        left = self.unary()
        while self.peek().type in (TOKEN_STAR, TOKEN_SLASH):
            op = self.consume().value
            right = self.unary()
            left = BinaryOp(operator=op, left=left, right=right)
        return left

    # unary → ("-" | "NOT") unary | primary
    def unary(self) -> Expression:
        token = self.peek()
        if token.type == TOKEN_MINUS:
            self.consume()
            operand = self.unary()
            return UnaryOp(operator="-", operand=operand)
        if token.type == TOKEN_NOT:
            self.consume()
            operand = self.unary()
            return UnaryOp(operator="NOT", operand=operand)
        return self.primary()

    # primary → FIELD_REF | STRING | NUMBER | BOOLEAN | NULL
    #         | IDENTIFIER "(" args ")"   # function call
    #         | IDENTIFIER                 # bare field ref
    #         | "(" expression ")"
    def primary(self) -> Expression:
        token = self.peek()

        if token.type == TOKEN_FIELD_REF:
            self.consume()
            inner = token.value
            # Check for table.field pattern
            if "." in inner:
                parts = inner.split(".", 1)
                return FieldRef(table=parts[0], field=parts[1])
            return FieldRef(field=inner)

        if token.type == TOKEN_STRING:
            self.consume()
            return LiteralNode(value=token.value, literal_type="string")

        if token.type == TOKEN_NUMBER:
            self.consume()
            raw = token.value
            if "." in raw:
                return LiteralNode(value=float(raw), literal_type="number")
            return LiteralNode(value=int(raw), literal_type="number")

        if token.type == TOKEN_BOOLEAN:
            self.consume()
            return LiteralNode(
                value=(token.value.lower() == "true"),
                literal_type="boolean",
            )

        if token.type == TOKEN_NULL:
            self.consume()
            return LiteralNode(value=None, literal_type="null")

        if token.type == TOKEN_IDENTIFIER:
            name = token.value
            self.consume()

            # Function call: NAME(args...)
            if self.peek().type == TOKEN_LPAREN:
                self.consume()  # (
                args: list[Expression] = []
                if self.peek().type != TOKEN_RPAREN:
                    args.append(self.parse())
                    while self.peek().type == TOKEN_COMMA:
                        self.consume()
                        args.append(self.parse())
                self.expect(TOKEN_RPAREN)
                return FunctionCall(name=name, args=args)

            # Bare identifier acts as a field reference
            return FieldRef(field=name)

        if token.type == TOKEN_LPAREN:
            self.consume()  # (
            expr = self.parse()
            self.expect(TOKEN_RPAREN)
            return expr

        raise ParseError(
            f"Unexpected token {token.value!r}",
            token.position,
            self.expression,
        )


# ─── Public API ─────────────────────────────────────────


def parse_expression(expression: str) -> Expression:
    """Parse an expression string into an AST.

    This is the main entry point. Combines tokenising and parsing.
    No eval/exec/compile is used — the result is a safe data structure.

    Args:
        expression: Raw expression string (e.g., '{a} + {b} * 5')

    Returns:
        Root AST node (Expression)

    Raises:
        ParseError: If the expression is invalid
    """
    # Strip leading = (Access-style expression prefix)
    expr = expression.lstrip()
    if expr.startswith("="):
        expr = expr[1:]

    tokens = tokenise(expr)
    parser = Parser(tokens, expr)
    ast = parser.parse()

    # Verify that we consumed all tokens (no trailing garbage)
    if parser.peek().type != TOKEN_EOF:
        token = parser.peek()
        raise ParseError(
            f"Unexpected token {token.value!r} after expression",
            token.position,
            expr,
        )

    return ast


def tokenise_expression(expression: str) -> list[Token]:
    """Tokenise an expression, returning the raw token list.

    Useful for diagnostics and testing.
    """
    expr = expression.lstrip()
    if expr.startswith("="):
        expr = expr[1:]
    return tokenise(expr)
