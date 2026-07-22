// useDependentLookups — resolves dependent field values from a master lookup record
// When a master lookup field changes value, queries the referenced table once
// and extracts values for all dependent fields. Results are cached to avoid
// repeat queries for the same master ID.
import { useState, useEffect, useRef } from 'react';
import { runLookup } from '@/lib/api';

export interface DependentField {
  /** The field name (column in the master table) whose value to extract */
  fieldName: string;
  /** The field name of the master lookup field on the form */
  masterField: string;
}

/**
 * Resolves dependent field values from a master lookup record.
 *
 * @param masterValue The current value (ID) of the master lookup field
 * @param masterLookupItem The table name the master lookup references
 * @param dependentFields Fields that depend on this master, each with the
 *   fieldName (column in master table) and masterField (the master's field name)
 * @returns An object with dependentValues map, loading flag, and error string
 */
export function useDependentLookups(
  masterValue: string | number | null | undefined,
  masterLookupItem: string,
  dependentFields: DependentField[],
): {
  dependentValues: Record<string, unknown>;
  loading: boolean;
  error: string | null;
} {
  const [dependentValues, setDependentValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const dependentFieldsRef = useRef(dependentFields);
  dependentFieldsRef.current = dependentFields;

  useEffect(() => {
    // If masterValue is null/undefined/empty, clear values
    if (masterValue == null || masterValue === '') {
      setDependentValues({});
      setError(null);
      setLoading(false);
      return;
    }

    const fields = dependentFieldsRef.current;
    if (fields.length === 0) {
      setDependentValues({});
      setError(null);
      setLoading(false);
      return;
    }

    const cacheKey = String(masterValue);

    // Check cache — skip query if we already have values for this master ID
    if (cacheRef.current.has(cacheKey)) {
      setDependentValues(cacheRef.current.get(cacheKey)!);
      setError(null);
      setLoading(false);
      return;
    }

    const fieldNames = fields.map(df => df.fieldName);

    let cancelled = false;

    async function fetchValues() {
      setLoading(true);
      setError(null);
      try {
        const selectFields = ['id', ...fieldNames];
        const escapedValue =
          typeof masterValue === 'string'
            ? `'${masterValue.replace(/'/g, "''")}'`
            : masterValue;
        const sql = `SELECT ${selectFields.join(', ')} FROM ${masterLookupItem} WHERE id = ${escapedValue} LIMIT 1`;
        const res = await runLookup(sql);

        if (cancelled) return;

        if (res.rows.length > 0) {
          const row = res.rows[0];
          const values: Record<string, unknown> = {};
          for (const fname of fieldNames) {
            values[fname] = row[fname] ?? null;
          }
          cacheRef.current.set(cacheKey, values);
          setDependentValues(values);
        } else {
          setDependentValues({});
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to fetch dependent values',
        );
        setDependentValues({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchValues();

    return () => {
      cancelled = true;
    };
    // Only re-run when masterValue or masterLookupItem changes — dependentFields
    // is stable via ref, and including it would cause re-runs on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterValue, masterLookupItem]);

  return { dependentValues, loading, error };
}