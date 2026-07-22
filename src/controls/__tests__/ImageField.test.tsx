// ImageField unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImageField from '../ImageField';
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
    id: 'image-field',
    name: 'imageField',
    caption: 'Upload Image',
    type: 'IMAGE',
    ...overrides,
  };
}

function makeImage(
  name = 'photo.jpg',
  size = 102400,
  type = 'image/jpeg',
): File {
  const content = 'x'.repeat(size);
  return new File([content], name, { type });
}

describe('ImageField', () => {
  describe('No image selected', () => {
    it('renders upload placeholder with 📷 icon when no image', () => {
      render(
        <ImageField field={makeField({})} value={null} onChange={() => {}} />,
      );
      expect(
        screen.getByText('📷 Click to upload image'),
      ).toBeInTheDocument();
    });

    it('shows caption label', () => {
      render(
        <ImageField
          field={makeField({ caption: 'Product Photo' })}
          value={null}
          onChange={() => {}}
        />,
      );
      expect(screen.getByText('Product Photo')).toBeInTheDocument();
    });

    it('shows drag-and-drop zone', () => {
      render(
        <ImageField field={makeField({})} value={null} onChange={() => {}} />,
      );
      const dropzone = screen.getByTestId('image-dropzone');
      expect(dropzone).toBeInTheDocument();
      // Should have dashed border class
      expect(dropzone.className).toContain('border-dashed');
    });

    it('camera button renders when captureFromCamera is true', () => {
      render(
        <ImageField
          field={makeField({ captureFromCamera: true })}
          value={null}
          onChange={() => {}}
        />,
      );
      expect(
        screen.getByTitle('Capture from camera'),
      ).toBeInTheDocument();
    });
  });

  describe('Image selected', () => {
    it('shows thumbnail preview when image is selected', () => {
      const file = makeImage();
      render(
        <ImageField field={makeField({})} value={file} onChange={() => {}} />,
      );
      const thumbnail = screen.getByTestId('image-thumbnail');
      expect(thumbnail).toBeInTheDocument();
      // Should contain an img element
      const img = thumbnail.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', 'photo.jpg');
    });

    it('shows Download, View, Remove buttons when image is selected', () => {
      const file = makeImage();
      render(
        <ImageField field={makeField({})} value={file} onChange={() => {}} />,
      );
      expect(screen.getByTitle('Download')).toBeInTheDocument();
      expect(screen.getByTitle('View')).toBeInTheDocument();
      expect(screen.getByTitle('Remove')).toBeInTheDocument();
    });

    it('Remove button calls onChange(null)', () => {
      const onChange = vi.fn();
      const file = makeImage();
      render(
        <ImageField field={makeField({})} value={file} onChange={onChange} />,
      );
      fireEvent.click(screen.getByTitle('Remove'));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  describe('readOnly mode', () => {
    it('hides Remove button but shows Download and View when readOnly with image', () => {
      const file = makeImage();
      render(
        <ImageField
          field={makeField({})}
          value={file}
          onChange={() => {}}
          readOnly={true}
        />,
      );
      // Should show thumbnail
      expect(screen.getByTestId('image-thumbnail')).toBeInTheDocument();
      // Should show Download and View
      expect(screen.getByTitle('Download')).toBeInTheDocument();
      expect(screen.getByTitle('View')).toBeInTheDocument();
      // Should NOT show Remove
      expect(screen.queryByTitle('Remove')).not.toBeInTheDocument();
    });

    it('shows "No image" text when readOnly with no image', () => {
      render(
        <ImageField
          field={makeField({})}
          value={null}
          onChange={() => {}}
          readOnly={true}
        />,
      );
      expect(screen.getByText('No image')).toBeInTheDocument();
      // Should NOT show upload placeholder
      expect(
        screen.queryByText('📷 Click to upload image'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Custom dimensions', () => {
    it('configurable edit dimensions render correctly', () => {
      render(
        <ImageField
          field={makeField({ editWidth: 300, editHeight: 250 })}
          value={null}
          onChange={() => {}}
        />,
      );
      const dropzone = screen.getByTestId('image-dropzone');
      expect(dropzone).toHaveStyle({ width: '300px', height: '250px' });
    });
  });

  describe('Download action', () => {
    it('creates a blob URL when Download is clicked', () => {
      const file = makeImage();
      render(
        <ImageField field={makeField({})} value={file} onChange={() => {}} />,
      );
      fireEvent.click(screen.getByTitle('Download'));
      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    });
  });

  describe('View action', () => {
    it('calls window.open with a blob URL when View is clicked', () => {
      const file = makeImage();
      const windowOpenSpy = vi.spyOn(window, 'open');
      windowOpenSpy.mockReturnValue(null);

      render(
        <ImageField field={makeField({})} value={file} onChange={() => {}} />,
      );
      fireEvent.click(screen.getByTitle('View'));

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(windowOpenSpy).toHaveBeenCalledWith(mockObjectUrl, '_blank');
      windowOpenSpy.mockRestore();
    });
  });
});