-- Step 9: Group-level default handlers
-- Inserts default Python handlers for catalogs, journals, and task-level validation
-- Target: shared.event_handlers in polyaccess database

BEGIN;

-- ============================================================
-- 1. CATALOGS GROUP — auto-set created_at / updated_at timestamps
-- ============================================================

INSERT INTO shared.event_handlers (id, level, scope, event_name, handler, language, enabled, sort_order, description)
VALUES (
  gen_random_uuid(),
  'group',
  'catalogs',
  'on_before_apply_record',
  $$import json
from datetime import datetime

"""
Handler: catalogs.on_before_apply_record — auto_timestamps

Auto-sets created_at on insert and updated_at on insert/update
for all catalog forms: Products, Customers, Employees, Parts,
Payment Methods, Shipping Methods, Food Categories, Grind,
My Company Information.
"""
def handle(context):
    record = context.get('record', {})
    event_type = context.get('event_type', '')
    now = datetime.utcnow().isoformat()

    if event_type == 'insert':
        if 'created_at' not in record or record['created_at'] is None:
            record['created_at'] = now

    if event_type in ('insert', 'update'):
        record['updated_at'] = now

    return json.dumps({
        'handled': True,
        'handler': 'catalogs_auto_timestamps',
        'record': record,
    })$$,
  'python',
  true,
  100,
  'Catalogs group: auto-set created_at (insert) and updated_at (insert/update)'
);

-- ============================================================
-- 2. JOURNALS GROUP — auto-set date field on insert
-- ============================================================

INSERT INTO shared.event_handlers (id, level, scope, event_name, handler, language, enabled, sort_order, description)
VALUES (
  gen_random_uuid(),
  'group',
  'journals',
  'on_before_apply_record',
  $$import json
import re
from datetime import date

"""
Handler: journals.on_before_apply_record — auto_date

Detects date field names by pattern and auto-sets them
to today's date on insert for transactional forms:
Orders, OrdersProduction, OrderView, Workorders,
Payments, Quote, Ready For Pick-up Form, etc.
"""
# Field name patterns that indicate a date field, in priority order
# Matches: order_date, orderdate, OrderDate, date, Date,
# transaction_date, work_order_date, payment_date, quote_date, etc.
DATE_PATTERNS = [
    re.compile(r'^(order|order_date|orderdate)$', re.IGNORECASE),
    re.compile(r'^(date|transaction_date|trans_date)$', re.IGNORECASE),
    re.compile(r'^(work_order_date|wodate)$', re.IGNORECASE),
    re.compile(r'^(payment_date|pay_date)$', re.IGNORECASE),
    re.compile(r'^(quote_date|quotedate)$', re.IGNORECASE),
    re.compile(r'^(invoice_date|inv_date)$', re.IGNORECASE),
    re.compile(r'^(ship_date|shipped_date)$', re.IGNORECASE),
    re.compile(r'^(due_date|datedue)$', re.IGNORECASE),
    re.compile(r'_date$', re.IGNORECASE),
    re.compile(r'^date', re.IGNORECASE),
]

def handle(context):
    record = context.get('record', {})
    event_type = context.get('event_type', '')

    if event_type != 'insert':
        return json.dumps({
            'handled': False,
            'handler': 'journals_auto_date',
            'reason': 'only applied on insert',
            'record': record,
        })

    today = date.today().isoformat()
    field_names = record.keys() if isinstance(record, dict) else []

    for pattern in DATE_PATTERNS:
        for fname in field_names:
            if pattern.match(fname):
                if record.get(fname) is None or record.get(fname) == '':
                    record[fname] = today
                    return json.dumps({
                        'handled': True,
                        'handler': 'journals_auto_date',
                        'field': fname,
                        'value': today,
                        'record': record,
                    })

    return json.dumps({
        'handled': False,
        'handler': 'journals_auto_date',
        'reason': 'no date field found',
        'record': record,
    })$$,
  'python',
  true,
  100,
  'Journals group: auto-set date field on insert (pattern detection)'
);

-- ============================================================
-- 3. TASK LEVEL — validate required fields (all forms)
-- ============================================================

INSERT INTO shared.event_handlers (id, level, scope, event_name, handler, language, enabled, sort_order, description)
VALUES (
  gen_random_uuid(),
  'task',
  'task',
  'on_before_apply_record',
  $$import json

"""
Handler: task.on_before_apply_record — validate_required

Validates that records have required fields populated.
Applied to ALL forms as the root level in the dispatch chain.
Returns a validation result that the UI can display.
"""
# Common required field identifiers
REQUIRED_FIELDS = {
    'id':        'Record ID is required',
    'name':      'Name is required',
    'code':      'Code is required',
    'sku':       'SKU is required',
    'price':     'Price is required',
    'amount':    'Amount is required',
    'status':    'Status is required',
    'type':      'Type is required',
    'email':     'Email is required',
    'phone':     'Phone is required',
}

def handle(context):
    record = context.get('record', {})
    errors = []

    for field, message in REQUIRED_FIELDS.items():
        val = record.get(field)
        if val is None or (isinstance(val, str) and val.strip() == ''):
            errors.append({'field': field, 'message': message})

    if errors:
        return json.dumps({
            'handled': True,
            'handler': 'task_validate_required',
            'valid': False,
            'errors': errors,
            'record': record,
        })

    return json.dumps({
        'handled': True,
        'handler': 'task_validate_required',
        'valid': True,
        'errors': [],
        'record': record,
    })$$,
  'python',
  true,
  900,
  'Task level: validate required fields for all forms'
);

COMMIT;