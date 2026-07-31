#!/usr/bin/env python3
"""
create_templates.py — Generate .ods template files for the 5 PoC reports.

Each template uses %(marker)s placeholders that the band processor fills.
Minimal styling — just plain cell text with markers.
Run:  python3 server/reports/create_templates.py
"""

from __future__ import annotations

import os
import sys

from odf.opendocument import OpenDocumentSpreadsheet
from odf.table import Table, TableColumn, TableRow, TableCell
from odf.text import P

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")


def _cell(text: str) -> TableCell:
    c = TableCell()
    p = P(text=text)
    c.addElement(p)
    return c


def _row(*cells: TableCell) -> TableRow:
    r = TableRow()
    for c in cells:
        r.addElement(c)
    return r


def build_invoice_template(doc: OpenDocumentSpreadsheet):
    """Invoice — title rows 0-2, header row 3, detail row 4, summary rows 6-9, footer rows 10-12."""
    table = Table(name="Invoice")

    # Row 0-2: TITLE band
    table.addElement(_row(_cell("INVOICE")))
    table.addElement(_row(_cell("Invoice # %(invoice_number)s"), _cell("Date: %(date)s")))
    table.addElement(_row(_cell("Ship To: %(ship_to)s"), _cell("")))

    # Row 3: HEADER band
    table.addElement(_row(
        _cell("Product"), _cell("Qty"), _cell("Unit Price"),
        _cell("Discount"), _cell("Tax"), _cell("Total"),
    ))

    # Row 4: DETAIL band
    table.addElement(_row(
        _cell("%(product_name)s"), _cell("%(quantity)s"),
        _cell("%(unit_price)s"), _cell("%(discount)s"),
        _cell("%(tax)s"), _cell("%(line_total)s"),
    ))

    # Row 5: blank spacer
    table.addElement(_row(_cell("")))

    # Rows 6-9: SUMMARY band
    table.addElement(_row(_cell("Subtotal:"), _cell(""), _cell(""), _cell(""), _cell(""), _cell("%(subtotal)s")))
    table.addElement(_row(_cell("Tax:"), _cell(""), _cell(""), _cell(""), _cell(""), _cell("%(tax_total)s")))
    table.addElement(_row(_cell("Shipping:"), _cell(""), _cell(""), _cell(""), _cell(""), _cell("%(shipping)s")))
    table.addElement(_row(_cell("Grand Total:"), _cell(""), _cell(""), _cell(""), _cell(""), _cell("%(grand_total)s")))

    # Rows 10-11: FOOTER band
    table.addElement(_row(_cell("")))
    table.addElement(_row(_cell("Generated: %(generated_at)s")))

    doc.spreadsheet.addElement(table)


def build_invoice_summary_template(doc: OpenDocumentSpreadsheet):
    """Invoice Summary — title 0-1, detail 2-3, summary 5, footer 6-7."""
    table = Table(name="InvoiceSummary")

    # Title band (rows 0-1)
    table.addElement(_row(_cell("Invoice Summary")))
    table.addElement(_row(_cell("Period: %(date_from)s to %(date_to)s")))

    # Detail band (rows 2-3) — header + data row
    table.addElement(_row(
        _cell("Invoice #"), _cell("Date"), _cell("Customer"), _cell("Total"),
    ))
    table.addElement(_row(
        _cell("%(invoice_number)s"), _cell("%(date)s"),
        _cell("%(customer_name)s"), _cell("%(total)s"),
    ))

    # Row 4: blank
    table.addElement(_row(_cell("")))

    # Summary (row 5)
    table.addElement(_row(
        _cell("Total Invoices:"), _cell(""),
        _cell("%(invoice_count)s"), _cell("%(grand_total)s"),
    ))

    # Footer (rows 6-7)
    table.addElement(_row(_cell("")))
    table.addElement(_row(_cell("Generated: %(generated_at)s")))

    doc.spreadsheet.addElement(table)


