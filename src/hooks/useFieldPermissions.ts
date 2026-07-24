// useFieldPermissions — field-level hidden/readonly permissions
// Provides per-field permission flags for a given table based on
// the current user's roles. Hidden fields should not be rendered;
// readonly fields should be displayed but not editable.
import { useState, useEffect, useRef } from "react";

// ─── Cache TTL ─────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  value: FieldPermissionsMap;
  expiresAt: number;
}

// ─── Types ──────────────────────────────────────────────

export interface FieldPermission {
  /** True → field should be hidden from the user entirely */
  hidden: boolean;
  /** True → field is visible but the user cannot edit it */
  readonly: boolean;
}

export type FieldPermissionsMap = Record<string, FieldPermission>;

export interface UseFieldPermissionsReturn {
  /** Map of field_name → { hidden, readonly }, or null while loading */
  fieldPermissions: FieldPermissionsMap | null;
  /** Whether the field permissions fetch is in progress */
  fieldLoading: boolean;
  /** Error message, or null */
  fieldError: string | null;
  /** Check if a specific field is hidden */
  isFieldHidden: (fieldName: string) => boolean;
  /** Check if a specific field is readonly */
  isFieldReadonly: (fieldName: string) => boolean;
  /** Check if a field is editable (not hidden, not readonly) */
  isFieldEditable: (fieldName: string) => boolean;
}

// ─── Hook ──────────────────────────────────────────────

/**
 * Hook that fetches field-level permissions (hidden/readonly) for a given table.
 * Fetches from GET /api/permissions/fields/:table.
 *
 * @example
 * ```tsx
 * const { fieldPermissions, isFieldHidden, isFieldReadonly, isFieldEditable } = useFieldPermissions("orders");
 * if (isFieldHidden("discount")) return null;
 * <Input readOnly={isFieldReadonly("discount")} />
 * ```
 */
export function useFieldPermissions(table: string | undefined): UseFieldPermissionsReturn {
  const [fieldPermissions, setFieldPermissions] = useState<FieldPermissionsMap | null>(null);
  const [fieldLoading, setFieldLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  useEffect(() => {
    if (!table) {
      setFieldPermissions(null);
      setFieldLoading(false);
      setFieldError(null);
      return;
    }

    // Check cache first (with TTL)
    const cached = cacheRef.current.get(table);
    if (cached !== undefined && Date.now() < cached.expiresAt) {
      setFieldPermissions(cached.value);
      setFieldLoading(false);
      setFieldError(null);
      return;
    }
    if (cached !== undefined) cacheRef.current.delete(table); // expired

    let cancelled = false;
    setFieldLoading(true);
    setFieldError(null);

    fetch(`/api/permissions/fields/${encodeURIComponent(table)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch field permissions: ${r.status}`);
        return r.json() as Promise<FieldPermissionsMap>;
      })
      .then((data) => {
        if (!cancelled) {
          cacheRef.current.set(table, { value: data, expiresAt: Date.now() + CACHE_TTL_MS });
          setFieldPermissions(data);
          setFieldLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setFieldError(e.message);
          setFieldPermissions(null);
          setFieldLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [table]);

  const isFieldHidden = (fieldName: string): boolean => {
    if (!fieldPermissions) return false;
    const perm = fieldPermissions[fieldName];
    return perm ? perm.hidden : false;
  };

  const isFieldReadonly = (fieldName: string): boolean => {
    if (!fieldPermissions) return false;
    const perm = fieldPermissions[fieldName];
    return perm ? perm.readonly : false;
  };

  const isFieldEditable = (fieldName: string): boolean => {
    if (!fieldPermissions) return true; // No permissions = implicitly editable
    const perm = fieldPermissions[fieldName];
    if (!perm) return true; // No explicit permission = editable
    return !perm.hidden && !perm.readonly;
  };

  return {
    fieldPermissions,
    fieldLoading,
    fieldError,
    isFieldHidden,
    isFieldReadonly,
    isFieldEditable,
  };
}