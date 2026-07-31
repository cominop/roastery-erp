"""
Unit tests for the reports rendering engine.

Tests cover:
  - marker_parser: find_markers, replace_markers, cell_text helpers
  - band_processor: title, detail (clone + fill), summary, header/footer
  - renderer: end-to-end report generation + PDF conversion
  - CLI: argparse entry point
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

# Ensure project root is on sys.path
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

import pytest

from server.reports.marker_parser import (
    find_markers,
    replace_markers,
    cell_text,
    set_cell_text,
    find_cells_with_markers,
)
from server.reports.band_processor import (
    process_title_band,
    process_detail_band,
    process_summary_band,
    process_header_footer_band,
)
from server.reports.renderer import render_report, convert_with_libreoffice


# ─── Fixtures ───────────────────────────────────────────────


@pytest.fixture
def template_path():
    """Create a simple .ods template for testing.

    Layout:
      Row 0: ``[TITLE] %(report_title)s``
      Row 1: ``Date: %(date)s``
      Row 2: ``%(header_col)s``                           (header)
      Row 3: ``%(detail_item)s | %(detail_qty)s``        (detail template)
      Row 4: ``Total: %(summary_total)s``                (summary)
      Row 5: ``Page %(page)s``                           (footer)
    """
    import tempfile
    from odf.opendocument import OpenDocumentSpreadsheet
    from odf.table import Table, TableRow, TableCell
    from odf.text import P

    doc = OpenDocumentSpreadsheet()
    table = Table(name="Sheet1")
    doc.spreadsheet.addElement(table)

    # Row 0: title
    r0 = TableRow()
    c0 = TableCell()
    c0.addElement(P(text="[TITLE] %(report_title)s"))
    r0.addElement(c0)
    table.addElement(r0)

    # Row 1: date
    r1 = TableRow()
    c1 = TableCell()
    c1.addElement(P(text="Date: %(date)s"))
    r1.addElement(c1)
    table.addElement(r1)

    # Row 2: header
    r2 = TableRow()
    c2 = TableCell()
    c2.addElement(P(text="%(header_col)s"))
    r2.addElement(c2)
    table.addElement(r2)

    # Row 3: detail template row
    r3 = TableRow()
    c3a = TableCell()
    c3a.addElement(P(text="%(detail_item)s"))
    r3.addElement(c3a)
    c3b = TableCell()
    c3b.addElement(P(text="%(detail_qty)s"))
    r3.addElement(c3b)
    table.addElement(r3)

    # Row 4: summary
    r4 = TableRow()
    c4 = TableCell()
    c4.addElement(P(text="Total: %(summary_total)s"))
    r4.addElement(c4)
    table.addElement(r4)

    # Row 5: footer
    r5 = TableRow()
    c5 = TableCell()
    c5.addElement(P(text="Page %(page)s"))
    r5.addElement(c5)
    table.addElement(r5)

    path = os.path.join(tempfile.mkdtemp(), "test_template.ods")
    doc.save(path)
    return path


@pytest.fixture
def sample_data():
    return {
        "title": {"report_title": "Monthly Sales Report", "date": "2026-07-01"},
        "header": {"header_col": "Product | Qty"},
        "detail": [
            {"detail_item": "Colombian Dark Roast", "detail_qty": "42"},
            {"detail_item": "Ethiopian Yirgacheffe", "detail_qty": "28"},
            {"detail_item": "Costa Rican Light", "detail_qty": "15"},
        ],
        "summary": {"summary_total": "$1,250.00"},
        "footer": {"page": "1 of 1"},
    }


@pytest.fixture
def band_config():
    return {
        "title": {"start_row": 0, "end_row": 1},
        "header": {"start_row": 2, "end_row": 2},
        "detail": {"start_row": 3, "end_row": 3},
        "summary": {"start_row": 4, "end_row": 4},
        "footer": {"start_row": 5, "end_row": 5},
    }


# ─── marker_parser tests ───────────────────────────────────


class TestMarkerParser:
    def test_find_markers_plain(self):
        assert find_markers("Hello %(name)s") == [("name", None)]
        assert find_markers("") == []
        assert find_markers("no markers here") == []

    def test_find_markers_formatted(self):
        assert find_markers("Total: %(total: $%.2f)s") == [("total", "$%.2f")]

    def test_find_markers_multiple(self):
        result = find_markers("%(a)s and %(b: %.1f)s")
        assert ("a", None) in result
        assert ("b", "%.1f") in result

    def test_replace_markers_plain(self):
        result = replace_markers("Hello %(name)s!", {"name": "World"})
        assert result == "Hello World!"

    def test_replace_markers_formatted(self):
        result = replace_markers("Price: %(price: $%.2f)s", {"price": 42.5})
        assert result == "Price: $42.50"

    def test_replace_markers_multiple(self):
        ctx = {"name": "Coffee", "price": "5.99"}
        result = replace_markers("%(name)s costs %(price)s", ctx)
        assert result == "Coffee costs 5.99"

    def test_replace_markers_missing_key(self):
        """Missing keys should leave the original marker unchanged."""
        result = replace_markers("Hello %(missing)s", {})
        assert "%(missing)s" in result  # unchanged

    def test_replace_markers_format_fallback(self):
        """If formatting fails, fall back to raw value."""
        result = replace_markers("%(val: %.2f)s", {"val": "not-a-number"})
        assert "not-a-number" in result  # fallback to raw

    def test_cell_text_and_set(self):
        """Verify cell_text/set_cell_text round-trip."""
        from odf.table import TableCell
        from odf.text import P

        cell = TableCell()
        cell.addElement(P(text="Hello %(name)s"))
        assert cell_text(cell) == "Hello %(name)s"

        set_cell_text(cell, "Goodbye")
        assert cell_text(cell) == "Goodbye"

    def test_find_cells_with_markers(self):
        """Scan a sheet's row range for marker cells."""
        from odf.opendocument import OpenDocumentSpreadsheet
        from odf.table import Table, TableRow, TableCell
        from odf.text import P

        doc = OpenDocumentSpreadsheet()
        t = Table(name="S1")
        doc.spreadsheet.addElement(t)

        r0 = TableRow()
        c0 = TableCell()
        c0.addElement(P(text="%(marker)s"))
        r0.addElement(c0)
        t.addElement(r0)

        r1 = TableRow()
        c1 = TableCell()
        c1.addElement(P(text="plain"))
        r1.addElement(c1)
        t.addElement(r1)

        from odf.table import Table as ODFTable
        sheet = doc.spreadsheet.getElementsByType(ODFTable)[0]

        found = find_cells_with_markers(sheet, 0, 0)
        assert len(found) == 1

        found = find_cells_with_markers(sheet, 0, 1)
        assert len(found) == 1  # plain row has no markers