def build_customer_statement_template(doc: OpenDocumentSpreadsheet):
    """Customer Statement — title 0-3, header 4, detail 5, summary 7-9, footer 11-12."""
    table = Table(name="CustomerStatement")

    # Title band (rows 0-3)
    table.addElement(_row(_cell("Customer Statement")))
    table.addElement(_row(_cell("%(customer_name)s"), _cell("Period: %(date_from)s to %(date_to)s")))
    table.addElement(_row(_cell("Address: %(customer_address)s")))
    table.addElement(_row(_cell("%(customer_city_state)s")))

    # Header band (row 4)
    table.addElement(_row(
        _cell("Description"), _cell("Date"), _cell("Invoice #"),
        _cell("Charges"), _cell("Payments"),
    ))

    # Detail band (row 5)
    table.addElement(_row(
        _cell("%(description)s"), _cell("%(date)s"),
        _cell("%(invoice_number)s"), _cell("%(charges)s"),
        _cell("%(payments)s"),
    ))

    # Row 6: blank
    table.addElement(_row(_cell("")))

    # Summary band (rows 7-9)
    table.addElement(_row(_cell("Total Charges:"), _cell(""), _cell(""), _cell("%(total_charges)s"), _cell("")))
    table.addElement(_row(_cell("Total Payments:"), _cell(""), _cell(""), _cell(""), _cell("%(total_payments)s")))
    table.addElement(_row(_cell("Balance Due:"), _cell(""), _cell(""), _cell(""), _cell("%(balance_due)s")))

    # Footer band (rows 10-12)
    table.addElement(_row(_cell("")))
    table.addElement(_row(_cell("This statement shows transactions for the selected period.")))
    table.addElement(_row(_cell("Generated: %(generated_at)s")))

    doc.spreadsheet.addElement(table)


def build_inventory_list_template(doc: OpenDocumentSpreadsheet):
    """Inventory List — title 0, detail 1-2 (header + data), footer 4."""
    table = Table(name="InventoryList")

    # Title band
    table.addElement(_row(_cell("Inventory List")))
    table.addElement(_row(_cell("As of: %(report_date)s")))

    # Detail band — header + data row
    table.addElement(_row(
        _cell("ID"), _cell("Product Name"), _cell("Category"),
        _cell("Unit Cost"), _cell("Unit Price"), _cell("Vendor"),
    ))
    table.addElement(_row(
        _cell("%(product_id)s"), _cell("%(product_name)s"),
        _cell("%(category)s"), _cell("%(unit_cost)s"),
        _cell("%(unit_price)s"), _cell("%(vendor)s"),
    ))

    # Row 4: blank
    table.addElement(_row(_cell("")))

    # Footer
    table.addElement(_row(
        _cell("Total Items:"), _cell("%(total_items)s"),
        _cell("Total Value:"), _cell("%(total_value)s"),
    ))

    doc.spreadsheet.addElement(table)


def build_work_order_template(doc: OpenDocumentSpreadsheet):
    """Work Order — title 0-3, header 4, detail 5, summary 7-9, footer 10-13."""
    table = Table(name="WorkOrder")

    # Title band (rows 0-3)
    table.addElement(_row(_cell("Work Order")))
    table.addElement(_row(_cell("WO #%(workorder_id)s"), _cell("Status: %(status)s")))
    table.addElement(_row(_cell("Customer: %(customer_name)s")))
    table.addElement(_row(_cell("Equipment: %(equipment)s"), _cell("Serial: %(serial_number)s")))

    # Header band (row 4)
    table.addElement(_row(
        _cell("Field"), _cell("Details"), _cell("Date"), _cell("Assigned To"),
    ))

    # Detail band (row 5)
    table.addElement(_row(
        _cell("%(field_name)s"), _cell("%(field_value)s"),
        _cell("%(date)s"), _cell("%(assigned_to)s"),
    ))

    # Row 6: blank
    table.addElement(_row(_cell("")))

    # Summary band (rows 7-9)
    table.addElement(_row(_cell("Labor:"), _cell("%(labor_total)s")))
    table.addElement(_row(_cell("Parts:"), _cell("%(parts_total)s")))
    table.addElement(_row(_cell("Grand Total:"), _cell("%(grand_total)s")))

    # Footer band (rows 10-13)
    table.addElement(_row(_cell("")))
    table.addElement(_row(_cell("Problem Description:")))
    table.addElement(_row(_cell("%(problem_description)s")))
    table.addElement(_row(_cell("Generated: %(generated_at)s")))

    doc.spreadsheet.addElement(table)


def main():
    os.makedirs(TEMPLATES_DIR, exist_ok=True)

    builders = [
        ("invoice.ods", build_invoice_template),
        ("invoice-summary.ods", build_invoice_summary_template),
        ("customer-statement.ods", build_customer_statement_template),
        ("inventory-list.ods", build_inventory_list_template),
        ("work-order.ods", build_work_order_template),
    ]

    for filename, builder in builders:
        doc = OpenDocumentSpreadsheet()
        builder(doc)
        out_path = os.path.join(TEMPLATES_DIR, filename)
        doc.save(out_path)
        print(f"  [ok] created: {out_path}")

    print(f"\n  [done] {len(builders)} templates created in {TEMPLATES_DIR}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())