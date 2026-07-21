// LookupBrowser unit tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import LookupBrowser from '../LookupBrowser';

// Mock the API module
vi.mock('@/lib/api', () => ({
  runLookup: vi.fn(),
}));

import { runLookup } from '@/lib/api';

function renderLookupBrowser(
  overrides: Partial<{
    lookupItem: string;
    displayFields: string[];
    onSelect: (result: unknown) => void;
    onClose: () => void;
  }> = {},
) {
  const props = {
    lookupItem: 'customers',
    displayFields: ['companyname', 'city', 'phone'],
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return render(<LookupBrowser {...props} />);
}

describe('LookupBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search bar and close button', () => {
    renderLookupBrowser();

    expect(
      screen.getByTestId('lookup-browser-search'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /close/i }),
    ).toBeInTheDocument();
  });

  it('shows loading spinner when searching', async () => {
    // Never resolve so it stays loading
    vi.mocked(runLookup).mockReturnValue(new Promise(() => {}));

    renderLookupBrowser();

    const input = screen.getByTestId('lookup-browser-search');
    fireEvent.change(input, { target: { value: 'Alp' } });

    // Advance debounce timer
    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('loading-spinner'),
      ).toBeInTheDocument();
      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });
  });

  it('displays results in table rows', async () => {
    vi.mocked(runLookup).mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          companyname: 'Acme Corp',
          city: 'Toronto',
          phone: '555-0100',
        },
        {
          id: 2,
          companyname: 'Beta Inc',
          city: 'Vancouver',
          phone: '555-0200',
        },
      ],
      fields: ['id', 'companyname', 'city', 'phone'],
    });

    renderLookupBrowser();

    const input = screen.getByTestId('lookup-browser-search');
    fireEvent.change(input, { target: { value: 'Acme' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('Beta Inc')).toBeInTheDocument();
      expect(screen.getByText('Toronto')).toBeInTheDocument();
      expect(screen.getByText('555-0100')).toBeInTheDocument();
    });
  });

  it('clicking a row selects it (visual highlight)', async () => {
    vi.mocked(runLookup).mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          companyname: 'Acme Corp',
          city: 'Toronto',
          phone: '555-0100',
        },
        {
          id: 2,
          companyname: 'Beta Inc',
          city: 'Vancouver',
          phone: '555-0200',
        },
      ],
      fields: ['id', 'companyname', 'city', 'phone'],
    });

    renderLookupBrowser();

    const input = screen.getByTestId('lookup-browser-search');
    fireEvent.change(input, { target: { value: 'Acme' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    // Click second row
    const row2 = screen.getByTestId('lookup-row-1');
    fireEvent.click(row2);

    // Second row should have selected state
    expect(row2.getAttribute('data-selected')).toBe('true');

    // First row should not be selected
    const row1 = screen.getByTestId('lookup-row-0');
    expect(row1.getAttribute('data-selected')).toBe('false');
  });

  it('Select button calls onSelect with selected row data', async () => {
    const onSelect = vi.fn();
    vi.mocked(runLookup).mockResolvedValueOnce({
      rows: [
        {
          id: 42,
          companyname: 'Selected Co',
          city: 'Ottawa',
          phone: '555-0300',
        },
      ],
      fields: ['id', 'companyname', 'city', 'phone'],
    });

    renderLookupBrowser({ onSelect });

    const input = screen.getByTestId('lookup-browser-search');
    fireEvent.change(input, { target: { value: 'Sel' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText('Selected Co')).toBeInTheDocument();
    });

    // Select button should be disabled initially
    const selectBtn = screen.getByTestId('lookup-browser-select');
    expect(selectBtn).toBeDisabled();

    // Click the row to select it
    fireEvent.click(screen.getByTestId('lookup-row-0'));

    // Select button should now be enabled
    expect(selectBtn).not.toBeDisabled();

    // Click Select
    fireEvent.click(selectBtn);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        displayValue: 'Selected Co - Ottawa - 555-0300',
      }),
    );
  });

  it('Cancel button calls onClose', () => {
    const onClose = vi.fn();
    renderLookupBrowser({ onClose });

    const cancelBtn = screen.getByTestId('lookup-browser-cancel');
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape key closes modal', () => {
    const onClose = vi.fn();
    renderLookupBrowser({ onClose });

    const modal = screen.getByTestId('lookup-browser-modal');
    fireEvent.keyDown(modal, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "No results found" when empty', async () => {
    vi.mocked(runLookup).mockResolvedValueOnce({
      rows: [],
      fields: ['id', 'companyname', 'city', 'phone'],
    });

    renderLookupBrowser();

    // Initially should show prompt
    expect(
      screen.getByText('Type at least 2 characters to search'),
    ).toBeInTheDocument();

    const input = screen.getByTestId('lookup-browser-search');
    fireEvent.change(input, { target: { value: 'Xyz' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(
        screen.getByText('No results found'),
      ).toBeInTheDocument();
    });
  });

  it('arrow keys navigate rows and Enter selects', async () => {
    const onSelect = vi.fn();
    vi.mocked(runLookup).mockResolvedValueOnce({
      rows: [
        { id: 1, companyname: 'Alpha', city: 'A', phone: '111' },
        { id: 2, companyname: 'Beta', city: 'B', phone: '222' },
      ],
      fields: ['id', 'companyname', 'city', 'phone'],
    });

    renderLookupBrowser({ onSelect });

    const input = screen.getByTestId('lookup-browser-search');
    fireEvent.change(input, { target: { value: 'Alp' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });

    const modal = screen.getByTestId('lookup-browser-modal');

    // ArrowDown to select first row
    fireEvent.keyDown(modal, { key: 'ArrowDown' });
    expect(screen.getByTestId('lookup-row-0').getAttribute('data-selected')).toBe('true');

    // ArrowDown again to select second row
    fireEvent.keyDown(modal, { key: 'ArrowDown' });
    expect(screen.getByTestId('lookup-row-1').getAttribute('data-selected')).toBe('true');

    // ArrowUp back to first row
    fireEvent.keyDown(modal, { key: 'ArrowUp' });
    expect(screen.getByTestId('lookup-row-0').getAttribute('data-selected')).toBe('true');

    // Enter to select
    fireEvent.keyDown(modal, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
    );
  });
});
