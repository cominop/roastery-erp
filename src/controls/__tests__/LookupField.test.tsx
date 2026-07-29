// LookupField unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LookupField from '../LookupField';
import type { FieldDefinition } from '../schema/controlSchema';

// Mock the API module
vi.mock('@/lib/api', () => ({
  runLookup: vi.fn(),
}));

import { runLookup } from '@/lib/api';

function makeField(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: 'customer-id',
    name: 'customerId',
    caption: 'Customer',
    type: 'LOOKUP',
    lookupItem: 'customers',
    lookupField: 'companyname',
    lookupField2: 'city',
    ...overrides,
  };
}

describe('LookupField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders text input', () => {
    render(
      <LookupField
        field={makeField({})}
        value={null}
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('shows display value when value is set (mocks the fetch)', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockResolvedValueOnce({
      rows: [{ id: 1, companyname: 'Acme Corp', city: 'Toronto' }],
      fields: ['id', 'companyname', 'city'],
    });

    render(
      <LookupField
        field={makeField({})}
        value={1}
        onChange={() => {}}
      />,
    );

    await waitFor(() => {
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('Acme Corp - Toronto');
    });
  });

  it('shows placeholder with lookupItem name', () => {
    render(
      <LookupField
        field={makeField({ lookupItem: 'products' })}
        value={null}
        onChange={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText('Search products...');
    expect(input).toBeInTheDocument();
  });

  it('shows search button', () => {
    render(
      <LookupField
        field={makeField({})}
        value={null}
        onChange={() => {}}
      />,
    );
    const button = screen.getByRole('button', { name: /search/i });
    expect(button).toBeInTheDocument();
  });

  it('does not show search button when readOnly', () => {
    render(
      <LookupField
        field={makeField({})}
        value={1}
        onChange={() => {}}
        readOnly
      />,
    );
    expect(
      screen.queryByRole('button', { name: /search/i }),
    ).not.toBeInTheDocument();
  });

  it('typing triggers debounced search (mock runLookup)', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockResolvedValue({
      rows: [
        { id: 1, companyname: 'Alpha Corp', city: 'Vancouver' },
        { id: 2, companyname: 'Beta Inc', city: 'Toronto' },
      ],
      fields: ['id', 'companyname', 'city'],
    });

    render(
      <LookupField
        field={makeField({})}
        value={null}
        onChange={() => {}}
      />,
    );

    const input = screen.getByRole('textbox');

    // Type one char — should not trigger search
    fireEvent.change(input, { target: { value: 'A' } });
    await new Promise(r => setTimeout(r, 400));
    expect(mockRunLookup).not.toHaveBeenCalled();

    // Type 3 chars
    fireEvent.change(input, { target: { value: 'Alp' } });
    await waitFor(
      () => {
        expect(mockRunLookup).toHaveBeenCalled();
      },
      { timeout: 600 },
    );
  });

  it('shows dropdown with results', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockResolvedValue({
      rows: [
        { id: 1, companyname: 'Alpha Corp', city: 'Vancouver' },
      ],
      fields: ['id', 'companyname', 'city'],
    });

    render(
      <LookupField
        field={makeField({})}
        value={null}
        onChange={() => {}}
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Alp' } });
    await waitFor(
      () => {
        expect(screen.getByText('Alpha Corp - Vancouver')).toBeInTheDocument();
      },
      { timeout: 600 },
    );
  });

  it('clicking result calls onChange with correct ID', async () => {
    const onChange = vi.fn();
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockResolvedValue({
      rows: [
        { id: 42, companyname: 'Selected Co', city: 'Ottawa' },
      ],
      fields: ['id', 'companyname', 'city'],
    });

    render(
      <LookupField
        field={makeField({})}
        value={null}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Sel' } });
    await waitFor(
      () => {
        expect(
          screen.getByText('Selected Co - Ottawa'),
        ).toBeInTheDocument();
      },
      { timeout: 600 },
    );

    fireEvent.mouseDown(screen.getByText('Selected Co - Ottawa'));
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it('shows loading state', async () => {
    // Never resolve so it stays loading
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockReturnValue(new Promise(() => {}));

    render(
      <LookupField
        field={makeField({})}
        value={null}
        onChange={() => {}}
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Alp' } });

    // Wait for debounce; loading should be true and searching text shown
    await waitFor(() => {
      expect(screen.getByText('Searching...')).toBeInTheDocument();
    }, { timeout: 600 });
  });

  it('shows error state', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockRejectedValue(new Error('Network error'));

    render(
      <LookupField
        field={makeField({})}
        value={null}
        onChange={() => {}}
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Alp' } });
    await waitFor(
      () => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      },
      { timeout: 600 },
    );
  });

  it('closes dropdown on outside click', async () => {
    const mockRunLookup = vi.mocked(runLookup);
    mockRunLookup.mockResolvedValue({
      rows: [
        { id: 1, companyname: 'Alpha Corp', city: 'Vancouver' },
      ],
      fields: ['id', 'companyname', 'city'],
    });

    const user = userEvent.setup();

    render(
      <div>
        <LookupField
          field={makeField({})}
          value={null}
          onChange={() => {}}
        />
        <div data-testid="outside">Outside</div>
      </div>,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Alp' } });
    await waitFor(
      () => {
        expect(
          screen.getByText('Alpha Corp - Vancouver'),
        ).toBeInTheDocument();
      },
      { timeout: 600 },
    );

    // Click outside
    await user.click(screen.getByTestId('outside'));
    await waitFor(() => {
      expect(
        screen.queryByText('Alpha Corp - Vancouver'),
      ).not.toBeInTheDocument();
    });
  });

  it('does not search with < 2 chars', async () => {
    const mockRunLookup = vi.mocked(runLookup);

    render(
      <LookupField
        field={makeField({})}
        value={null}
        onChange={() => {}}
      />,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'A' } });
    await new Promise(r => setTimeout(r, 400));
    expect(mockRunLookup).not.toHaveBeenCalled();
  });
});