# ─── band_processor tests ──────────────────────────────────


class TestBandProcessor:
    def test_process_title_band(self, template_path, band_config, sample_data):
        from odf.opendocument import load as ods_load
        from odf.table import Table as ODFTable
        from odf.table import TableRow

        doc = ods_load(template_path)
        sheet = doc.spreadsheet.getElementsByType(ODFTable)[0]

        process_title_band(sheet, band_config["title"], sample_data["title"])

        rows = list(sheet.getElementsByType(TableRow))
        texts = _row_texts(rows)

        # Row 0 should have the title marker replaced
        assert "[TITLE] Monthly Sales Report" in texts[0]
        # Row 1 should have the date marker replaced
        assert "Date: 2026-07-01" in texts[1]

    def test_process_detail_band(self, template_path, band_config, sample_data):
        from odf.opendocument import load as ods_load
        from odf.table import Table as ODFTable
        from odf.table import TableRow

        doc = ods_load(template_path)
        sheet = doc.spreadsheet.getElementsByType(ODFTable)[0]

        process_detail_band(sheet, band_config["detail"], sample_data["detail"])

        rows = list(sheet.getElementsByType(TableRow))
        texts = _row_texts(rows)

        # Original 6 rows (0-5) + 3 detail clones = 9 rows
        assert len(rows) == 9, f"expected 9 rows, got {len(rows)}"

        # Row 3 is the original template row (unchanged markers)
        assert "%(detail_item)s" in texts[3]
        assert "%(detail_qty)s" in texts[3]

        # Rows 4, 5, 6 should be the filled clones
        assert "Colombian Dark Roast" in texts[4]
        assert "42" in texts[4]
        assert "Ethiopian Yirgacheffe" in texts[5]
        assert "28" in texts[5]
        assert "Costa Rican Light" in texts[6]
        assert "15" in texts[6]

    def test_process_summary_band(self, template_path, band_config, sample_data):
        from odf.opendocument import load as ods_load
        from odf.table import Table as ODFTable
        from odf.table import TableRow

        doc = ods_load(template_path)
        sheet = doc.spreadsheet.getElementsByType(ODFTable)[0]

        process_summary_band(sheet, band_config["summary"], sample_data["summary"])

        rows = list(sheet.getElementsByType(TableRow))
        texts = _row_texts(rows)

        assert "Total: $1,250.00" in texts[4]

    def test_process_header_footer_band(self, template_path, band_config, sample_data):
        from odf.opendocument import load as ods_load
        from odf.table import Table as ODFTable
        from odf.table import TableRow

        doc = ods_load(template_path)
        sheet = doc.spreadsheet.getElementsByType(ODFTable)[0]

        process_header_footer_band(sheet, band_config["header"], sample_data["header"])
        process_header_footer_band(sheet, band_config["footer"], sample_data["footer"])

        rows = list(sheet.getElementsByType(TableRow))
        texts = _row_texts(rows)

        assert "Product | Qty" in texts[2]
        assert "Page 1 of 1" in texts[5]


# ─── renderer integration tests ────────────────────────────


