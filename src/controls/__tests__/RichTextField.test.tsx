// RichTextField unit tests
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RichTextField from '../RichTextField';
import type { FieldDefinition } from '../schema/controlSchema';

function makeField(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: 'richtext-field',
    name: 'richtextField',
    caption: 'Description',
    type: 'LONGTEXT',
    ...overrides,
  };
}

describe('RichTextField', () => {
  it('renders with caption label', () => {
    render(
      <RichTextField
        field={makeField({ caption: 'Product Description' })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Product Description')).toBeInTheDocument();
  });

  it('renders with placeholder text', () => {
    render(
      <RichTextField
        field={makeField({ placeholder: 'Enter product details…' })}
        value=""
        onChange={() => {}}
      />,
    );
    // TipTap renders a ProseMirror editor element
    const editorEl = document.querySelector('.ProseMirror');
    expect(editorEl).toBeInTheDocument();
    // The editor should be contenteditable
    expect(editorEl!.getAttribute('contenteditable')).toBe('true');
  });

  it('renders with initial HTML value', () => {
    render(
      <RichTextField
        field={makeField({})}
        value="<p>Hello <strong>world</strong></p>"
        onChange={() => {}}
      />,
    );
    const editorEl = document.querySelector('.ProseMirror');
    expect(editorEl).toBeInTheDocument();
    // The editor should contain the rendered HTML content
    expect(editorEl!.innerHTML).toContain('Hello');
    expect(editorEl!.innerHTML).toContain('<strong>world</strong>');
  });

  it('calls onChange when content changes', async () => {
    const onChange = vi.fn();
    render(
      <RichTextField
        field={makeField({})}
        value=""
        onChange={onChange}
      />,
    );
    const editorEl = document.querySelector('.ProseMirror');
    expect(editorEl).toBeInTheDocument();

    // Wait for ProseMirror to be fully initialized
    await vi.waitFor(() => {
      expect(editorEl!.querySelector('p')).toBeInTheDocument();
    });

    // Simulate a content change by modifying the DOM directly.
    // ProseMirror's MutationObserver will detect the change and
    // fire onUpdate via the TipTap editor.
    const p = editorEl!.querySelector('p')!;
    p.textContent = 'Typed content';

    // Wait for ProseMirror to process the mutation and call onChange
    await vi.waitFor(
      () => {
        expect(onChange).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    // Should pass the HTML content through
    expect(onChange).not.toHaveBeenCalledWith('');
  });

  it('shows error text when error prop is provided', () => {
    render(
      <RichTextField
        field={makeField({
          caption: 'Bio',
          help: 'Write a short bio',
        })}
        value=""
        onChange={() => {}}
        error="Content is required"
      />,
    );
    expect(screen.getByText('Content is required')).toBeInTheDocument();
    // Help text should NOT be visible when there's an error
    expect(screen.queryByText('Write a short bio')).not.toBeInTheDocument();
  });

  it('shows help text when no error', () => {
    render(
      <RichTextField
        field={makeField({
          caption: 'Bio',
          help: 'Write a short bio',
        })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Write a short bio')).toBeInTheDocument();
  });

  it('renders in readOnly mode (no toolbar/editing)', () => {
    render(
      <RichTextField
        field={makeField({ caption: 'Notes' })}
        value="<p>Read-only <em>content</em></p>"
        onChange={() => {}}
        readOnly={true}
      />,
    );
    // Should render the read-only content div
    const readOnlyDiv = screen.getByTestId('richtext-readonly');
    expect(readOnlyDiv).toBeInTheDocument();
    // Should contain the HTML content rendered safely
    expect(readOnlyDiv.innerHTML).toContain('Read-only');
    expect(readOnlyDiv.innerHTML).toContain('<em>content</em>');
    // No toolbar should appear
    expect(screen.queryByTestId('richtext-toolbar')).not.toBeInTheDocument();
    // No editor should appear
    expect(document.querySelector('.ProseMirror')).not.toBeInTheDocument();
  });

  it('formats toolbar buttons', () => {
    render(
      <RichTextField
        field={makeField({})}
        value=""
        onChange={() => {}}
      />,
    );
    // Toolbar should render with formatting buttons
    const toolbar = screen.getByTestId('richtext-toolbar');
    expect(toolbar).toBeInTheDocument();

    // Check for specific format buttons
    expect(screen.getByTitle('Bold')).toBeInTheDocument();
    expect(screen.getByTitle('Italic')).toBeInTheDocument();
    expect(screen.getByTitle('Strike')).toBeInTheDocument();
    expect(screen.getByTitle('Heading 1')).toBeInTheDocument();
    expect(screen.getByTitle('Heading 2')).toBeInTheDocument();
    expect(screen.getByTitle('Bullet List')).toBeInTheDocument();
    expect(screen.getByTitle('Ordered List')).toBeInTheDocument();
    expect(screen.getByTitle('Blockquote')).toBeInTheDocument();
    expect(screen.getByTitle('Code Block')).toBeInTheDocument();
  });

  it('shows required indicator on label', () => {
    render(
      <RichTextField
        field={makeField({
          caption: 'Details',
          required: true,
        })}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders "No content" text in readOnly when value is empty', () => {
    render(
      <RichTextField
        field={makeField({ caption: 'Notes' })}
        value={null}
        onChange={() => {}}
        readOnly={true}
      />,
    );
    const readOnlyDiv = screen.getByTestId('richtext-readonly');
    expect(readOnlyDiv).toBeInTheDocument();
    expect(readOnlyDiv).toHaveTextContent('No content');
  });
});