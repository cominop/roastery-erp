#!/usr/bin/env python3
"""
renderer.py — .ods template rendering engine with PDF/CSV/XLSX export.

Usage
-----
  python3 server/reports/renderer.py --template template.ods \\
      --data data.json --output report.pdf

  python3 server/reports/renderer.py --template template.ods \\
      --data '{"title": {"name": "Invoice #123"}, "detail": [...]}' \\
      --output report.pdf

Bands
-----
Data must be a JSON object with band-name keys. Each band key maps to:
  - ``title`` / ``summary`` / ``header`` / ``footer``: a dict of marker→value.
  - ``detail``: a list of dicts (one per row).

Band configuration is embedded in the ``band_config`` key of the data JSON,
or can be passed separately via ``--band-config``.

Band config format::

    {
      "title":    {"start_row": 0, "end_row": 1},
      "header":   {"start_row": 2, "end_row": 2},
      "detail":   {"start_row": 3, "end_row": 3},
      "summary":  {"start_row": 5, "end_row": 5},
      "footer":   {"start_row": 7, "end_row": 7}
    }

Output formats (via LibreOffice headless conversion):
  - ``pdf``  (default)
  - ``csv``
  - ``xlsx``
  - ``html``
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from typing import Any

# Fix up sys.path so the module can be run as a script
if __name__ == "__main__" and __package__ is None:
    _dir = os.path.dirname(os.path.abspath(__file__))
    _parent = os.path.dirname(_dir)  # server/
    sys.path.insert(0, _parent)
    # Set the package so relative imports work in sibling modules
    import reports  # noqa: F401 — loads __init__.py, registers the package

from odf.opendocument import load as ods_load
from odf.table import Table

try:
    from .band_processor import (  # package-mode import
        process_detail_band,
        process_header_footer_band,
        process_summary_band,
        process_title_band,
    )
except ImportError:
    from reports.band_processor import (  # script-mode fallback
        process_detail_band,
        process_header_footer_band,
        process_summary_band,
        process_title_band,
    )

# ─── LibreOffice conversion ─────────────────────────────────


def convert_with_libreoffice(
    input_path: str,
    output_format: str,
    output_dir: str | None = None,
) -> str:
    """Convert a spreadsheet file to a different format via LibreOffice headless.

    Returns the path to the converted file.

    Supported *output_format* values: ``pdf``, ``csv``, ``xlsx``, ``html``.
    """
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"input file not found: {input_path}")

    lo_map = {
        "pdf": "calc_pdf_Export",
        "csv": "Text - txt - csv (StarCalc)",
        "xlsx": "Calc MS Excel 2007 XML",
        "html": "HTML (Calc)",
    }
    filter_name = lo_map.get(output_format)
    if not filter_name:
        raise ValueError(f"unsupported output format: {output_format}")

    cmd = [
        "libreoffice",
        "--headless",
        "--convert-to",
        output_format,
        "--outdir",
        output_dir or os.path.dirname(os.path.abspath(input_path)),
        input_path,
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"LibreOffice conversion failed (exit={result.returncode}):\n"
            f"{result.stderr.strip()}"
        )

    # Determine output path
    base = os.path.splitext(os.path.basename(input_path))[0]
    out_path = os.path.join(
        output_dir or os.path.dirname(os.path.abspath(input_path)),
        f"{base}.{output_format}",
    )
    return out_path


def convert_to_pdf(input_path: str, output_dir: str | None = None) -> str:
    """Convenience wrapper — convert spreadsheet to PDF."""
    return convert_with_libreoffice(input_path, "pdf", output_dir)


# ─── Main render function ───────────────────────────────────


def render_report(
    template_path: str,
    data: dict[str, Any],
    output_path: str | None = None,
    output_format: str = "pdf",
    band_config: dict | None = None,
) -> str:
    """Load a .ods template, fill band markers, and export.

    Parameters
    ----------
    template_path:
        Path to the .ods template file.
    data:
        Dict with band keys (``title``, ``header``, ``detail``, ``summary``,
        ``footer``). ``detail`` must be a list of dicts; others are single
        dicts or strings.
    output_path:
        Path for the final output file. If None, builds from template name and
        format.
    output_format:
        One of ``pdf``, ``csv``, ``xlsx``, ``html``.
    band_config:
        Dict mapping band name to ``{start_row, end_row}`` (0-indexed).
        If omitted, auto-detected from data keys with a default of row 0 for
        each.

    Returns
    -------
    The path to the rendered output file (either the saved .ods or the
    converted file).

    Raises
    ------
    FileNotFoundError, ValueError, RuntimeError
    """
    if not os.path.isfile(template_path):
        raise FileNotFoundError(f"template not found: {template_path}")

    # Load the template
    doc = ods_load(template_path)
    # ods_load returns OpenDocument — spreadsheet body is the first child
    sheets = list(doc.spreadsheet.getElementsByType(Table))
    if not sheets:
        raise ValueError("no sheets found in template")
    sheet = sheets[0]  # use the first sheet

    # Build default band config if not provided
    if band_config is None:
        band_config = _auto_band_config(data)

    # Process bands in a specific order:
    # Non-detail bands (fixed positions) are processed first so detail
    # row cloning doesn't shift their row indices.
    # Detail comes last.

    # ── title ──
    if "title" in band_config and "title" in data:
        title_data = data["title"]
        if isinstance(title_data, str):
            title_data = {"value": title_data}
        process_title_band(sheet, band_config["title"], title_data)

    # ── header ──
    if "header" in band_config and "header" in data:
        header_data = data["header"]
        if isinstance(header_data, str):
            header_data = {"value": header_data}
        process_header_footer_band(sheet, band_config["header"], header_data)

    # ── summary ──  (before detail so row indices stay stable)
    if "summary" in band_config and "summary" in data:
        summary_data = data["summary"]
        if isinstance(summary_data, str):
            summary_data = {"value": summary_data}
        process_summary_band(sheet, band_config["summary"], summary_data)

    # ── footer ──  (before detail so row indices stay stable)
    if "footer" in band_config and "footer" in data:
        footer_data = data["footer"]
        if isinstance(footer_data, str):
            footer_data = {"value": footer_data}
        process_header_footer_band(sheet, band_config["footer"], footer_data)

    # ── detail ──  (last — cloning shifts subsequent row indices)
    if "detail" in band_config and "detail" in data:
        records = data["detail"]
        if not isinstance(records, list):
            raise TypeError(
                f"'detail' data must be a list of dicts, got {type(records).__name__}"
            )
        process_detail_band(sheet, band_config["detail"], records)

    # Resolve output path (default from template name)
    out_path = output_path
    if out_path is None:
        base = os.path.splitext(os.path.basename(template_path))[0]
        out_path = f"{base}.{output_format}"

    # Save the filled .ods
    ods_output = out_path
    if output_format != "ods":
        ods_output = os.path.splitext(out_path)[0] + ".filled.ods"

    doc.save(ods_output)
    print(f"  [ok] filled template saved: {ods_output}")

    # Convert if needed
    if output_format == "ods":
        return ods_output

    output_dir = os.path.dirname(os.path.abspath(out_path))
    converted = convert_with_libreoffice(ods_output, output_format, output_dir)

    # If out_path differs from converted, rename
    if os.path.abspath(converted) != os.path.abspath(out_path):
        if os.path.exists(out_path):
            os.remove(out_path)
        os.rename(converted, out_path)
        converted = out_path

    # Clean up temporary .ods
    if ods_output != out_path and os.path.exists(ods_output):
        os.remove(ods_output)

    return converted


# ─── Helpers ────────────────────────────────────────────────


def _auto_band_config(data: dict) -> dict:
    """Auto-assign row numbers to bands based on data keys.

    Purely sequential: title=0, header=1, detail=2, summary=3, footer=4.
    Each band occupies one row.
    """
    order = ["cover", "title", "header", "detail", "summary", "footer"]
    config: dict = {}
    next_row = 0
    for name in order:
        if name in data or name == "detail":  # detail always included if present
            pass
        if name in data:
            config[name] = {"start_row": next_row, "end_row": next_row}
            next_row += 1
    # Also add detail if it's in data (it was in the order above)
    if "detail" in data and "detail" not in config:
        config["detail"] = {"start_row": next_row, "end_row": next_row}
    return config


# ─── CLI entry point ────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Render .ods report template and export to PDF/CSV/XLSX/HTML",
    )
    parser.add_argument(
        "--template", "-t",
        required=True,
        help="Path to the .ods template file",
    )
    parser.add_argument(
        "--data", "-d",
        required=True,
        help="JSON string or path to JSON file with band data",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output file path (default: auto-named from template)",
    )
    parser.add_argument(
        "--format", "-f",
        default="pdf",
        choices=["pdf", "csv", "xlsx", "html", "ods"],
        help="Output format (default: pdf)",
    )
    parser.add_argument(
        "--band-config", "-b",
        default=None,
        help="JSON string or path to JSON file for band row config",
    )

    args = parser.parse_args(argv)

    # Resolve data
    data = _load_json_arg(args.data)
    if not isinstance(data, dict):
        print("error: --data must resolve to a JSON object (dict)", file=sys.stderr)
        return 1

    # Resolve band config
    band_config = None
    if args.band_config:
        band_config = _load_json_arg(args.band_config)

    # Resolve output path
    output_path = args.output
    if output_path is None:
        base = os.path.splitext(os.path.basename(args.template))[0]
        output_path = f"{base}.{args.format}"

    try:
        result = render_report(
            template_path=args.template,
            data=data,
            output_path=output_path,
            output_format=args.format,
            band_config=band_config,
        )
        print(f"  [done] report rendered: {result}")
        return 0
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _load_json_arg(arg: str) -> Any:
    """Load a JSON string or JSON file path into a Python object."""
    if arg.startswith("{") or arg.startswith("["):
        return json.loads(arg)
    if os.path.isfile(arg):
        with open(arg, "r") as fh:
            return json.load(fh)
    # Try as a file path (even if it doesn't start with typical file indicators)
    if os.path.isfile(arg):
        with open(arg, "r") as fh:
            return json.load(fh)
    # Last resort: raw JSON parse
    return json.loads(arg)


if __name__ == "__main__":
    sys.exit(main())