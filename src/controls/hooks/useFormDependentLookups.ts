// useFormDependentLookups — form-level orchestrator for dependent lookup resolution
//
// Groups all form fields by their masterField, and for each master lookup field
// that has a value, queries the referenced table once to resolve values for all
// dependent fields. Returns a single map of field name → auto-filled value.
import { useState, useEffect, useMemo, useRef } from 'react';
import type { FieldDefinition } from '../schema/controlSchema';
import { runLookup } from '@/lib/api';

interface MasterGroup {
  /** The master lookup field definition */
  masterField: FieldDefinition;
  /** The field names (columns in the master table) to extract */
  dependentFieldNames: string[];
}

/**
 * Resolves all dependent lookup values for a form.
 *
 * @param fields All field definitions on the form
 * @param values Current values map (field name → value) for all fields
 * @returns A map of dependent field name → auto-filled value
 */
export function useFormDependentLookups(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const [resolvedValues, setResolvedValues] = useState<Record<string, unknown>>({});
  const cacheRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const prevMasterKeyRef = useRef('');

  // Group fields by masterField — stable across renders via useMemo
  const masterGroups = useMemo(() => {
    const groups = new Map<string, MasterGroup>();
    for (const field of fields) {
      if (!field.masterField) continue;
      const masterName = field.masterField;
      if (!groups.has(masterName)) {
        // Find the master field definition (match by name or id)
        const masterField = fields.find(
          f => f.name === masterName || f.id === masterName,
        );
        if (!masterField) continue;
        groups.set(masterName, {
          masterField,
          dependentFieldNames: [],
        });
      }
      groups.get(masterName)!.dependentFieldNames.push(field.name || field.id);
    }
    return groups;
  }, [fields]);

  // Build a stable key from the current state of master values and groups
  const masterKey = useMemo(() => {
    const parts: string[] = [];
    for (const [masterName, group] of masterGroups) {
      const masterVal = values[masterName];
      if (masterVal != null && masterVal !== '') {
        parts.push(
          `${masterName}=${String(masterVal)}|${group.masterField.lookupItem ?? ''}`,
        );
      }
    }
    return parts.sort().join(';');
  }, [masterGroups, values]);

  useEffect(() => {
    if (masterKey === prevMasterKeyRef.current) return;
    prevMasterKeyRef.current = masterKey;

    if (!masterKey) {
      setResolvedValues({});
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      const combined: Record<string, unknown> = {};

      for (const [masterName, group] of masterGroups) {
        const masterVal = values[masterName];
        if (masterVal == null || masterVal === '') continue;

        const lookupItem = group.masterField.lookupItem;
        if (!lookupItem) continue;

        const cacheKey = `${lookupItem}:${String(masterVal)}`;

        // Check cache first
        if (cacheRef.current.has(cacheKey)) {
          Object.assign(combined, cacheRef.current.get(cacheKey)!);
          continue;
        }

        if (group.dependentFieldNames.length === 0) continue;

        const fieldNames = group.dependentFieldNames;
        const selectFields = ['id', ...fieldNames];
        const escapedValue =
          typeof masterVal === 'string'
            ? `'${masterVal.replace(/'/g, "''")}'`
            : masterVal;
        const sql = `SELECT ${selectFields.join(', ')} FROM ${lookupItem} WHERE id = ${escapedValue} LIMIT 1`;

        try {
          const res = await runLookup(sql);
          if (cancelled) return;

          if (res.rows.length > 0) {
            const row = res.rows[0];
            const groupValues: Record<string, unknown> = {};
            for (const fname of fieldNames) {
              groupValues[fname] = row[fname] ?? null;
            }
            cacheRef.current.set(cacheKey, groupValues);
            Object.assign(combined, groupValues);
          }
        } catch {
          // Silently skip — individual master failures shouldn't break all lookups
        }
      }

      if (!cancelled) {
        setResolvedValues(combined);
      }
    }

    fetchAll();

    return () => {
      cancelled = true;
    };
  }, [masterKey, masterGroups, values]);

  return resolvedValues;
}