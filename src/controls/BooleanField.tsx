// BooleanField — renders BOOLEAN field type as checkbox or toggle switch
import type { FormFieldProps } from './schema/controlSchema';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

export default function BooleanField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
}: FormFieldProps) {
  const isToggle = field.format === 'toggle';
  const disabled = readOnly ?? field.readOnly ?? false;
  const checked = Boolean(value);
  const id = `${field.id}-boolean`;

  if (isToggle) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Switch
            id={id}
            checked={checked}
            disabled={disabled}
            onCheckedChange={(c: boolean) => {
              if (!disabled) onChange(c);
            }}
          />
          <label htmlFor={id} className="text-xs font-medium text-foreground cursor-pointer">
            {field.caption}
          </label>
        </div>
        {error && (
          <p className="text-[10px] text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          tabIndex={tabIndex ?? field.tabIndex}
          onCheckedChange={(c) => {
            if (!disabled) onChange(c);
          }}
        />
        <label htmlFor={id} className="text-xs font-medium text-foreground cursor-pointer">
          {field.caption}
        </label>
      </div>
      {error && (
        <p className="text-[10px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
