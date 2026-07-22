// FormField unit tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FormField from '../FormField';
import type { FieldDefinition } from '../schema/controlSchema';

function makeField(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: 'test-field',
    name: 'testField',
    caption: 'Test Field',
    type: 'TEXT',
    ...overrides,
  };
}

describe('FormField dispatcher', () => {
  it('renders TextField for TEXT type', () => {
    render(
      <FormField field={makeField({ type: 'TEXT' })} value="" onChange={() => {}} />,
    );
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('renders NumberField for INTEGER type', () => {
    render(
      <FormField
        field={makeField({ type: 'INTEGER' })}
        value={42}
        onChange={() => {}}
      />,
    );
    // number inputs have role spinbutton per ARIA
    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
  });

  it('renders NumberField for FLOAT type', () => {
    render(
      <FormField
        field={makeField({ type: 'FLOAT' })}
        value={3.14}
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
  });

  it('renders NumberField for CURRENCY type (text input with currency symbol)', () => {
    render(
      <FormField
        field={makeField({ type: 'CURRENCY', currency: '€' })}
        value={99.99}
        onChange={() => {}}
      />,
    );
    // CURRENCY is text input, so role textbox
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    // Currency symbol should be rendered
    expect(screen.getByText('€')).toBeInTheDocument();
  });

  it('renders BooleanField for BOOLEAN type', () => {
    render(
      <FormField
        field={makeField({ type: 'BOOLEAN' })}
        value={true}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Test Field')).toBeInTheDocument();
  });

  it('renders UnsupportedField for unimplemented field types', () => {
  render(
    <FormField
      field={makeField({ type: 'LONGTEXT' })}
      value={null}
      onChange={() => {}}
    />,
  );
  expect(screen.getByText(/Unsupported field type/)).toBeInTheDocument();
  expect(screen.getByText(/LONGTEXT/)).toBeInTheDocument();
  });

  it('renders LookupField for LOOKUP type', () => {
    render(
      <FormField
        field={makeField({
          type: 'LOOKUP',
          lookupItem: 'customers',
          lookupField: 'companyname',
        })}
        value={null}
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search customers...')).toBeInTheDocument();
  });
});

describe('TextField', () => {
  it('renders with placeholder', () => {
    render(
      <FormField
        field={makeField({ type: 'TEXT', placeholder: 'Enter name' })}
        value=""
        onChange={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText('Enter name');
    expect(input).toBeInTheDocument();
  });

  it('displays the caption label', () => {
    render(
      <FormField
        field={makeField({ type: 'TEXT', caption: 'Full Name' })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Full Name')).toBeInTheDocument();
  });
});

describe('NumberField', () => {
  it('renders number input for INTEGER', () => {
    render(
      <FormField
        field={makeField({ type: 'INTEGER', caption: 'Quantity' })}
        value={5}
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(5);
    expect(screen.getByText('Quantity')).toBeInTheDocument();
  });

  it('renders currency text input with $ prefix', () => {
    render(
      <FormField
        field={makeField({ type: 'CURRENCY', caption: 'Price' })}
        value={29.99}
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(screen.getByText('$')).toBeInTheDocument();
  });
});

describe('BooleanField', () => {
  it('renders checkbox by default', () => {
    render(
      <FormField
        field={makeField({ type: 'BOOLEAN', caption: 'Active' })}
        value={true}
        onChange={() => {}}
      />,
    );
    // The base-ui checkbox renders with role="checkbox"
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders toggle switch when format is "toggle"', () => {
    render(
      <FormField
        field={makeField({ type: 'BOOLEAN', caption: 'Enabled', format: 'toggle' })}
        value={true}
        onChange={() => {}}
      />,
    );
    // Switch from base-ui uses role="switch"
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });
});

describe('DateField', () => {
  it('renders date input for DATE type', () => {
    render(
      <FormField
        field={makeField({ type: 'DATE', caption: 'Order Date' })}
        value="2026-07-21"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Order Date') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('date');
  });

  it('renders datetime-local input for DATETIME type', () => {
    render(
      <FormField
        field={makeField({ type: 'DATETIME', caption: 'Created At' })}
        value="2026-07-21T14:30"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Created At') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('datetime-local');
  });

  it('displays label with required indicator', () => {
    render(
      <FormField
        field={makeField({ type: 'DATE', caption: 'Ship Date', required: true })}
        value="2026-07-21"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Ship Date')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('sets min attribute on the input', () => {
    render(
      <FormField
        field={makeField({ type: 'DATE', caption: 'Start Date', min: '2026-01-01' as unknown as number })}
        value="2026-06-15"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Start Date') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.min).toBe('2026-01-01');
  });

  it('sets max attribute on the input', () => {
    render(
      <FormField
        field={makeField({ type: 'DATE', caption: 'End Date', max: '2026-12-31' as unknown as number })}
        value="2026-06-15"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('End Date') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.max).toBe('2026-12-31');
  });

  it('disables past dates when min is set to "today"', () => {
    // Use fake timers to control the date
    vi.useFakeTimers();
    // Set the fake date to 2026-07-21
    vi.setSystemTime(new Date('2026-07-21T12:00:00'));

    render(
      <FormField
        field={makeField({ type: 'DATE', caption: 'Appointment Date', min: 'today' as unknown as number })}
        value="2026-07-21"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Appointment Date') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.min).toBe('2026-07-21');

    vi.useRealTimers();
  });

  it('renders formatted date text in readOnly mode', () => {
    render(
      <FormField
        field={makeField({
          type: 'DATE',
          caption: 'Birth Date',
          format: 'MM/DD/YYYY',
        })}
        value="1990-03-15"
        onChange={() => {}}
        readOnly={true}
      />,
    );
    // In readOnly mode, the formatted date should be displayed as text
    expect(screen.getByText('03/15/1990')).toBeInTheDocument();
  });

  it('renders formatted datetime text in readOnly mode', () => {
    render(
      <FormField
        field={makeField({
          type: 'DATETIME',
          caption: 'Timestamp',
          format: 'YYYY-MM-DD',
        })}
        value="2026-07-21T14:30:00"
        onChange={() => {}}
        readOnly={true}
      />,
    );
    // Should show formatted date + time
    expect(screen.getByText(/2026-07-21/)).toBeInTheDocument();
  });

  it('shows help text when no error', () => {
    render(
      <FormField
        field={makeField({
          type: 'DATE',
          caption: 'Due Date',
          help: 'Select the due date for this order',
        })}
        value="2026-07-21"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Select the due date for this order')).toBeInTheDocument();
  });

  it('shows error text instead of help text', () => {
    render(
      <FormField
        field={makeField({
          type: 'DATE',
          caption: 'Due Date',
          help: 'Select the due date',
        })}
        value="2026-07-21"
        onChange={() => {}}
        error="Date is required"
      />,
    );
    expect(screen.getByText('Date is required')).toBeInTheDocument();
    // Help text should not be visible when there's an error
    expect(screen.queryByText('Select the due date')).not.toBeInTheDocument();
  });
});