class TestRenderer:
    def test_render_report_ods(self, template_path, sample_data, band_config):
        """Render to .ods (no conversion) and verify markers filled."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "output.ods")
            result = render_report(
                template_path=template_path,
                data=sample_data,
                output_path=out_path,
                output_format="ods",
                band_config=band_config,
            )

            assert os.path.isfile(result), f"output not found: {result}"
            assert result.endswith(".ods")

            # Verify the filled content
            from odf.opendocument import load as ods_load
            from odf.table import Table as ODFTable, TableRow

            doc = ods_load(result)
            sheet = doc.spreadsheet.getElementsByType(ODFTable)[0]
            rows = list(sheet.getElementsByType(TableRow))
            texts = _row_texts(rows)

            assert any("Monthly Sales Report" in t for t in texts)
            assert any("Colombian Dark Roast" in t for t in texts)
            assert any("Total: $1,250.00" in t for t in texts)

    def test_render_report_pdf(self, template_path, sample_data, band_config):
        """Full pipeline: fill template → convert to PDF."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "report.pdf")
            result = render_report(
                template_path=template_path,
                data=sample_data,
                output_path=out_path,
                output_format="pdf",
                band_config=band_config,
            )

            assert os.path.isfile(result), f"output not found: {result}"
            assert result.endswith(".pdf")
            # Check it's a real PDF
            with open(result, "rb") as f:
                header = f.read(5)
            assert header == b"%PDF-", f"not a valid PDF: {header!r}"

    def test_render_report_csv(self, template_path, sample_data, band_config):
        """Render to CSV via LibreOffice."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "report.csv")
            result = render_report(
                template_path=template_path,
                data=sample_data,
                output_path=out_path,
                output_format="csv",
                band_config=band_config,
            )

            assert os.path.isfile(result), f"output not found: {result}"
            assert result.endswith(".csv")

    def test_render_report_xlsx(self, template_path, sample_data, band_config):
        """Render to XLSX via LibreOffice."""
        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "report.xlsx")
            result = render_report(
                template_path=template_path,
                data=sample_data,
                output_path=out_path,
                output_format="xlsx",
                band_config=band_config,
            )

            assert os.path.isfile(result), f"output not found: {result}"
            assert result.endswith(".xlsx")

    def test_render_report_default_path(self, template_path, sample_data, band_config):
        """Output path auto-generated from template name."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tpl = os.path.join(tmpdir, "invoice.ods")
            import shutil
            shutil.copy(template_path, tpl)

            result = render_report(
                template_path=tpl,
                data=sample_data,
                output_format="pdf",
                band_config=band_config,
            )
            assert os.path.isfile(result)
            assert result.endswith(".pdf")

    def test_template_not_found(self):
        with pytest.raises(FileNotFoundError):
            render_report("/nonexistent/file.ods", {"title": {}})

    def test_empty_detail_list(self, template_path, band_config):
        """Empty detail list should not add rows."""
        with tempfile.TemporaryDirectory() as tmpdir:
            data = {
                "title": {"report_title": "Empty Report", "date": "today"},
                "detail": [],
                "summary": {"summary_total": "$0.00"},
            }
            out_path = os.path.join(tmpdir, "empty.ods")
            result = render_report(
                template_path=template_path,
                data=data,
                output_path=out_path,
                output_format="ods",
                band_config=band_config,
            )
            assert os.path.isfile(result)

    def test_cli_invocation(self, template_path, sample_data, band_config):
        """Test the CLI entry point via subprocess."""
        import subprocess
        from server.reports.renderer import main

        with tempfile.TemporaryDirectory() as tmpdir:
            data_path = os.path.join(tmpdir, "data.json")
            with open(data_path, "w") as f:
                json.dump(sample_data, f)

            config_path = os.path.join(tmpdir, "config.json")
            with open(config_path, "w") as f:
                json.dump(band_config, f)

            out_path = os.path.join(tmpdir, "cli_output.pdf")

            # Run CLI via main()
            exit_code = main([
                "--template", template_path,
                "--data", data_path,
                "--output", out_path,
                "--format", "pdf",
                "--band-config", config_path,
            ])
            assert exit_code == 0, f"CLI exited with code {exit_code}"
            assert os.path.isfile(out_path)

    def test_cli_inline_json(self, template_path):
        """Test CLI with inline JSON data string."""
        from server.reports.renderer import main

        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "inline.pdf")
            data_json = json.dumps({
                "title": {"report_title": "Inline Test"},
                "detail": [{"detail_item": "Test", "detail_qty": "1"}],
            })
            config_json = json.dumps({
                "title": {"start_row": 0},
                "detail": {"start_row": 3},
            })
            exit_code = main([
                "--template", template_path,
                "--data", data_json,
                "--output", out_path,
                "--format", "ods",
                "--band-config", config_json,
            ])
            assert exit_code == 0


# ─── Helpers ────────────────────────────────────────────────


def _row_texts(rows) -> list[str]:
    """Extract concatenated text from each row for assertion."""
    from odf.table import TableCell
    from odf.text import P

    result = []
    for row in rows:
        parts: list[str] = []
        for cell in row.getElementsByType(TableCell):
            for p in cell.getElementsByType(P):
                for node in p.childNodes:
                    if hasattr(node, "data"):
                        parts.append(node.data)
        result.append("".join(parts))
    return result