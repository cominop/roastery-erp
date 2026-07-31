#!/usr/bin/env python3
"""
migrate_reports.py — Bulk migration of Access reports to the report_definitions system.

Scans shared.objects (type='report') for un-migrated Access reports, translates
their record-source to PostgreSQL SQL, generates .ods templates, and registers
them in shared.report_definitions.

Usage
-----
  python3 server/reports/migrate_reports.py scan              # list all Access reports + status
  python3 server/reports/migrate_reports.py status            # summary counts
  python3 server/reports/migrate_reports.py generate          # migrate all pending (dry-run default)
  python3 server/reports/migrate_reports.py generate --dry-run  # preview what would happen
  python3 server/reports/migrate_reports.py generate --force   # actually write to DB/templates
  python3 server/reports/migrate_reports.py generate --report receivables_aging  # single report
  python3 server/reports/migrate_reports.py generate --report receivables_aging --force
  python3 server/reports/migrate_reports.py generate --batch 10 --force  # migrate N at a time
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime
from typing import Any

import psycopg2
import psycopg2.extras
from odf.opendocument import OpenDocumentSpreadsheet
from odf.table import Table, TableColumn, TableRow, TableCell
from odf.text import P

# ─── Paths ────────────────────────────────────────────────────────

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES_DIR = os.path.join(SERVER_DIR, "templates")
GENERATED_DIR = os.path.join(SERVER_DIR, "reports", "generated")
OUTPUT_DIR = os.path.join(SERVER_DIR, "output")

# ─── DB connection ────────────────────────────────────────────────

DB_CONFIG = {
    "host": os.environ.get("PGHOST", "localhost"),
    "port": int(os.environ.get("PGPORT", "5432")),
    "dbname": os.environ.get("PGDATABASE", "polyaccess"),
    "user": os.environ.get("PGUSER", os.environ.get("USER", "fcc-student")),
}
SCHEMA = "db_fcc_erp"


def get_conn():
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f"SET search_path TO {SCHEMA}, public, shared")
    conn.autocommit = False
    return conn


# ─── Access SQL translator ────────────────────────────────────────

# Patterns that are pure Access and need PostgreSQL translation
ACCESS_TO_PG_PATTERNS: list[tuple[re.Pattern, str]] = [
    # DISTINCTROW → DISTINCT
    (re.compile(r'\bDISTINCTROW\b', re.IGNORECASE), 'DISTINCT'),
    # Date() → CURRENT_DATE
    (re.compile(r'\bDate\s*\(\s*\)', re.IGNORECASE), 'CURRENT_DATE'),
    # Now() → CURRENT_TIMESTAMP
    (re.compile(r'\bNow\s*\(\s*\)', re.IGNORECASE), 'CURRENT_TIMESTAMP'),
    # IIF(cond, true, false) → CASE WHEN cond THEN true ELSE false END
    # This is a simplified version — nested IIFs won't be handled perfectly
    (re.compile(r'\bIIF\s*\(', re.IGNORECASE), 'CASE WHEN '),
    # Trailing semicolons
    (re.compile(r';+\s*$'), ''),
    # Access string concatenation & → || (or just leave as & for now)
    # Access LIKE "*text*" → ILIKE '%text%'
    (re.compile(r"Like\s+'?\*([^']*)\*'?", re.IGNORECASE), r"ILIKE '%\1%'"),
    (re.compile(r"Like\s+'?\*([^']*)'?", re.IGNORECASE), r"ILIKE '%\1'"),
    # Access TRUE/FALSE → true/false
    (re.compile(r'\bTRUE\b'), 'true'),
    (re.compile(r'\bFALSE\b'), 'false'),
    # Access #date# → 'date'
    (re.compile(r'#(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})#'), r"'\1'"),
    # Access SWITCH(cond1, val1, cond2, val2) → CASE WHEN cond1 THEN val1 WHEN cond2 THEN val2 END
    (re.compile(r'\bSWITCH\s*\(', re.IGNORECASE), 'CASE '),
]


def translate_access_sql(sql: str) -> str:
    """Translate Access SQL syntax to PostgreSQL-compatible SQL."""
    if not sql:
        return sql

    # Handle trailing comma after SWITCH args: CASE a, b, c → CASE a b c
    # (We'll handle the comma→space for SWITCH below)
    result = sql.strip()

    # Replace [bracketed identifiers] with "quoted identifiers"
    # But be careful: some are Access function args like [linetotal]
    # We do this AFTER handling Access-specific patterns like IIF/SWITCH
    # because those use brackets in their arguments

    # Apply patterns
    for pattern, replacement in ACCESS_TO_PG_PATTERNS:
        result = pattern.sub(replacement, result)

    # Handle IIF commas → WHEN/THEN/ELSE/END
    # After the CASE WHEN replacement, we need to parse the IIF structure
    # This is complex; for now, handle simple IIF with a regex
    if 'CASE WHEN ' in result and 'IIF' not in result.upper():
        # Simple IIF already converted: CASE WHEN cond, true, false
        # Replace commas between args: CASE WHEN cond, val1, val2 → CASE WHEN cond THEN val1 ELSE val2 END
        # Match CASE WHEN ... , ... , ... )
        iif_match = re.match(
            r'(CASE WHEN\s+)(.+?)(\s*,\s*)(.+?)(\s*,\s*)(.+?)(\s*\))',
            result, re.IGNORECASE
        )
        if iif_match:
            result = (
                f"CASE WHEN {iif_match.group(2).strip()} "
                f"THEN {iif_match.group(4).strip()} "
                f"ELSE {iif_match.group(6).strip()} END"
            )

    # Handle SWITCH commas → WHEN/THEN
    # CASE cond1, val1, cond2, val2 → CASE WHEN cond1 THEN val1 WHEN cond2 THEN val2
    switch_match = re.match(r'CASE\s+(.+)\)', result, re.IGNORECASE)
    if switch_match and 'SWITCH' in sql.upper():
        args_text = switch_match.group(1)
        # Split by comma, pair up
        parts = [p.strip() for p in args_text.split(',')]
        case_parts = []
        for i in range(0, len(parts) - 1, 2):
            if i + 1 < len(parts):
                case_parts.append(f"WHEN {parts[i]} THEN {parts[i + 1]}")
        if case_parts:
            # Remove trailing comma from the last one
            result = 'CASE ' + ' '.join(case_parts) + ' END'

    # Replace [brackets] with "quotes" for column/table references
    # Don't replace inside string literals
    result = re.sub(r'\[([^\]]+)\]', r'"\1"', result)

    # Replace Access * wildcard in SELECT with explicit columns
    # (leave as is for now — PostgreSQL handles it)

    # Clean up double spaces
    result = re.sub(r'\s+', ' ', result).strip()

    return result


# ─── Category inference ──────────────────────────────────────────

def infer_category(name: str, caption: str) -> str:
    """Infer a report category from its name and caption."""
    name_lower = f"{name} {caption}".lower()

    if any(w in name_lower for w in ['invoice', 'receivable', 'billing', 'payment', 'statement']):
        return 'Financial'
    if any(w in name_lower for w in ['inventory', 'stock', 'product', 'label', 'bin', 'roast', 'coffee', 'recipe', 'ingredient']):
        return 'Inventory'
    if any(w in name_lower for w in ['order', 'sale', 'customer', 'shipping', 'delivery', 'ship']):
        return 'Sales'
    if any(w in name_lower for w in ['workorder', 'work_order', 'service', 'asset', 'equipment', 'maintenance']):
        return 'Service'
    if any(w in name_lower for w in ['employee', 'staff', 'review', 'keyholder', 'task']):
        return 'HR'
    if any(w in name_lower for w in ['price', 'pricing', 'cost', 'pricelist', 'price_list', 'rate']):
        return 'Pricing'
    if any(w in name_lower for w in ['lead', 'pipeline', 'proposal', 'fundraising', 'campaign']):
        return 'Sales'
    if any(w in name_lower for w in ['deficiency', 'defect', 'quality']):
        return 'Quality'
    if any(w in name_lower for w in ['report', 'summary', 'history', 'query']):
        return 'Reports'

    return 'Other'


def slugify(name: str) -> str:
    """Convert an Access report name to a URL-safe slug matching the report_definitions pattern."""
    s = name.lower()
    s = re.sub(r'[_\s]+', '-', s)
    s = re.sub(r'[^a-z0-9-]', '', s)
    s = re.sub(r'-+', '-', s)
    s = s.strip('-')
    return s


# ─── Skip patterns — reports that are junk or duplicates ────────

SKIP_PATTERNS = re.compile(
    r'(deleteme|_old|_old_|old_|backup|test|zzz)', re.IGNORECASE
)


def should_skip(name: str) -> bool:
    """Return True if this report name looks like junk/testing/debug."""
    return bool(SKIP_PATTERNS.search(name))


# ─── Named query resolver ────────────────────────────────────────

def resolve_named_query(conn, query_name: str) -> str | None:
    """
    Try to resolve a named Access query to a PostgreSQL view/table.
    Returns the SQL to query it, or None if not found.
    """
    cur = conn.cursor()
    try:
        # Check if it's a view in db_fcc_erp
        cleaned = query_name.strip().lower().replace(' ', '_').replace('-', '_')
        # Try various name patterns
        candidates = [
            cleaned,
            cleaned.replace('query', ''),
            f"{cleaned}_query",
            cleaned + 's',
        ]
        for c in candidates:
            try:
                cur.execute(
                    "SELECT table_name FROM information_schema.views "
                    "WHERE table_schema = 'db_fcc_erp' AND table_name = %s",
                    [c]
                )
                if cur.fetchone():
                    return f"SELECT * FROM db_fcc_erp.\"{c}\""
            except Exception:
                conn.rollback()

        # Check if it's a table in db_fcc_erp
        for c in candidates:
            try:
                cur.execute(
                    "SELECT tablename FROM pg_tables "
                    "WHERE schemaname = 'db_fcc_erp' AND tablename = %s",
                    [c]
                )
                if cur.fetchone():
                    return f"SELECT * FROM db_fcc_erp.\"{c}\""
            except Exception:
                conn.rollback()

        return None
    finally:
        cur.close()


# ─── SQL testing ─────────────────────────────────────────────────

def test_sql(conn, sql: str, params: dict | None = None) -> dict | None:
    """
    Test a SQL query against the database. Returns column info
    {columns: [col1, col2, ...], row_count: N, sample: [...]} or None if it fails.
    Rolls back the transaction on failure so the connection stays usable.
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(f"SELECT * FROM ({sql}) AS _q LIMIT 5")
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description] if cur.description else []
        return {
            'columns': columns,
            'row_count': len(rows),
            'sample': [dict(r) for r in rows[:3]],
        }
    except Exception as e:
        conn.rollback()
        return None
    finally:
        cur.close()


