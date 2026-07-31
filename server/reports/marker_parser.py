"""
marker_parser.py — Find and replace %(var)s markers in spreadsheet cells.

Supports both simple markers ``%(var)s`` and formatted markers
``%(var: format_spec)s`` where format_spec is a Python format string
(e.g. ``%(total: $%.2f)s``).
"""

from __future__ import annotations

import re
from typing import Any

# Regex for %(variable_name)s or %(variable_name: format_spec)s
MARKER_PATTERN = re.compile(r"%\((\w+)(?::\s*([^)]*))?\)s")

# Regex for finding markers inside text — catches both forms
FIND_MARKERS_RE = re.compile(r"%\((\w+)(?::\s*([^)]*))?\)s")


def find_markers(text: str) -> list[tuple[str, str | None]]:
    """Return list of (var_name, format_str) pairs found in *text*.

    ``format_str`` is ``None`` for plain ``%(var)s`` markers.
    """
    return [(m.group(1), m.group(2)) for m in FIND_MARKERS_RE.finditer(text)]


def replace_markers(text: str, context: dict[str, Any]) -> str:
    """Replace all ``%(var)s`` markers in *text* with values from *context*.

    Supports format specifications: ``%(var: $%.2f)s`` applies
    ``"$%.2f" % value``.
    """
    def _replacer(m: re.Match) -> str:
        var_name = m.group(1)
        fmt = m.group(2)
        value = context.get(var_name, m.group(0))
        if var_name in context:
            value = context[var_name]
            if fmt is not None:
                try:
                    value = fmt % value
                except (TypeError, ValueError):
                    # fall back to raw value if formatting fails
                    pass
        return str(value)
    return MARKER_PATTERN.sub(_replacer, text)


def cell_text(cell) -> str:
    """Extract the plain-text content of an odfpy TableCell."""
    from odf.text import P
    parts: list[str] = []
    for p in cell.getElementsByType(P):
        for node in p.childNodes:
            if hasattr(node, "data"):
                parts.append(node.data)
    return "".join(parts)


def set_cell_text(cell, text: str) -> None:
    """Replace all text content in a TableCell with *text*."""
    from odf.text import P
    from odf.element import Element as ODFElement

    # Remove existing P elements
    existing_paragraphs = list(cell.getElementsByType(P))
    for p in existing_paragraphs:
        cell.removeChild(p)

    # Add new P with the text
    p = P(text=text)
    cell.addElement(p)


def find_cells_with_markers(sheet, band_start_row: int, band_end_row: int | None = None) -> list[tuple]:
    """Find all cells in a row range that contain markers.

    Returns list of ``(row_element, cell_element, cell_row_index)`` tuples,
    scanning from *band_start_row* (0-indexed) to *band_end_row* (inclusive).
    If *band_end_row* is None, scans only *band_start_row*.

    Only returns cells whose text contains at least one ``%(var)s`` marker.
    """
    from odf.table import TableRow, TableCell

    rows = list(sheet.getElementsByType(TableRow))
    end = len(rows) - 1 if band_end_row is None else band_end_row

    results: list[tuple] = []
    for row_idx in range(band_start_row, min(end + 1, len(rows))):
        row = rows[row_idx]
        for cell in row.getElementsByType(TableCell):
            text = cell_text(cell)
            if FIND_MARKERS_RE.search(text):
                results.append((row, cell, row_idx))
    return results
