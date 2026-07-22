// FileField unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FileField from '../FileField';
import type { FieldDefinition } from '../schema/controlSchema';

// jsdom doesn't implement URL.createObjectURL / revokeObjectURL
const mockObjectUrl = 'blob:mock-url-12345';
beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => mockObjectUrl),
    revokeObjectURL: vi.fn(),
  });
});

function makeField(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: 'file-field',
    name: 'fileField',
    caption: 'Upload File',
    type: 'FILE',
    ...overrides,
  };
}

function makeFile(name = 'invoice.pdf', size = 256000, type = 'application/pdf'): File {
  const content = 'x'.repeat(size);
  return new File([content], name, { type });
}

describe('FileField', () => {
  describe('No file selected', () => {
    it('renders Choose File button when no file selected', () => {
      render(
        <FileField field={makeField({})} value={null} onChange={() => {}} />,
      );
      expect(screen.getByText('📎 Choose File')).toBeInTheDocument();
    });

    it('shows accepted file types when accept is set', () => {
      render(
        <FileField
          field={makeField({ accept: '.pdf,.doc,.jpg' })}
          value={null}
          onChange={() => {}}
        />,
      );
      expect(screen.getByText('Accepted: .pdf,.doc,.jpg')).toBeInTheDocument();
    });

    it('shows max size when maxSize is set', () => {
      render(
        <FileField
          field={makeField({ maxSize: 5 })}
          value={null}
          onChange={() => {}}
        />,
      );
      expect(screen.getByText('Max size: 5 MB')).toBeInTheDocument();
    });

    it('shows "No file" text in readOnly mode when no file', () => {
      render(
        <FileField
          field={makeField({})}
          value={null}
          onChange={() => {}}
          readOnly={true}
        />,
      );
      expect(screen.getByText('No file')).toBeInTheDocument();
      expect(screen.queryByText('📎 Choose File')).not.toBeInTheDocument();
    });

    it('renders the caption label', () => {
      render(
        <FileField
          field={makeField({ caption: 'Contract PDF' })}
          value={null}
          onChange={() => {}}
        />,
      );
      expect(screen.getByText('Contract PDF')).toBeInTheDocument();
    });
  });

  describe('File selected', () => {
    it('shows filename and file size when file is selected', () => {
      const file = makeFile('contract.pdf', 245000);
      render(
        <FileField field={makeField({})} value={file} onChange={() => {}} />,
      );
      expect(screen.getByText('📎 contract.pdf')).toBeInTheDocument();
      expect(screen.getByText('(239.3 KB)')).toBeInTheDocument();
    });

    it('formats size in bytes correctly', () => {
      const file = makeFile('small.txt', 512);
      render(
        <FileField field={makeField({})} value={file} onChange={() => {}} />,
      );
      expect(screen.getByText('(512 B)')).toBeInTheDocument();
    });

    it('formats size in MB correctly', () => {
      const file = makeFile('large.mp4', 5 * 1024 * 1024);
      render(
        <FileField field={makeField({})} value={file} onChange={() => {}} />,
      );
      expect(screen.getByText('(5.0 MB)')).toBeInTheDocument();
    });

    it('shows Download button when file is selected', () => {
      const file = makeFile();
      render(
        <FileField field={makeField({})} value={file} onChange={() => {}} />,
      );
      expect(screen.getByTitle('Download')).toBeInTheDocument();
      expect(screen.getByText('⬇ Download')).toBeInTheDocument();
    });

    it('shows Open button when file is selected', () => {
      const file = makeFile();
      render(
        <FileField field={makeField({})} value={file} onChange={() => {}} />,
      );
      expect(screen.getByTitle('Open')).toBeInTheDocument();
      expect(screen.getByText('🔍 Open')).toBeInTheDocument();
    });

    it('shows Delete button when file is selected (not readOnly)', () => {
      const file = makeFile();
      render(
        <FileField field={makeField({})} value={file} onChange={() => {}} />,
      );
      expect(screen.getByTitle('Delete')).toBeInTheDocument();
      expect(screen.getByText('🗑 Delete')).toBeInTheDocument();
    });

    it('Delete button calls onChange(null)', () => {
      const onChange = vi.fn();
      const file = makeFile();
      render(
        <FileField field={makeField({})} value={file} onChange={onChange} />,
      );
      fireEvent.click(screen.getByTitle('Delete'));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('shows no Choose File button when file is selected', () => {
      const file = makeFile();
      render(
        <FileField field={makeField({})} value={file} onChange={() => {}} />,
      );
      expect(screen.queryByText('📎 Choose File')).not.toBeInTheDocument();
    });
  });

  describe('readOnly mode', () => {
    it('hides upload and delete controls when readOnly with file', () => {
      const file = makeFile();
      render(
        <FileField
          field={makeField({})}
          value={file}
          onChange={() => {}}
          readOnly={true}
        />,
      );
      // Should still show file info
      expect(screen.getByText('📎 invoice.pdf')).toBeInTheDocument();
      // Should show Download and Open
      expect(screen.getByTitle('Download')).toBeInTheDocument();
      expect(screen.getByTitle('Open')).toBeInTheDocument();
      // Should NOT show Delete
      expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
      // Should NOT show Choose File
      expect(screen.queryByText('📎 Choose File')).not.toBeInTheDocument();
    });

    it('shows "No file" text when readOnly with no file', () => {
      render(
        <FileField
          field={makeField({})}
          value={null}
          onChange={() => {}}
          readOnly={true}
        />,
      );
      expect(screen.getByText('No file')).toBeInTheDocument();
    });
  });

  describe('Download action', () => {
    it('creates a blob URL when Download is clicked', () => {
      const file = makeFile();
      render(
        <FileField field={makeField({})} value={file} onChange={() => {}} />,
      );
      fireEvent.click(screen.getByTitle('Download'));
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    });
  });

  describe('Open action', () => {
    it('calls window.open with a blob URL when Open is clicked', () => {
      const file = makeFile();
      const windowOpenSpy = vi.spyOn(window, 'open');
      windowOpenSpy.mockReturnValue(null);

      render(
        <FileField field={makeField({})} value={file} onChange={() => {}} />,
      );
      fireEvent.click(screen.getByTitle('Open'));

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(windowOpenSpy).toHaveBeenCalledWith(mockObjectUrl, '_blank');
      windowOpenSpy.mockRestore();
    });
  });
});