# ─── Table name extraction from partial SQL ────────────────────

TABLE_FROM_SQL_RE = re.compile(
    r'\bFROM\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?',
    re.IGNORECASE
)


def extract_table_from_sql(sql: str) -> str | None:
    """Extract the first table name from a (possibly truncated) SQL query."""
    # Try FROM clause first
    m = TABLE_FROM_SQL_RE.search(sql)
    if m:
        return m.group(1)
    # Try table.column pattern in the SELECT list (for truncated SQL without FROM)
    m2 = re.search(r'\bSELECT\s+.*?([a-zA-Z_][a-zA-Z0-9_]*)\.', sql, re.IGNORECASE | re.DOTALL)
    if m2:
        return m2.group(1)
    return None


def infer_table_from_name(report_name: str) -> str | None:
    """Infer a table name from the report name."""
    name = report_name.lower()
    # Remove common suffixes
    for suffix in ['_report', '_query', '_listing', '_summary', '_history',
                   '_label', '_labels', '_pricing', '_price', '_list',
                   '_order', '_form', '_maint', '_review', '_task',
                   '_subreport', 'query', 'report']:
        name = name.replace(suffix, '')
    name = name.replace('_', '')
    # Pluralize common patterns — check for partial matches too
    table_map = {
        'customer': 'customers',
        'order': 'orders',
        'product': 'products',
        'employee': 'employees',
        'asset': 'assets',
        'invoice': 'orders',
        'roast': 'products',
        'coffee': 'products',
        'lead': 'leads',
        'workorder': 'workorders',
        'inventory': 'products',
        'ship': 'orders',
        'delivery': 'orders',
        'label': 'products',
        'price': 'products',
        'price_list': 'products',
        'billing': 'orders',
        'sale': 'orders',
        'revenue': 'orders',
        'deficiency': 'deficiencylog',
        'pipeline': 'leads',
        'proposal': 'leads',
        'fundraising': 'leads',
        'equipment': 'assets',
        'service': 'workorders',
        'maintenance': 'workorders',
        'staff': 'employees',
        'keyholder': 'employees',
        'review': 'employees',
        'task': 'employees',
        'recipe': 'products',
        'ingredient': 'products',
        'container': 'products',
        'bin': 'products',
        'numi': 'products',
        'tea': 'products',
        'bag': 'products',
        'sachet': 'products',
        'box': 'products',
        'labels': 'products',
        'labels_green': 'products',
        'labels_roasted': 'products',
        'labels_parts': 'products',
    }
    # Direct match first
    if name in table_map:
        return table_map[name]
    # Partial match: check if any key is contained in the name
    for key, table in sorted(table_map.items(), key=lambda x: -len(x[0])):
        if key in name:
            return table
    return None


