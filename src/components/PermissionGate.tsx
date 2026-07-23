// PermissionGate — conditional render based on user permissions
// Wraps children and only renders them when the current user has the
// specified permission on the given table. Shows an optional fallback
// when permission is denied or while loading.
import { type ReactNode } from "react";
import { usePermissions, type PermissionAction } from "@/hooks/usePermissions";

export interface PermissionGateProps {
  /** The table name to check permission on */
  table: string;
  /** The action to check (select, insert, update, delete) */
  action: PermissionAction;
  /** Content rendered when the user has permission */
  children: ReactNode;
  /** Optional content rendered when permission is denied.
   *  Omit or pass null to render nothing on denial. */
  fallback?: ReactNode;
  /** Content rendered while the permission check is loading.
   *  Defaults to the fallback, or nothing if no fallback provided. */
  loadingFallback?: ReactNode;
}

/**
 * Conditionally renders children based on whether the current user has
 * a specific permission on a table.
 *
 * @example
 * ```tsx
 * <PermissionGate table="orders" action="insert">
 *   <button>New Order</button>
 * </PermissionGate>
 *
 * <PermissionGate table="orders" action="delete" fallback={<span>No access</span>}>
 *   <button>Delete</button>
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
  table,
  action,
  children,
  fallback = null,
  loadingFallback,
}: PermissionGateProps) {
  const { canSelect, canInsert, canUpdate, canDelete, loading } = usePermissions({ table });

  // Map action to the corresponding boolean
  const permissionMap: Record<PermissionAction, boolean | undefined> = {
    select: canSelect,
    insert: canInsert,
    update: canUpdate,
    delete: canDelete,
  };

  const permitted = permissionMap[action];

  // While loading, show loadingFallback if provided, otherwise fallback
  if (loading) {
    return <>{loadingFallback ?? fallback}</>;
  }

  // If permission is explicitly false, show fallback
  if (permitted === false) {
    return <>{fallback}</>;
  }

  // If permission is true (or undefined — edge case), show children
  return <>{children}</>;
}