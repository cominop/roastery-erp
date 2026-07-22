// TextField — renders TEXT field type as <input type="text">
// Supports input masking via field.mask (useFieldMask hook).
import type { FormFieldProps } from './schema/controlSchema';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useFieldMask } from './hooks/useFieldMask';

export default function TextField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
}: FormFieldProps) {
  const strVal = value == null ? '' : String(value);
  const { formatDisplay, getUnmaskedValue } = useFieldMask(field.mask);

  const displayValue = field.mask ? formatDisplay(strVal) : strVal;

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
        type="text"
        className={cn(
          'w-full text-xs rounded-[var(--app-field-border-radius,6px)]',
          field.alignment === 'center' && 'text-center',
          field.alignment === 'right' && 'text-right',
        )}
        value={displayValue}
        readOnly={readOnly ?? field.readOnly ?? false}
        placeholder={field.placeholder ?? (field.mask ? field.mask.replace(/[^X09?]/g, '_') : undefined)}
        maxLength={field.size}
        tabIndex={tabIndex ?? field.tabIndex}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          if (!(readOnly ?? field.readOnly)) {
            const raw = field.mask ? getUnmaskedValue(e.target.value) : e.target.value;
            onChange(raw);
          }
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
