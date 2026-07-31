"""
Reports rendering engine: load .ods templates, fill band markers,
clone detail rows, and export to PDF/CSV/XLSX via LibreOffice headless.

Exports the main render_report() function and all utility functions.
"""

from .marker_parser import find_markers, replace_markers, find_cells_with_markers
from .band_processor import (
    process_title_band,
    process_detail_band,
    process_summary_band,
    process_header_footer_band,
)
from .renderer import render_report, convert_to_pdf, convert_with_libreoffice

__all__ = [
    "find_markers",
    "replace_markers",
    "find_cells_with_markers",
    "process_title_band",
    "process_detail_band",
    "process_summary_band",
    "process_header_footer_band",
    "render_report",
    "convert_to_pdf",
    "convert_with_libreoffice",
]
