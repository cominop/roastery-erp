"""
Reports rendering engine: load .ods templates, fill band markers,
clone detail rows, and export to PDF/CSV/XLSX via LibreOffice headless.

Exports the band processor and marker parser utilities.
"""
from .marker_parser import find_markers, replace_markers, find_cells_with_markers
from .band_processor import (
    process_title_band,
    process_detail_band,
    process_summary_band,
    process_header_footer_band,
)

__all__ = [
    "find_markers",
    "replace_markers",
    "find_cells_with_markers",
    "process_title_band",
    "process_detail_band",
    "process_summary_band",
    "process_header_footer_band",
]