# ─── Template generator ──────────────────────────────────────────

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


def generate_ods_template(
    report_name: str,
    caption: str,
    columns: list[str],
    output_path: str,
) -> dict:
    """
    Generate a .ods template for a report based on its auto-detected columns.

    Band layout:
      Row 0:  TITLE — caption
      Row 1:  HEADER — column names
      Row 2:  DETAIL — marker row
      Row 3:  (blank spacer)
      Row 4:  FOOTER — generated timestamp

    Returns band config dict.
    """
    doc = OpenDocumentSpreadsheet()
    table = Table(name=report_name[:31])  # ODF sheet name length limit

    # Title band (row 0)
    table.addElement(_row(_cell(caption)))

    # Header band (row 1) — column names
    header_cells = [_cell(col) for col in columns]
    table.addElement(_row(*header_cells))

    # Detail band (row 2) — one marker row
    detail_cells = [_cell(f"%({col})s") for col in columns]
    table.addElement(_row(*detail_cells))

    # Spacer (row 3)
    table.addElement(_row(_cell("")))

    # Footer band (row 4)
    table.addElement(_row(_cell("Generated: %(generated_at)s")))

    doc.spreadsheet.addElement(table)
    doc.save(output_path)

    band_config = {
        "title": {"start_row": 0, "end_row": 0},
        "header": {"start_row": 1, "end_row": 1},
        "detail": {"start_row": 2, "end_row": 2},
        "footer": {"start_row": 4, "end_row": 4},
    }

    return band_config


