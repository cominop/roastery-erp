// DateField — renders DATE / DATETIME field types as native HTML date inputs
import type { FormFieldProps } from './schema/controlSchema';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Parse a date string using local timezone-aware parts.
 * Handles ISO date strings ('2026-07-21') and ISO datetime strings ('2026-07-21T14:30').
 * Returns the date components or null if unparseable.
 */
function parseLocalDate(value: unknown): { y: number; m: number; d: number; hh?: number; mm?: number } | null {
  if (value == null || value === '') return null;
  const str = String(value);

  // Try ISO datetime: YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
  const dtMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (dtMatch) {
    return {
      y: parseInt(dtMatch[1], 10),
      m: parseInt(dtMatch[2], 10),
      d: parseInt(dtMatch[3], 10),
      hh: parseInt(dtMatch[4], 10),
      mm: parseInt(dtMatch[5], 10),
    };
  }

  // Try YYYY-MM-DD
  const dMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dMatch) {
    return {
      y: parseInt(dMatch[1], 10),
      m: parseInt(dMatch[2], 10),
      d: parseInt(dMatch[3], 10),
    };
  }

  // Fallback: try Date constructor
  const date = new Date(str);
  if (isNaN(date.getTime())) return null;
  return {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    hh: date.getHours(),
    mm: date.getMinutes(),
  };
}

/**
 * Format a date value for text display using the specified format string.
 * Supported formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
 */
function formatDateDisplay(value: unknown, format?: string): string {
  const parts = parseLocalDate(value);
  if (!parts) return value == null || value === '' ? '' : String(value);

  const { y, m, d } = parts;
  if (!format || format === 'YYYY-MM-DD') {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (format === 'MM/DD/YYYY') {
    return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
  }
  if (format === 'DD/MM/YYYY') {
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  // Fallback
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Format a datetime value for text display.
 */
function formatDatetimeDisplay(value: unknown, format?: string): string {
  const parts = parseLocalDate(value);
  if (!parts) return value == null || value === '' ? '' : String(value);

  const { y, m, d, hh, mm } = parts;
  const dateStr = formatDateDisplay(value, format);
  const hour = hh ?? 0;
  const minute = mm ?? 0;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  const timeStr = `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
  return `${dateStr} ${timeStr}`;
}

/**
 * Convert a value to the format expected by native date inputs.
 * type="date" expects YYYY-MM-DD; type="datetime-local" expects YYYY-MM-DDTHH:mm
 */
function toNativeDateValue(value: unknown, isDatetime: boolean): string {
  const parts = parseLocalDate(value);
  if (!parts) return '';
  const { y, m, d } = parts;
  if (isDatetime) {
    const hh = String(parts.hh ?? 0).padStart(2, '0');
    const mm = String(parts.mm ?? 0).padStart(2, '0');
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${hh}:${mm}`;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Get today's date as YYYY-MM-DD */
function getTodayString(): string {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DateField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
}: FormFieldProps) {
  const isDatetime = field.type === 'DATETIME';
  const inputType = isDatetime ? 'datetime-local' : 'date';
  const isReadOnly = readOnly ?? field.readOnly ?? false;

  // Resolve min — 'today' means disable past dates
  let minAttr: string | undefined;
  if (field.min === ('today' as unknown)) {
    minAttr = getTodayString();
  } else if (field.min != null) {
    minAttr = String(field.min);
  }

  let maxAttr: string | undefined;
  if (field.max != null) {
    maxAttr = String(field.max);
  }

  // ReadOnly mode: display formatted date as text in a styled div
  if (isReadOnly) {
    const display = isDatetime
      ? formatDatetimeDisplay(value, field.format)
      : formatDateDisplay(value, field.format);

    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">
          {field.caption}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        <div
          className={cn(
            'flex items-center h-8 w-full px-2.5 py-1 text-xs',
            'rounded-[var(--app-field-border-radius,6px)]',
            'border border-input bg-transparent text-foreground opacity-70',
          )}
        >
          {display || <span className="text-muted-foreground">—</span>}
        </div>
        {field.help && !error && (
          <p className="text-[10px] text-muted-foreground">{field.help}</p>
        )}
        {error && (
          <p className="text-[10px] text-destructive">{error}</p>
        )}
      </div>
    );
  }

  const nativeValue = toNativeDateValue(value, isDatetime);

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={field.id}
        className="text-xs font-medium text-foreground"
      >
        {field.caption}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <Input
        id={field.id}
        type={inputType}
        className={cn(
          'w-full text-xs rounded-[var(--app-field-border-radius,6px)]',
          field.alignment === 'center' && 'text-center',
          field.alignment === 'right' && 'text-right',
        )}
        value={nativeValue}
        min={minAttr}
        max={maxAttr}
        readOnly={false}
        placeholder={field.placeholder}
        tabIndex={tabIndex ?? field.tabIndex}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          if (isReadOnly) return;
          const raw = e.target.value;
          onChange(raw === '' ? null : raw);
        }}
      />
      {field.help && !error && (
        <p className="text-[10px] text-muted-foreground">{field.help}</p>
      )}
      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}
