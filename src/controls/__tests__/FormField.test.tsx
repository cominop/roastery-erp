// FormField unit tests
import { describe, it, expect, vi } from 'vitest';
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
        field={makeField({ type: 'DATE' })}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/Unsupported field type/)).toBeInTheDocument();
    expect(screen.getByText(/DATE/)).toBeInTheDocument();
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
