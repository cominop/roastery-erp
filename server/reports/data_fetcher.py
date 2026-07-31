#!/usr/bin/env python3
"""
data_fetcher.py — Query PostgreSQL and build band data JSON for report rendering.

Called by the Node.js server (index.cjs) before invoking the renderer.
Returns a JSON dict with band keys (title, header, detail, summary, footer).

Usage:
  python3 server/reports/data_fetcher.py <report_name> <parameters_json>
  python3 server/reports/data_fetcher.py invoice '{"order_id": "28503"}'
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime

import psycopg2
import psycopg2.extras

# ─── DB connection ──────────────────────────────────────────

DB_CONFIG = {
    "host": os.environ.get("PGHOST", "localhost"),
    "port": int(os.environ.get("PGPORT", "5432")),
    "dbname": os.environ.get("PGDATABASE", "polyaccess"),
    "user": os.environ.get("PGUSER", os.environ.get("USER", "fcc-student")),
}

SCHEMA = "db_fcc_erp"


def get_conn():
    return psycopg2.connect(**DB_CONFIG)


# ─── Report data builders ───────────────────────────────────


def fetch_invoice(params: dict) -> dict:
    """Fetch a single invoice by order_id with line items."""
    order_id = params.get("order_id")
    if not order_id:
        return {"error": "order_id is required"}

    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Main order + customer
        cur.execute(f"""
            SELECT o.orderid, o.orderdate, o.order_total, o.freightcharge,
                   o.salestaxrate, o.shipname, o.shipaddress, o.shipcity,
                   o.shipstateorprovince, o.shippostalcode,
                   c.companyname, c.city, c.stateorprovince
            FROM {SCHEMA}.orders o
            LEFT JOIN {SCHEMA}.customers c ON o.customerid = c.customerid
            WHERE o.orderid = %s
        """, (int(order_id),))
        order = cur.fetchone()
        if not order:
            return {"error": f"Order {order_id} not found"}

        # Line items
        cur.execute(f"""
            SELECT od.orderdetailid, od.quantity, od.unitprice, od.discount,
                   p.productname, p.unit
            FROM {SCHEMA}.order_details od
            LEFT JOIN {SCHEMA}.products p ON od.productid = p.productid
            WHERE od.orderid = %s
            ORDER BY od.orderdetailid
        """, (int(order_id),))
        items = cur.fetchall()

        now = datetime.now().strftime("%Y-%m-%d %H:%M")

        # Build title data
        title_data = {
            "title": "INVOICE",
            "invoice_number": str(order["orderid"]),
            "date": str(order["orderdate"]) if order["orderdate"] else "",
        }

        # Build detail rows
        detail = []
        subtotal = 0.0
        for item in items:
            qty = float(item["quantity"] or 1)
            price = float(item["unitprice"] or 0)
            disc = float(item["discount"] or 0)
            line_total = qty * price * (1 - disc / 100)
            subtotal += line_total
            detail.append({
                "product_name": item["productname"] or f"Product #{item['orderdetailid']}",
                "quantity": f"{qty:.2f}",
                "unit_price": f"${price:.2f}",
                "discount": f"{disc:.1f}%" if disc else "",
                "tax": "",
                "line_total": f"${line_total:.2f}",
            })

        tax_total = subtotal * float(order["salestaxrate"] or 0)
        shipping = float(order["freightcharge"] or 0)
        grand_total = subtotal + tax_total + shipping

        # Summary
        summary_data = {
            "subtotal": f"${subtotal:.2f}",
            "tax_total": f"${tax_total:.2f}",
            "shipping": f"${shipping:.2f}",
            "grand_total": f"${grand_total:.2f}",
        }

        # Footer
        footer_data = {
            "generated_at": now,
        }

        return {
            "title": title_data,
            "header": {},
            "detail": detail,
            "summary": summary_data,
            "footer": footer_data,
        }

    finally:
        conn.close()


def fetch_invoice_summary(params: dict) -> dict:
    """Aggregated invoice data over a date range."""
    date_from = params.get("date_from", "2000-01-01")
    date_to = params.get("date_to", "2030-12-31")

    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(f"""
            SELECT o.orderid, o.orderdate, o.order_total,
                   c.companyname
            FROM {SCHEMA}.orders o
            LEFT JOIN {SCHEMA}.customers c ON o.customerid = c.customerid
            WHERE o.orderdate >= %s AND o.orderdate <= %s
            ORDER BY o.orderdate
            LIMIT 500
        """, (date_from, date_to))
        orders = cur.fetchall()

        now = datetime.now().strftime("%Y-%m-%d %H:%M")

        title_data = {
            "title": "Invoice Summary",
            "date_from": date_from,
            "date_to": date_to,
        }

        detail = []
        grand_total = 0.0
        for o in orders:
            total = float(o["order_total"] or 0)
            grand_total += total
            detail.append({
                "invoice_number": str(o["orderid"]),
                "date": str(o["orderdate"])[:10] if o["orderdate"] else "",
                "customer_name": o["companyname"] or "",
                "total": f"${total:.2f}",
            })

        summary_data = {
            "invoice_count": str(len(orders)),
            "grand_total": f"${grand_total:.2f}",
        }

        footer_data = {
            "generated_at": now,
        }

        return {
            "title": title_data,
            "detail": detail,
            "summary": summary_data,
            "footer": footer_data,
        }
    finally:
        conn.close()


def fetch_customer_statement(params: dict) -> dict:
    """All transactions for a customer within a date range."""
    customer_id = params.get("customer_id")
    date_from = params.get("date_from", "2000-01-01")
    date_to = params.get("date_to", "2030-12-31")

    if not customer_id:
        return {"error": "customer_id is required"}

    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Customer info
        cur.execute(f"""
            SELECT customerid, companyname, city, stateorprovince,
                   billingaddress
            FROM {SCHEMA}.customers
            WHERE customerid = %s
        """, (int(customer_id),))
        customer = cur.fetchone()
        if not customer:
            return {"error": f"Customer {customer_id} not found"}

        # Orders as transactions
        cur.execute(f"""
            SELECT orderid, orderdate, order_total
            FROM {SCHEMA}.orders
            WHERE customerid = %s AND orderdate >= %s AND orderdate <= %s
            ORDER BY orderdate
            LIMIT 500
        """, (int(customer_id), date_from, date_to))
        orders = cur.fetchall()

        now = datetime.now().strftime("%Y-%m-%d %H:%M")

        name = customer["companyname"] or f"Customer #{customer['customerid']}"
        address = customer.get("billingaddress") or ""
        city_state = f"{customer.get('city', '')}, {customer.get('stateorprovince', '')}"

        detail = []
        total_charges = 0.0
        for o in orders:
            total = float(o["order_total"] or 0)
            total_charges += total
            detail.append({
                "description": "Invoice / Sale",
                "date": str(o["orderdate"])[:10] if o["orderdate"] else "",
                "invoice_number": str(o["orderid"]),
                "charges": f"${total:.2f}",
                "payments": "",
            })

        summary_data = {
            "total_charges": f"${total_charges:.2f}",
            "total_payments": "$0.00",
            "balance_due": f"${total_charges:.2f}",
        }

        title_data = {
            "title": "Customer Statement",
            "customer_name": name,
            "customer_address": address,
            "customer_city_state": city_state,
            "date_from": date_from,
            "date_to": date_to,
        }

        footer_data = {
            "generated_at": now,
        }

        return {
            "title": title_data,
            "header": {},
            "detail": detail,
            "summary": summary_data,
            "footer": footer_data,
        }
    finally:
        conn.close()


def fetch_inventory_list(params: dict) -> dict:
    """Complete list of products as inventory."""
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(f"""
            SELECT productid, productname, category, unitcost, unitprice,
                   vendorname
            FROM {SCHEMA}.products
            WHERE discontinued IS NOT TRUE
            ORDER BY productname
            LIMIT 500
        """)
        products = cur.fetchall()

        now = datetime.now().strftime("%Y-%m-%d %H:%M")

        detail = []
        total_value = 0.0
        for p in products:
            cost = float(p["unitcost"] or 0)
            price = float(p["unitprice"] or 0)
            total_value += cost
            detail.append({
                "product_id": str(p["productid"]),
                "product_name": p["productname"] or "",
                "category": p["category"] or "",
                "unit_cost": f"${cost:.2f}",
                "unit_price": f"${price:.2f}",
                "vendor": p["vendorname"] or "",
                "on_hand": "",  # No real-time stock in this schema
            })

        return {
            "title": {
                "title": "Inventory List",
                "report_date": now,
            },
            "detail": detail,
            "footer": {
                "total_items": str(len(products)),
                "total_value": f"${total_value:.2f}",
            },
        }
    finally:
        conn.close()


def fetch_work_order(params: dict) -> dict:
    """Single work order by workorder_id."""
    workorder_id = params.get("workorder_id")
    if not workorder_id:
        return {"error": "workorder_id is required"}

    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(f"""
            SELECT w.*, c.companyname, e.firstname || ' ' || e.lastname AS assigned_name
            FROM {SCHEMA}.workorders w
            LEFT JOIN {SCHEMA}.customers c ON w.customerid = c.customerid
            LEFT JOIN {SCHEMA}.employees e ON w.assignedemployeeid = e.employeeid
            WHERE w.workorderid = %s
        """, (int(workorder_id),))
        wo = cur.fetchone()
        if not wo:
            return {"error": f"Work order {workorder_id} not found"}

        # Labor lines
        cur.execute(f"""
            SELECT billablehours, billingrate, comment
            FROM {SCHEMA}.workorder_labor
            WHERE workorderid = %s
            ORDER BY workorderlaborid
        """, (int(workorder_id),))
        labor_items = cur.fetchall()

        # Parts lines
        cur.execute(f"""
            SELECT quantity, unitprice
            FROM {SCHEMA}.workorder_parts
            WHERE workorderid = %s
            ORDER BY workorderpartid
        """, (int(workorder_id),))
        part_items = cur.fetchall()

        now = datetime.now().strftime("%Y-%m-%d %H:%M")

        labor_total = sum(float(l["billablehours"] or 0) * float(l["billingrate"] or 0) for l in labor_items)
        parts_total = sum(float(p["quantity"] or 0) * float(p["unitprice"] or 0) for p in part_items)

        # Build detail rows combining labor and parts
        detail = []

        for l in labor_items:
            detail.append({
                "field_name": "Labor",
                "field_value": l["comment"] or "",
                "date": "",
                "assigned_to": "",
            })

        for p in part_items:
            detail.append({
                "field_name": "Part",
                "field_value": f"Qty {p['quantity']} x ${float(p['unitprice'] or 0):.2f}",
                "date": "",
                "assigned_to": "",
            })

        title_data = {
            "title": "Work Order",
            "workorder_id": str(wo["workorderid"]),
            "status": wo["status"] or "Open",
            "customer_name": wo["companyname"] or f"Customer #{wo['customerid']}",
            "equipment": wo.get("makeandmodel") or "",
            "serial_number": wo.get("serialnumber") or "",
        }

        summary_data = {
            "labor_total": f"${labor_total:.2f}",
            "parts_total": f"${parts_total:.2f}",
            "grand_total": f"${labor_total + parts_total:.2f}",
        }

        footer_data = {
            "problem_description": wo.get("problemdescription") or "",
            "generated_at": now,
        }

        return {
            "title": title_data,
            "header": {},
            "detail": detail,
            "summary": summary_data,
            "footer": footer_data,
        }
    finally:
        conn.close()


# ─── Dispatcher ─────────────────────────────────────────────

FETCHERS = {
    "invoice": fetch_invoice,
    "invoice-summary": fetch_invoice_summary,
    "customer-statement": fetch_customer_statement,
    "inventory-list": fetch_inventory_list,
    "work-order": fetch_work_order,
}


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    if len(argv) < 1:
        print("Usage: data_fetcher.py <report_name> [parameters_json]", file=sys.stderr)
        return 1

    report_name = argv[0]
    params = json.loads(argv[1]) if len(argv) > 1 else {}

    fetcher = FETCHERS.get(report_name)
    if not fetcher:
        print(json.dumps({"error": f"Unknown report: {report_name}"}))
        return 1

    try:
        result = fetcher(params)
        if "error" in result:
            print(json.dumps(result), file=sys.stderr)
            return 1
        print(json.dumps(result))
        return 0
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())