// FilterControlFactory — renders the appropriate type-specific filter control
// based on the column's type property.
import type { FilterColumn, FilterControlProps } from "./types";
import TextFilterControl from "./TextFilterControl";
import NumberRangeFilterControl from "./NumberRangeFilterControl";
import DateRangeFilterControl from "./DateRangeFilterControl";
import BooleanFilterControl from "./BooleanFilterControl";
import LookupFilterControl from "./LookupFilterControl";

interface FilterControlFactoryProps extends FilterControlProps {
  column: FilterColumn;
}

export default function FilterControlFactory({
  column,
  onApply,
  onCancel,
}: FilterControlFactoryProps) {
  switch (column.type) {
    case "text":
      return (
        <TextFilterControl column={column} onApply={onApply} onCancel={onCancel} />
      );
    case "number":
      return (
        <NumberRangeFilterControl column={column} onApply={onApply} onCancel={onCancel} />
      );
    case "date":
      return (
        <DateRangeFilterControl column={column} onApply={onApply} onCancel={onCancel} />
      );
    case "boolean":
      return (
        <BooleanFilterControl column={column} onApply={onApply} onCancel={onCancel} />
      );
    case "lookup":
      return (
        <LookupFilterControl column={column} onApply={onApply} onCancel={onCancel} />
      );
    default:
      return (
        <TextFilterControl column={column} onApply={onApply} onCancel={onCancel} />
      );
  }
}