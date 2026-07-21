// FormField — dispatcher that renders the appropriate field control
// based on the FieldDefinition's type property.
import type { FormFieldProps } from './schema/controlSchema';
import TextField from './TextField';
import NumberField from './NumberField';
import BooleanField from './BooleanField';
import UnsupportedField from './UnsupportedField';

export default function FormField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
}: FormFieldProps) {
  switch (field.type) {
    case 'TEXT':
      return (
        <TextField
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          error={error}
          tabIndex={tabIndex}
        />
      );
    case 'INTEGER':
    case 'FLOAT':
    case 'CURRENCY':
      return (
        <NumberField
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          error={error}
          tabIndex={tabIndex}
        />
      );
    case 'BOOLEAN':
      return (
        <BooleanField
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          error={error}
          tabIndex={tabIndex}
        />
      );
    default:
      return <UnsupportedField field={field} />;
  }
}
