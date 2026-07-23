// usePermissions — RBAC permission hook
// Provides user info, role-based permission checking, and per-table
// boolean flags (canSelect, canInsert, canUpdate, canDelete).
import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ──────────────────────────────────────────────

export type PermissionAction = "select" | "insert" | "update" | "delete";

export interface UserInfo {
  userId: number;
  companyId: number;
  roleIds: number[];
  roleNames: string[];
  isAdmin: boolean;
}

export interface TablePermissions {
  canSelect: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface UsePermissionsOptions {
  /** If provided, the hook fetches permissions for this table and exposes
   *  canSelect/canInsert/canUpdate/canDelete booleans. */
  table?: string;
}

export interface UsePermissionsReturn {
  /** Current user identity and role info, or null while loading */
  userInfo: UserInfo | null;
  /** Whether the initial user-info fetch is in progress */
  loading: boolean;
  /** Error message, or null */
  error: string | null;
  /** Shorthand for userInfo?.isAdmin ?? false */
  isAdmin: boolean;
  /** Check a single permission on any table. Results are cached in-memory. */
  checkPermission: (table: string, action: PermissionAction) => Promise<boolean>;
  /** Permission flags for the configured table (undefined when no table provided) */
  canSelect: boolean | undefined;
  canInsert: boolean | undefined;
  canUpdate: boolean | undefined;
  canDelete: boolean | undefined;
  /** Table-level permission flags as a grouped object (undefined when no table provided) */
  tablePermissions: TablePermissions | undefined;
}

// ─── Cache key ─────────────────────────────────────────

function cacheKey(table: string, action: string): string {
  return `${table}::${action}`;
}

// ─── Hook ──────────────────────────────────────────────

/**
 * Hook that provides the current user's role info and permission-checking
 * functions. When a `table` option is provided, it also fetches and exposes
 * the four CRUD permission flags for that table.
 *
 * @example
 * ```tsx
 * // Check permissions dynamically
 * const { checkPermission } = usePermissions();
 * const canEdit = await checkPermission("orders", "update");
 *
 * // Get table-level booleans
 * const { canInsert, canUpdate } = usePermissions({ table: "orders" });
 * ```
 */
export function usePermissions(options?: UsePermissionsOptions): UsePermissionsReturn {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tablePerms, setTablePerms] = useState<TablePermissions | undefined>(undefined);

  // In-memory cache for checkPermission results
  const cacheRef = useRef<Map<string, boolean>>(new Map());

  // ── Fetch user info on mount ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/permissions/user")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch user info: ${r.status}`);
        return r.json() as Promise<UserInfo>;
      })
      .then((info) => {
        if (!cancelled) {
          setUserInfo(info);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch table permissions when table changes ────────
  useEffect(() => {
    if (!options?.table) {
      setTablePerms(undefined);
      return;
    }

    let cancelled = false;

    fetch("/api/permissions/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: options.table }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Permission check failed: ${r.status}`);
        return r.json() as Promise<TablePermissions>;
      })
      .then((perms) => {
        if (!cancelled) {
          setTablePerms(perms);
          // Also populate the cache so checkPermission calls are instant
          cacheRef.current.set(cacheKey(options.table!, "select"), perms.canSelect);
          cacheRef.current.set(cacheKey(options.table!, "insert"), perms.canInsert);
          cacheRef.current.set(cacheKey(options.table!, "update"), perms.canUpdate);
          cacheRef.current.set(cacheKey(options.table!, "delete"), perms.canDelete);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTablePerms(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [options?.table]);

  // ── checkPermission function ──────────────────────────
  const checkPermission = useCallback(
    async (table: string, action: PermissionAction): Promise<boolean> => {
      const key = cacheKey(table, action);

      // Check in-memory cache first
      const cached = cacheRef.current.get(key);
      if (cached !== undefined) return cached;

      // Admin bypass
      if (userInfo?.isAdmin) {
        cacheRef.current.set(key, true);
        return true;
      }

      // No roles = no access
      if (!userInfo?.roleIds || userInfo.roleIds.length === 0) {
        cacheRef.current.set(key, false);
        return false;
      }

      try {
        const res = await fetch("/api/permissions/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table, action }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { permitted: boolean };
        cacheRef.current.set(key, data.permitted);
        return data.permitted;
      } catch {
        return false;
      }
    },
    [userInfo]
  );

  return {
    userInfo,
    loading,
    error,
    isAdmin: userInfo?.isAdmin ?? false,
    checkPermission,
    canSelect: tablePerms?.canSelect,
    canInsert: tablePerms?.canInsert,
    canUpdate: tablePerms?.canUpdate,
    canDelete: tablePerms?.canDelete,
    tablePermissions: tablePerms,
  };
}