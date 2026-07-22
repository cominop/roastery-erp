// FormField — dispatcher that renders the appropriate field control
// based on the FieldDefinition's type property.
import type { FormFieldProps } from './schema/controlSchema';
import TextField from './TextField';
import NumberField from './NumberField';
import BooleanField from './BooleanField';
import UnsupportedField from './UnsupportedField';
import LookupField from './LookupField';
import DateField from './DateField';
import FileField from './FileField';

export default function FormField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
  dependentValues,
  onDependentValuesChange,
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
    case 'LOOKUP':
      return (
        <LookupField
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          error={error}
          tabIndex={tabIndex}
          dependentValues={dependentValues}
          onDependentValuesChange={onDependentValuesChange}
        />
      );
    case 'DATE':
    case 'DATETIME':
      return (
        <DateField
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          error={error}
          tabIndex={tabIndex}
        />
      );
    case 'FILE':
      return (
        <FileField
          field={field}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          tabIndex={tabIndex}
        />
      );
    default:
      return <UnsupportedField field={field} />;
  }
}