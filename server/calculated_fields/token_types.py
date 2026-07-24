"""Token types and Token dataclass for the expression parser."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


# ─── Token type constants ───────────────────────────────

TOKEN_FIELD_REF = "FIELD_REF"       # {field_name} or {table.field}
TOKEN_STRING = "STRING"             # "hello" or 'hello'
TOKEN_NUMBER = "NUMBER"             # 42, 3.14
TOKEN_BOOLEAN = "BOOLEAN"           # true, false
TOKEN_NULL = "NULL"                 # null
TOKEN_PLUS = "PLUS"                 # +
TOKEN_MINUS = "MINUS"               # -
TOKEN_STAR = "STAR"                 # *
TOKEN_SLASH = "SLASH"               # /
TOKEN_EQ = "EQ"                     # =
TOKEN_NEQ = "NEQ"                   # !=
TOKEN_GT = "GT"                     # >
TOKEN_LT = "LT"                     # <
TOKEN_GTE = "GTE"                   # >=
TOKEN_LTE = "LTE"                   # <=
TOKEN_AND = "AND"                   # AND
TOKEN_OR = "OR"                     # OR
TOKEN_NOT = "NOT"                   # NOT
TOKEN_LPAREN = "LPAREN"             # (
TOKEN_RPAREN = "RPAREN"             # )
TOKEN_COMMA = "COMMA"               # ,
TOKEN_IDENTIFIER = "IDENTIFIER"     # function name (SUM, IF, etc.)
TOKEN_EOF = "EOF"                   # end of input

TokenType = Literal[
    "FIELD_REF", "STRING", "NUMBER", "BOOLEAN", "NULL",
    "PLUS", "MINUS", "STAR", "SLASH",
    "EQ", "NEQ", "GT", "LT", "GTE", "LTE",
    "AND", "OR", "NOT",
    "LPAREN", "RPAREN", "COMMA", "IDENTIFIER",
    "EOF",
]


@dataclass
class Token:
    """A single token from the expression lexer."""

    type: TokenType
    value: str
    position: int  # Character position in the source expression

    def __repr__(self) -> str:
        return f"Token({self.type}, {self.value!r}, pos={self.position})"