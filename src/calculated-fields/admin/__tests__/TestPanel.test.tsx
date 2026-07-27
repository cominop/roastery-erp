/**
 * Unit tests for TestPanel component.
 *
 * Tests:
 * - Rendering with dependency fields
 * - "Run Test" button disabled when no expression
 * - API call and result display
 * - Error handling display
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestPanel from '../TestPanel';

// ─── Mock the API module ──────────────────────────────

const mockTestExpression = vi.fn();

vi.mock('@/calculated-fields/api/calculatedFieldsApi', () => ({
  testExpression: (...args: unknown[]) => mockTestExpression(...args),
}));

// ─── Helpers ──────────────────────────────────────────

function renderPanel(overrides: Partial<{
  open: boolean;
  onClose: () => void;
  expression: string;
  dependsOn: string[];
}> = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    expression: '{sell_price} - {cost_price}',
    dependsOn: ['sell_price', 'cost_price'],
  };
  const props = { ...defaults, ...overrides };
  return render(<TestPanel {...props} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────

describe('TestPanel', () => {
  it('renders the dialog title', () => {
    renderPanel();
    expect(screen.getByText('Test Expression')).toBeInTheDocument();
  });

  it('shows the expression read-only', () => {
    renderPanel({ expression: '{a} + {b}' });
    expect(screen.getByText(/{a} \+ {b}/)).toBeInTheDocument();
  });

  it('shows "(empty)" when expression is empty', () => {
    renderPanel({ expression: '' });
    expect(screen.getByText('(empty)')).toBeInTheDocument();
  });

  it('renders input fields for each dependency', () => {
    renderPanel({ dependsOn: ['sell_price', 'cost_price', 'quantity'] });

    expect(screen.getByText('sell_price')).toBeInTheDocument();
    expect(screen.getByText('cost_price')).toBeInTheDocument();
    expect(screen.getByText('quantity')).toBeInTheDocument();
  });

  it('shows placeholder for quantity/price fields as number', () => {
    renderPanel({ dependsOn: ['sell_price', 'quantity', 'customer_name'] });

    const inputs = screen.getAllByRole('textbox');
    // Should find number-placed inputs
    const priceInputs = inputs.filter(
      (el) => el.getAttribute('placeholder') === '0.00',
    );
    expect(priceInputs.length).toBeGreaterThanOrEqual(2); // sell_price, quantity

    const nameInput = inputs.find(
      (el) => el.getAttribute('placeholder') === 'Enter value...',
    );
    expect(nameInput).toBeTruthy();
  });

  it('shows "No dependencies" message when dependsOn is empty', () => {
    renderPanel({ dependsOn: [] });
    expect(
      screen.getByText(/No dependencies to test/),
    ).toBeInTheDocument();
  });

  it('disables "Run Test" button when expression is empty', () => {
    renderPanel({ expression: '' });

    // With empty expression, the panel shows "(empty)" and test button is disabled
    const runBtn = screen.getByRole('button', { name: /run test/i });
    expect(runBtn).toBeDisabled();
  });

  it('enables "Run Test" button when expression is non-empty', () => {
    renderPanel({ expression: '{a} + {b}' });

    const runBtn = screen.getByRole('button', { name: /run test/i });
    expect(runBtn).not.toBeDisabled();
  });

  it('calls testExpression API and displays the result', async () => {
    const user = userEvent.setup();
    mockTestExpression.mockResolvedValueOnce({ result: 43.33 });

    renderPanel({
      expression: '({sell_price} - {cost_price}) / {sell_price} * 100',
      dependsOn: ['sell_price', 'cost_price'],
    });

    // Fill in sample values
    const inputs = screen.getAllByRole('textbox');
    // sell_price input
    await user.type(inputs[0], '15.00');
    // cost_price input
    await user.type(inputs[1], '8.50');

    // Click Run Test
    const runBtn = screen.getByRole('button', { name: /run test/i });
    await user.click(runBtn);

    // Wait for result to display
    await waitFor(() => {
      expect(screen.getByText('43.33')).toBeInTheDocument();
    });

    // Should show type label
    expect(screen.getByText('Type: Number')).toBeInTheDocument();
  });

  it('displays "Yes"/"No" for boolean results', async () => {
    const user = userEvent.setup();
    mockTestExpression.mockResolvedValueOnce({ result: true });

    renderPanel({ expression: '{a} > 0', dependsOn: ['a'] });

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '5');

    const runBtn = screen.getByRole('button', { name: /run test/i });
    await user.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });
    expect(screen.getByText('Type: Boolean')).toBeInTheDocument();
  });

  it('displays error message when API fails', async () => {
    const user = userEvent.setup();
    mockTestExpression.mockRejectedValueOnce(new Error('Parse error'));

    renderPanel({ expression: '{a} + +', dependsOn: ['a'] });

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '5');

    const runBtn = screen.getByRole('button', { name: /run test/i });
    await user.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('Parse error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Error:/)).toBeInTheDocument();
  });

  it('closes the dialog when Close is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderPanel({ onClose });

    // There are two buttons with "Close" text (X icon + footer button).
    // Pick the one that's visible in the footer — it's the "outline" variant.
    const closeBtns = screen.getAllByRole('button', { name: /close/i });
    // The footer "Close" button is the last one; the X icon close button is the first
    const footerCloseBtn = closeBtns[closeBtns.length - 1];
    await user.click(footerCloseBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles null/undefined result gracefully', async () => {
    const user = userEvent.setup();
    mockTestExpression.mockResolvedValueOnce({ result: null });

    renderPanel({ expression: '{a}', dependsOn: ['a'] });

    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0], '0');

    const runBtn = screen.getByRole('button', { name: /run test/i });
    await user.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('Type: Null')).toBeInTheDocument();
    });
  });
});