/**
 * Unit tests for calculated fields admin UI components.
 *
 * Tests ExpressionInput (syntax highlighting, keyboard interactions),
 * FunctionReference (catalog display, search), and basic integration
 * of the CalculatedFieldsAdmin page shell.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpressionInput from '../ExpressionInput';
import FunctionReference from '../FunctionReference';
import FieldPicker from '../FieldPicker';
import CalculatedFieldsAdmin from '../CalculatedFieldsAdmin';

// ─── Mock /api/schema/:table for FieldPicker ──────────

const MOCK_COLUMNS = [
  { name: 'id', type: 'integer', nullable: false },
  { name: 'customer_name', type: 'varchar', nullable: true },
  { name: 'order_date', type: 'timestamp', nullable: true },
  { name: 'amount', type: 'numeric', nullable: true },
  { name: 'is_active', type: 'boolean', nullable: true },
];

beforeEach(() => {
  vi.restoreAllMocks();

  // Mock fetch for schema endpoint
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: string | URL) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/api/schema/')) {
      return Promise.resolve(
        new Response(JSON.stringify(MOCK_COLUMNS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    // Default: return empty for unknown endpoints
    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
});

// ─── ExpressionInput ──────────────────────────────────

describe('ExpressionInput', () => {
  it('renders a textarea with the given value', () => {
    render(
      <ExpressionInput
        value="{amount} * 1.15"
        onChange={() => {}}
      />,
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('{amount} * 1.15');
  });

  it('calls onChange when typing', async () => {
    const onChange = vi.fn();
    render(
      <ExpressionInput
        value=""
        onChange={onChange}
      />,
    );

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'a');

    expect(onChange).toHaveBeenCalled();
  });

  it('inserts 2 spaces on Tab key', () => {
    const onChange = vi.fn();
    render(
      <ExpressionInput
        value=""
        onChange={onChange}
      />,
    );

    const textarea = screen.getByRole('textbox');
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(onChange).toHaveBeenCalledWith('  ');
  });

  it('triggers suggest callback on Ctrl+Space', () => {
    const onSuggest = vi.fn();
    render(
      <ExpressionInput
        value=""
        onChange={() => {}}
        onTriggerSuggest={onSuggest}
      />,
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: ' ', ctrlKey: true });

    expect(onSuggest).toHaveBeenCalledTimes(1);
  });

  it('auto-indents on Enter', () => {
    const onChange = vi.fn();
    render(
      <ExpressionInput
        value="  {amount}"
        onChange={onChange}
      />,
    );

    const textarea = screen.getByRole('textbox');
    textarea.setSelectionRange(10, 10); // end of line
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('  {amount}\n  ');
  });

  it('renders syntax highlighting overlay', () => {
    const { container } = render(
      <ExpressionInput
        value="IIF({amount} > 0, 'positive', 'negative')"
        onChange={() => {}}
      />,
    );

    // The overlay div should contain colored tokens
    const overlay = container.querySelector('[aria-hidden="true"]');
    expect(overlay).toBeInTheDocument();

    // Should contain tokenized content
    expect(overlay?.textContent).toContain('IIF');
    expect(overlay?.textContent).toContain('{amount}');
  });

  it('shows placeholder when value is empty', () => {
    const { container } = render(
      <ExpressionInput
        value=""
        onChange={() => {}}
        placeholder="Enter expression..."
      />,
    );

    const overlay = container.querySelector('[aria-hidden="true"]');
    expect(overlay?.textContent).toContain('Enter expression...');
  });
});

// ─── FunctionReference ────────────────────────────────

describe('FunctionReference', () => {
  it('renders function categories', () => {
    render(<FunctionReference onInsert={() => {}} />);

    // Category headers should be visible
    expect(screen.getByText('Logic & Conditional')).toBeInTheDocument();
    expect(screen.getByText('String')).toBeInTheDocument();
    expect(screen.getByText('Math & Numeric')).toBeInTheDocument();
    expect(screen.getByText('Date & Time')).toBeInTheDocument();
    expect(screen.getByText('Aggregate')).toBeInTheDocument();
  });

  it('shows function entries when category is expanded', () => {
    render(<FunctionReference onInsert={() => {}} />);

    // IIF should be visible (default-expanded)
    expect(screen.getByText('IIF')).toBeInTheDocument();
    expect(screen.getByText('SUM')).toBeInTheDocument();
    expect(screen.getByText('NOW')).toBeInTheDocument();
  });

  it('calls onInsert with function name + paren when clicked', async () => {
    const onInsert = vi.fn();
    render(<FunctionReference onInsert={onInsert} />);

    const btn = screen.getByText('IIF');
    await userEvent.click(btn);

    expect(onInsert).toHaveBeenCalledWith('IIF(');
  });

  it('filters functions by search query', async () => {
    render(<FunctionReference onInsert={() => {}} />);

    const searchInput = screen.getByPlaceholderText('Search functions...');
    await userEvent.type(searchInput, 'date');

    // Date functions should appear
    expect(screen.getByText('DATEADD')).toBeInTheDocument();
    expect(screen.getByText('DATEDIFF')).toBeInTheDocument();

    // Non-date functions should not
    expect(screen.queryByText('IIF')).not.toBeInTheDocument();
    expect(screen.queryByText('SUM')).not.toBeInTheDocument();
  });

  it('shows function signatures and examples', () => {
    render(<FunctionReference onInsert={() => {}} />);

    expect(screen.getByText(/IIF\(condition/)).toBeInTheDocument();
    expect(screen.getByText(/IIF\(quantity > 0/)).toBeInTheDocument();
  });

  it('toggles category collapse', async () => {
    render(<FunctionReference onInsert={() => {}} />);

    // Click a category header to collapse
    const header = screen.getByText('String');
    await userEvent.click(header);

    // String functions should no longer be visible
    expect(screen.queryByText('LEFT')).not.toBeInTheDocument();
  });
});

// ─── FieldPicker ───────────────────────────────────────

describe('FieldPicker', () => {
  it('shows table selector', () => {
    render(
      <FieldPicker
        tableName="orders"
        tables={['orders', 'customers']}
        onTableChange={() => {}}
        onInsertField={() => {}}
        onInsertTableField={() => {}}
      />,
    );

    expect(screen.getByText('Fields')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('loads and displays columns from schema API', async () => {
    render(
      <FieldPicker
        tableName="orders"
        tables={['orders']}
        onTableChange={() => {}}
        onInsertField={() => {}}
        onInsertTableField={() => {}}
      />,
    );

    // Wait for columns to load
    const column = await screen.findByText('customer_name');
    expect(column).toBeInTheDocument();
    expect(screen.getByText('id')).toBeInTheDocument();
  });

  it('filters columns by search', async () => {
    render(
      <FieldPicker
        tableName="orders"
        tables={['orders']}
        onTableChange={() => {}}
        onInsertField={() => {}}
        onInsertTableField={() => {}}
      />,
    );

    await screen.findByText('customer_name');

    const searchInput = screen.getByPlaceholderText('Filter fields...');
    await userEvent.type(searchInput, 'amount');

    expect(screen.getByText('amount')).toBeInTheDocument();
    expect(screen.queryByText('customer_name')).not.toBeInTheDocument();
  });

  it('calls onInsertField when a column is clicked', async () => {
    const onInsert = vi.fn();
    render(
      <FieldPicker
        tableName="orders"
        tables={['orders']}
        onTableChange={() => {}}
        onInsertField={onInsert}
        onInsertTableField={() => {}}
      />,
    );

    const column = await screen.findByText('amount');
    await userEvent.click(column);

    expect(onInsert).toHaveBeenCalledWith('{amount}');
  });
});

// ─── CalculatedFieldsAdmin (smoke test) ────────────────

describe('CalculatedFieldsAdmin', () => {
  it('renders the admin page with field list sidebar', async () => {
    // Mock fetch for calculated-fields list
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (url: string | URL) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/api/calculated-fields') && !urlStr.includes('/detect')) {
          return Promise.resolve(
            new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (urlStr.includes('/api/schema/')) {
          return Promise.resolve(
            new Response(JSON.stringify(MOCK_COLUMNS), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      },
    ) as unknown as typeof fetch;

    render(
      <CalculatedFieldsAdmin tables={['orders', 'customers', 'products']} />,
    );

    // Should show the sidebar with title
    expect(screen.getByText('Calculated Fields')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();

    // Should show empty state (async — data loads after mount)
    expect(
      await screen.findByText(/No calculated fields yet/),
    ).toBeInTheDocument();
  });

  it('shows editor when "New" is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (url: string | URL) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/api/calculated-fields') && !urlStr.includes('/detect')) {
          return Promise.resolve(
            new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        if (urlStr.includes('/api/schema/')) {
          return Promise.resolve(
            new Response(JSON.stringify(MOCK_COLUMNS), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      },
    ) as unknown as typeof fetch;

    render(
      <CalculatedFieldsAdmin tables={['orders']} />,
    );

    // Click "New"
    const newBtn = screen.getByText('New');
    await userEvent.click(newBtn);

    // Should show the editor form
    expect(screen.getByText('New Calculated Field')).toBeInTheDocument();
    expect(screen.getByText('Expression *')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });
});
