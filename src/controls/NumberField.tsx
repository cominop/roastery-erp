// NumberField — renders INTEGER / FLOAT / CURRENCY field types
import type { FieldDefinition, FormFieldProps, FieldType } from './schema/controlSchema';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function inputTypeForType(ft: FieldType): string {
  switch (ft) {
    case 'INTEGER':
      return 'number';
    case 'FLOAT':
      return 'number';
    case 'CURRENCY':
      return 'text';
    default:
      return 'number';
  }
}

function stepForType(ft: FieldType): string | undefined {
  switch (ft) {
    case 'INTEGER':
      return '1';
    case 'FLOAT':
      return '0.01';
    default:
      return undefined;
  }
}

function formatCurrencyValue(val: unknown, def?: FieldDefinition): string {
  if (val == null || val === '') return '';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  const decimals = def?.decimals ?? 2;
  return num.toFixed(decimals);
}

export default function NumberField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
}: FormFieldProps) {
  const isCurrency = field.type === 'CURRENCY';
  const currencySymbol = field.currency ?? '$';

  // For currency, we display a formatted string; for number types, we pass the raw value
  const displayValue = isCurrency
    ? formatCurrencyValue(value, field)
    : (value == null ? '' : String(value));

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={field.id}
        className="text-xs font-medium text-foreground"
      >
        {field.caption}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <div className="relative">
        {isCurrency && (
          <span
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5',
              'text-xs text-muted-foreground',
            )}
          >
            {currencySymbol}
          </span>
        )}
        <Input
          id={field.id}
          type={inputTypeForType(field.type)}
          step={isCurrency ? undefined : stepForType(field.type)}
          min={field.min}
          max={field.max}
          className={cn(
            'w-full text-xs rounded-[var(--app-field-border-radius,6px)]',
            isCurrency && 'pl-6',
            field.alignment === 'center' && 'text-center',
            field.alignment === 'right' && 'text-right',
          )}
          value={displayValue}
          readOnly={readOnly ?? field.readOnly ?? false}
          placeholder={field.placeholder}
          tabIndex={tabIndex ?? field.tabIndex}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            if (readOnly ?? field.readOnly) return;
            if (isCurrency) {
              // Allow digits, decimal point, and minus sign
              const cleaned = e.target.value.replace(/[^0-9.\-]/g, '');
              onChange(cleaned === '' ? null : parseFloat(cleaned));
            } else {
              const raw = e.target.value;
              if (raw === '') {
                onChange(null);
              } else if (field.type === 'INTEGER') {
                const parsed = parseInt(raw, 10);
                if (!isNaN(parsed)) onChange(parsed);
              } else {
                const parsed = parseFloat(raw);
                if (!isNaN(parsed)) onChange(parsed);
              }
            }
          }}
        />
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
