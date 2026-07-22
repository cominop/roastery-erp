// FileField — renders FILE type field with upload/download/delete
import { useRef, useState, useCallback } from 'react';
import type { FormFieldProps } from './schema/controlSchema';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
}: FormFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalError, setInternalError] = useState<string | null>(null);

  const maxSize = field.maxSize ?? 10;
  const isReadOnly = readOnly ?? field.readOnly ?? false;
  const selectedFile = value instanceof File ? value : null;

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInternalError(null);
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > maxSize * 1024 * 1024) {
        setInternalError(`File exceeds maximum size of ${maxSize} MB`);
        // Reset the input so the same file can be re-selected
        e.target.value = '';
        return;
      }

      onChange(file);
    },
    [maxSize, onChange],
  );

  const handleDownload = useCallback(() => {
    if (!selectedFile) return;
    const url = URL.createObjectURL(selectedFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [selectedFile]);

  const handleOpen = useCallback(() => {
    if (!selectedFile) return;
    const url = URL.createObjectURL(selectedFile);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [selectedFile]);

  const handleDelete = useCallback(() => {
    onChange(null);
    setInternalError(null);
  }, [onChange]);

  return (
    <div className="flex flex-col gap-1">
      {field.caption && (
        <label
          htmlFor={field.id}
          className="text-xs font-medium text-foreground"
        >
          {field.caption}
          {field.required && (
            <span className="text-destructive ml-0.5">*</span>
          )}
        </label>
      )}

      {selectedFile ? (
        // ── File selected state ──────────────────────────────
        <div className="flex items-center gap-2 rounded-[var(--app-field-border-radius,6px)] border border-border bg-background px-3 py-2">
          <span className="text-xs font-medium truncate flex-1">
            📎 {selectedFile.name}
          </span>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            ({formatFileSize(selectedFile.size)})
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="outline"
              onClick={handleDownload}
              tabIndex={tabIndex ?? field.tabIndex}
              title="Download"
            >
              ⬇ Download
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={handleOpen}
              tabIndex={tabIndex ?? field.tabIndex}
              title="Open"
            >
              🔍 Open
            </Button>
            {!isReadOnly && (
              <Button
                size="xs"
                variant="destructive"
                onClick={handleDelete}
                tabIndex={tabIndex ?? field.tabIndex}
                title="Delete"
              >
                🗑 Delete
              </Button>
            )}
          </div>
        </div>
      ) : (
        // ── No file state ────────────────────────────────────
        <div className="flex flex-col gap-1">
          <div
            className={cn(
              'flex items-center gap-2 rounded-[var(--app-field-border-radius,6px)] border border-dashed border-border bg-background px-3 py-3',
              !isReadOnly &&
                'cursor-pointer hover:border-muted-foreground transition-colors',
            )}
            onClick={() => {
              if (!isReadOnly) inputRef.current?.click();
            }}
          >
            <input
              ref={inputRef}
              id={field.id}
              type="file"
              accept={field.accept ?? undefined}
              onChange={handleFileSelect}
              className="hidden"
              disabled={isReadOnly}
              tabIndex={isReadOnly ? -1 : (tabIndex ?? field.tabIndex)}
            />
            {!isReadOnly ? (
              <span className="text-xs text-muted-foreground">
                📎 Choose File
              </span>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                No file
              </span>
            )}
          </div>
          {field.accept && (
            <p className="text-[10px] text-muted-foreground">
              Accepted: {field.accept}
            </p>
          )}
          {field.maxSize && (
            <p className="text-[10px] text-muted-foreground">
              Max size: {field.maxSize} MB
            </p>
          )}
        </div>
      )}

      {internalError && (
        <p className="text-[10px] text-destructive" role="alert">
          {internalError}
        </p>
      )}
      {error && (
        <p className="text-[10px] text-destructive" role="alert">
          {error}
        </p>
      )}
      {field.help && !error && !internalError && (
        <p className="text-[10px] text-muted-foreground">{field.help}</p>
      )}
    </div>
  );
}