// UnsupportedField — fallback placeholder for unimplemented field types
import type { FieldDefinition } from './schema/controlSchema';

interface Props {
  field: FieldDefinition;
}

export default function UnsupportedField({ field }: Props) {
  return (
    <div
      className="flex items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-md px-3 py-4 text-xs text-muted-foreground"
    >
      <span>
        Unsupported field type: <code className="font-mono text-xs">{field.type}</code>
      </span>
    </div>
  );
}
