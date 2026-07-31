"""
band_processor.py — Band-level processing for .ods report templates.

Handles each band type:
  - **title**:     Replace single-value markers, rendered once at top.
  - **detail**:    Clone the template row per record, fill markers.
  - **summary**:   Replace aggregate markers, rendered once after detail.
  - **header**:    Column headers (marker fill, repeat per page intended).
  - **footer**:    Page footer markers.

Band config is a dict with ``start_row`` (0-indexed) and optional ``end_row``.
"""

from __future__ import annotations

from typing import Any

from .marker_parser import find_cells_with_markers, replace_markers, set_cell_text


def process_title_band(sheet, band_config: dict, data: dict[str, Any]) -> None:
    """Fill single-value markers in the title band rows."""
    start = band_config.get("start_row", 0)
    end = band_config.get("end_row", start)

    for _row, cell, _row_idx in find_cells_with_markers(sheet, start, end):
        text = _get_cell_text(cell)
        filled = replace_markers(text, data)
        set_cell_text(cell, filled)


def process_detail_band(
    sheet,
    band_config: dict,
    records: list[dict[str, Any]],
) -> None:
    """Clone the detail template row for each record and fill markers.

    The band must contain exactly one data template row (the row with markers).
    For each record, a clone of that row is appended after the source row,
    with markers replaced by record values.

    *band_config* requires at minimum ``start_row``.
    If *end_row* is set, rows from start_row to end_row are treated as the
    template block (useful for multi-row detail cells).
    """
    from odf.table import TableRow, TableCell, TableColumn
    from odf.text import P

    start = band_config.get("start_row")
    if start is None:
        raise ValueError("detail band must specify start_row")

    end = band_config.get("end_row", start)

    rows = list(sheet.getElementsByType(TableRow))
    if start >= len(rows):
        raise IndexError(
            f"detail start_row {start} exceeds row count ({len(rows)})"
        )

    # The template row(s)
    end = min(end, len(rows) - 1)
    template_rows = rows[start : end + 1]

    if not template_rows:
        raise ValueError(f"no template rows found at rows {start}-{end}")

    # Insert point: after the last template row
    parent = template_rows[-1].parentNode

    def _find_next_sibling(anchor_row) -> Any | None:
        siblings = list(parent.childNodes)
        for i, sib in enumerate(siblings):
            if sib is anchor_row and i + 1 < len(siblings):
                return siblings[i + 1]
        return None

    insert_before = _find_next_sibling(template_rows[-1])

    # Extract cell text from a template row — returns list of (text, style_name)
    # We need to store the text + style for each cell
    for record_idx, record in enumerate(records):
        for tpl_row in template_rows:
            # Build a new row by creating fresh cells (avoid deepcopy recursion)
            new_row = TableRow()
            for cell in tpl_row.getElementsByType(TableCell):
                text = _get_cell_text(cell)
                if "%(" in text:
                    text = replace_markers(text, record)
                new_cell = TableCell()
                p = P(text=text)
                new_cell.addElement(p)
                new_row.addElement(new_cell)

            if insert_before is not None:
                parent.insertBefore(new_row, insert_before)
            else:
                parent.appendChild(new_row)


def process_summary_band(
    sheet,
    band_config: dict,
    data: dict[str, Any],
) -> None:
    """Fill aggregate/summary markers in the summary band rows."""
    start = band_config.get("start_row", 0)
    end = band_config.get("end_row", start)

    for _row, cell, _row_idx in find_cells_with_markers(sheet, start, end):
        text = _get_cell_text(cell)
        filled = replace_markers(text, data)
        set_cell_text(cell, filled)


def process_header_footer_band(
    sheet,
    band_config: dict,
    page_context: dict[str, Any],
) -> None:
    """Fill page-level markers (page number, user, date).

    Intended for header and footer bands that repeat per page.
    Only fills markers — does not handle multi-page repetition
    (LibreOffice handles that during PDF export).
    """
    start = band_config.get("start_row", 0)
    end = band_config.get("end_row", start)

    for _row, cell, _row_idx in find_cells_with_markers(sheet, start, end):
        text = _get_cell_text(cell)
        filled = replace_markers(text, page_context)
        set_cell_text(cell, filled)


# ─── Internal helpers ──────────────────────────────────────


def _get_cell_text(cell) -> str:
    """Extract plain text from an odfpy TableCell."""
    from odf.text import P

    parts: list[str] = []
    for p in cell.getElementsByType(P):
        for node in p.childNodes:
            if hasattr(node, "data"):
                parts.append(node.data)
    return "".join(parts)