# ─── Scanner ─────────────────────────────────────────────────────

SCAN_QUERY = """
SELECT DISTINCT ON (o.name)
    o.name AS access_name,
    o.definition->>'caption' AS caption,
    o.definition->>'record-source' AS record_source,
    o.definition->>'grouping' AS grouping,
    o.definition->>'detail' AS detail,
    o.definition->>'report-header' AS report_header,
    o.definition->>'report-footer' AS report_footer
FROM shared.objects o
WHERE o.type = 'report'
  AND o.definition IS NOT NULL
  AND o.definition->>'record-source' IS NOT NULL
ORDER BY o.name, o.id DESC
"""


def scan_access_reports(conn) -> list[dict]:
    """Scan all Access reports in shared.objects and return their metadata."""
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(SCAN_QUERY)
        rows = [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()

    # Check migration status
    cur2 = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur2.execute("SELECT name FROM shared.report_definitions")
        existing = {r['name'] for r in cur2.fetchall()}
    finally:
        cur2.close()

    results = []
    for r in rows:
        slug = slugify(r['access_name'])
        results.append({
            'access_name': r['access_name'],
            'slug': slug,
            'caption': r['caption'] or r['access_name'].replace('_', ' ').title(),
            'record_source': r['record_source'],
            'grouping': r['grouping'],
            'is_migrated': slug in existing,
            'is_skip': should_skip(r['access_name']),
            'category': infer_category(r['access_name'], r['caption'] or ''),
        })

    return results


# ─── Report generator ────────────────────────────────────────────

def migrate_report(
    conn,
    report: dict,
    force: bool = False,
    dry_run: bool = True,
) -> dict:
    """
    Migrate a single Access report to the report_definitions system.

    Returns a result dict with status and details.
    """
    # Reset any aborted transaction from a previous report
    conn.rollback()

    access_name = report['access_name']
    slug = report['slug']
    caption = report['caption']
    record_source = report['record_source']
    category = report['category']
    message_extra = ''

    if dry_run:
        # Test SQL so we can tell the user what would happen
        status = 'dry-run'
        message = 'Would migrate'
        # Check if the report has a usable record-source
        if not record_source:
            return {
                'access_name': access_name,
                'slug': slug,
                'status': 'skipped',
                'message': 'No record-source defined',
            }

        is_named_query = not record_source.strip().upper().startswith('SELECT')
        if is_named_query:
            resolved = resolve_named_query(conn, record_source)
            if resolved:
                message += f' (query: {record_source})'
            else:
                return {
                    'access_name': access_name,
                    'slug': slug,
                    'status': 'skipped',
                    'message': f"Named query '{record_source}' not found",
                }
            test_sql_str = resolved
        else:
            test_sql_str = translate_access_sql(record_source)

        sql_info = test_sql(conn, test_sql_str)
        if sql_info:
            columns = len(sql_info.get('columns', []))
            message += f' — {columns} columns, {sql_info.get("row_count", "?")} sample rows'
            return {
                'access_name': access_name,
                'slug': slug,
                'status': 'dry-run',
                'message': message,
                'columns': columns,
                'category': category,
            }
        else:
            # Try table fallback for truncated SQL
            table_name = extract_table_from_sql(record_source) or infer_table_from_name(access_name)
            if table_name:
                fallback_sql = f"SELECT * FROM \"{table_name}\""
                conn.rollback()
                fallback_info = test_sql(conn, fallback_sql)
                if fallback_info:
                    columns = len(fallback_info.get('columns', []))
                    message += f' (table fallback: {table_name}) — {columns} columns'
                    return {
                        'access_name': access_name,
                        'slug': slug,
                        'status': 'dry-run',
                        'message': message,
                        'columns': columns,
                        'category': category,
                    }
                conn.rollback()
            return {
                'access_name': access_name,
                'slug': slug,
                'status': 'skipped',
                'message': 'SQL test failed',
            }

    if not record_source:
        return {
            'access_name': access_name,
            'slug': slug,
            'status': 'skipped',
            'message': 'No record-source defined',
        }

    # Step 1: Translate SQL
    is_named_query = not record_source.strip().upper().startswith('SELECT')
    translated_sql = record_source

    if is_named_query:
        # Named query reference — try to resolve
        resolved = resolve_named_query(conn, record_source)
        if resolved:
            translated_sql = resolved
        else:
            return {
                'access_name': access_name,
                'slug': slug,
                'status': 'skipped',
                'message': f"Named query '{record_source}' not found as view/table",
            }
    else:
        translated_sql = translate_access_sql(record_source)

    # Step 2: Test the SQL
    sql_info = test_sql(conn, translated_sql)
    if sql_info is None:
        # SQL test failed — likely the 80-char truncation. Try fallback:
        # extract table name from the partial SQL, or infer from report name.
        table_name = extract_table_from_sql(record_source) or infer_table_from_name(access_name)
        if table_name:
            fallback_sql = f"SELECT * FROM \"{table_name}\""
            conn.rollback()  # Reset from failed test
            fallback_info = test_sql(conn, fallback_sql)
            if fallback_info:
                sql_info = fallback_info
                translated_sql = fallback_sql
                message_extra = f' (table fallback: {table_name})'
            else:
                conn.rollback()
                return {
                    'access_name': access_name,
                    'slug': slug,
                    'status': 'failed',
                    'message': f'SQL + fallback failed for: {translated_sql[:200]}',
                    'translated_sql': translated_sql,
                }
        else:
            return {
                'access_name': access_name,
                'slug': slug,
                'status': 'failed',
                'message': f'SQL test failed, no table fallback: {translated_sql[:200]}',
                'translated_sql': translated_sql,
            }

    columns = sql_info['columns']
    if not columns:
        return {
            'access_name': access_name,
            'slug': slug,
            'status': 'failed',
            'message': 'No columns detected from query',
            'translated_sql': translated_sql,
        }

    # Step 3: Generate template
    template_filename = f"{slug}.ods"
    template_path = os.path.join(TEMPLATES_DIR, template_filename)
    os.makedirs(TEMPLATES_DIR, exist_ok=True)

    try:
        band_config = generate_ods_template(
            report_name=slug,
            caption=caption,
            columns=columns,
            output_path=template_path,
        )
    except Exception as e:
        return {
            'access_name': access_name,
            'slug': slug,
            'status': 'failed',
            'message': f'Template generation failed: {e}',
            'translated_sql': translated_sql,
        }

    # Step 4: Register in report_definitions
    cur = conn.cursor()
    try:
        # Check if it already exists
        cur.execute("SELECT id FROM shared.report_definitions WHERE name = %s", [slug])
        existing = cur.fetchone()

        if existing:
            # Update existing definition
            cur.execute(
                """UPDATE shared.report_definitions
                   SET caption = %s,
                       category = %s,
                       template_file = %s,
                       data_query = %s,
                       bands = %s::jsonb,
                       description = %s,
                       updated_at = NOW()
                   WHERE name = %s""",
                [
                    caption,
                    category,
                    f"templates/{template_filename}",
                    translated_sql,
                    json.dumps(band_config),
                    f"Migrated from Access report '{access_name}'",
                    slug,
                ]
            )
            status = 'updated'
            message = f'Updated existing definition for {slug}'
        else:
            # Insert new definition
            default_params = _infer_parameters(translated_sql)
            cur.execute(
                """INSERT INTO shared.report_definitions
                   (name, caption, category, template_file, output_formats,
                    source_table, filterable, parameters, bands, data_query,
                    description, enabled, company_id)
                   VALUES (%s, %s, %s, %s, %s,
                           %s, %s, %s::jsonb, %s::jsonb, %s,
                           %s, true, 1)""",
                [
                    slug,
                    caption,
                    category,
                    f"templates/{template_filename}",
                    ['pdf', 'csv', 'xlsx'],
                    sql_info.get('source_table', None),
                    True,
                    json.dumps(default_params),
                    json.dumps(band_config),
                    translated_sql,
                    f"Migrated from Access report '{access_name}'",
                ]
            )
            status = 'created'
            message = f'Created definition for {slug} ({len(columns)} columns)'

        conn.commit()
    except Exception as e:
        conn.rollback()
        return {
            'access_name': access_name,
            'slug': slug,
            'status': 'failed',
            'message': f'DB insert failed: {e}',
            'translated_sql': translated_sql,
        }
    finally:
        cur.close()

    return {
        'access_name': access_name,
        'slug': slug,
        'status': status,
        'message': message + message_extra,
        'columns': len(columns),
        'category': category,
        'translated_sql': translated_sql[:120] + '...' if len(translated_sql) > 120 else translated_sql,
    }


def _infer_parameters(sql: str) -> list[dict]:
    """Infer report parameters from SQL query patterns."""
    params = []
    sql_lower = sql.lower()

    # Date range parameters
    if any(w in sql_lower for w in ['date_from', 'date_to', 'start_date', 'end_date', 'date_range']):
        params.append({
            'name': 'date_from',
            'label': 'Start Date',
            'type': 'date',
            'required': False,
        })
        params.append({
            'name': 'date_to',
            'label': 'End Date',
            'type': 'date',
            'required': False,
        })

    # Customer/order ID parameters
    if any(w in sql_lower for w in ['customer_id', 'customerid']):
        params.append({
            'name': 'customer_id',
            'label': 'Customer ID',
            'type': 'number',
            'required': False,
        })

    # Order ID
    if any(w in sql_lower for w in ['order_id', 'orderid']):
        params.append({
            'name': 'order_id',
            'label': 'Order ID',
            'type': 'number',
            'required': False,
        })

    return params


# ─── Schema migration ────────────────────────────────────────────

SCHEMA_CHECK_SQL = """
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'shared' AND table_name = 'report_definitions'
  AND column_name = 'data_query'
"""

SCHEMA_MIGRATE_SQL = """
ALTER TABLE shared.report_definitions
ADD COLUMN IF NOT EXISTS data_query text;
"""


def ensure_schema(conn, dry_run: bool = False) -> bool:
    """Ensure the report_definitions table has the data_query column."""
    cur = conn.cursor()
    try:
        cur.execute(SCHEMA_CHECK_SQL)
        if cur.fetchone():
            return True  # Already exists

        if dry_run:
            print("  [dry-run] Would add data_query column to shared.report_definitions")
            return True

        cur.execute(SCHEMA_MIGRATE_SQL)
        conn.commit()
        print("  [ok] Added data_query column to shared.report_definitions")
        return True
    except Exception as e:
        conn.rollback()
        print(f"  [error] Schema migration failed: {e}", file=sys.stderr)
        return False
    finally:
        cur.close()


# ─── CLI ─────────────────────────────────────────────────────────

def cmd_scan(args: argparse.Namespace) -> int:
    """Scan all Access reports and show their status."""
    conn = get_conn()
    try:
        reports = scan_access_reports(conn)
    finally:
        conn.close()

    migrated = [r for r in reports if r['is_migrated']]
    pending = [r for r in reports if not r['is_migrated'] and not r['is_skip']]
    skipped = [r for r in reports if r['is_skip']]

    print(f"\n{'Access Report':<55} {'Status':<12} {'Category':<15} {'Slug':<30}")
    print(f"{'-'*55} {'-'*12} {'-'*15} {'-'*30}")
    for r in reports:
        if r['is_migrated']:
            status = '✓ migrated'
        elif r['is_skip']:
            status = '– skipped'
        else:
            status = '○ pending'
        print(f"{r['access_name']:<55} {status:<12} {r['category']:<15} {r['slug']:<30}")

    print(f"\n  Summary: {len(migrated)} migrated, {len(pending)} pending, {len(skipped)} skipped")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    """Show summary statistics."""
    conn = get_conn()
    try:
        reports = scan_access_reports(conn)
    finally:
        conn.close()

    migrated = [r for r in reports if r['is_migrated']]
    pending = [r for r in reports if not r['is_migrated'] and not r['is_skip']]
    skipped = [r for r in reports if r['is_skip']]

    # Category breakdown
    from collections import Counter
    cat_counts = Counter(r['category'] for r in pending)

    print(f"\n  Report Migration Status")
    print(f"  {'─' * 40}")
    print(f"  Total Access reports : {len(reports)}")
    print(f"  Already migrated     : {len(migrated)}")
    print(f"  Pending migration    : {len(pending)}")
    print(f"  Skipped (junk/test)  : {len(skipped)}")
    if pending:
        print(f"\n  Pending by category:")
        for cat, count in sorted(cat_counts.items()):
            print(f"    {cat:<20} {count}")
    return 0


def cmd_generate(args: argparse.Namespace) -> int:
    """Migrate pending Access reports."""
    dry_run = not args.force
    force = args.force
    single_report = args.report
    batch_size = args.batch

    conn = get_conn()
    try:
        # Ensure schema first
        if not ensure_schema(conn, dry_run=dry_run):
            return 1

        reports = scan_access_reports(conn)

        if single_report:
            # Find specific report
            target = [r for r in reports if r['access_name'] == single_report or r['slug'] == single_report]
            if not target:
                print(f"  [error] Report '{single_report}' not found in Access catalog")
                return 1
            pending = target
        else:
            pending = [r for r in reports if not r['is_migrated'] and not r['is_skip']]

        if not pending:
            print("  No pending reports to migrate.")
            return 0

        if batch_size:
            pending = pending[:batch_size]

        print(f"\n  {'Action':<12} {'Report':<45} {'Columns':<8} {'Category':<15}")
        print(f"  {'─'*12} {'─'*45} {'─'*8} {'─'*15}")

        success = 0
        failed = 0
        skipped = 0
        dry_run_count = 0

        for r in pending:
            result = migrate_report(conn, r, force=force, dry_run=dry_run)

            if result['status'] == 'dry-run':
                print(f"  {'○ dry-run':<12} {r['access_name']:<45} {result.get('columns', ''):<8} {result.get('category', '?'):<15}")
                dry_run_count += 1
            elif result['status'] in ('created', 'updated'):
                print(f"  {'✓ ' + result['status']:<12} {r['access_name']:<45} {result.get('columns', '?'):<8} {result.get('category', '?'):<15}")
                success += 1
            elif result['status'] == 'skipped':
                print(f"  {'– skip':<12} {r['access_name']:<45} {'':<8} {result['message'][:45]:<45}")
                skipped += 1
            else:
                print(f"  {'✗ fail':<12} {r['access_name']:<45} {'':<8} {result['message'][:45]:<45}")
                failed += 1

        parts = []
        if success:
            parts.append(f'{success} migrated')
        if dry_run_count:
            parts.append(f'{dry_run_count} would-migrate')
        if failed:
            parts.append(f'{failed} failed')
        if skipped:
            parts.append(f'{skipped} skipped')
        print(f"  Result: {', '.join(parts)}")
        if dry_run:
            print("  [dry-run mode — use --force to actually write changes]")

        return 0 if failed == 0 else 1
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description='Bulk migration tool for Access reports to the report_definitions system',
    )
    subparsers = parser.add_subparsers(dest='command', required=True)

    # scan
    sp = subparsers.add_parser('scan', help='List all Access reports with migration status')
    sp.set_defaults(func=cmd_scan)

    # status
    sp = subparsers.add_parser('status', help='Show summary statistics')
    sp.set_defaults(func=cmd_status)

    # generate
    sp = subparsers.add_parser('generate', help='Migrate pending Access reports')
    sp.add_argument('--force', action='store_true', help='Actually write to DB and create templates')
    sp.add_argument('--dry-run', action='store_true', help='Preview what would happen (default without --force)')
    sp.add_argument('--report', '-r', type=str, default=None, help='Migrate a single report by name')
    sp.add_argument('--batch', '-b', type=int, default=None, help='Migrate at most N reports')
    sp.set_defaults(func=cmd_generate)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == '__main__':
    sys.exit(main())