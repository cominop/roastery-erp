"""Evaluation context for the expression evaluator."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class EvalContext:
    """Context passed to the expression evaluator during evaluation.

    Mirrors the TypeScript ExprContext interface from src/types/index.ts.

    Attributes:
        record: The current record's field values.
        group_records: Records in the current group (for aggregates).
        all_records: All available records (fallback for aggregates).
        page: Current page number.
        pages: Total number of pages.
    """

    record: dict[str, Any] | None = None
    group_records: list[dict[str, Any]] | None = None
    all_records: list[dict[str, Any]] | None = None
    page: int = 0
    pages: int = 0
    database_lookup: Callable[[str, str, Any], Any] | None = None

    def __post_init__(self) -> None:
        if self.record is None:
            self.record = {}
