// RoleManager — CRUD roles + assign users
// Admin panel for managing RBAC roles and user-to-role assignments.
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Users,
  X,
  Search,
  Check,
  AlertTriangle,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  UserMinus,
  Loader2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface Role {
  id: number;
  name: string;
  caption: string;
  is_system: boolean;
  created_at: string;
  user_count: number;
}

interface UserAssignment {
  user_id: number;
  employee_name: string;
  email: string;
  assigned_at: string;
}

interface Employee {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
}

// ─── Helper ─────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Role Manager ───────────────────────────────────────

export default function RoleManager() {
  const { isAdmin, loading: permLoading } = usePermissions();

  // ── State ────────────────────────────────────────────
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Selected role for editing/user assignment
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  // Create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [formName, setFormName] = useState("");
  const [formCaption, setFormCaption] = useState("");
  const [copyFromId, setCopyFromId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  // User assignment section
  const [assignedUsers, setAssignedUsers] = useState<UserAssignment[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // User picker dialog
  const [pickerOpen, setPickerOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [empLoading, setEmpLoading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [savingUsers, setSavingUsers] = useState(false);

  // Remove user confirmation
  const [removeTarget, setRemoveTarget] = useState<{ userId: number; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  // ── Data fetching ─────────────────────────────────────

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/roles");
      if (!res.ok) throw new Error(`Failed to load roles: ${res.status}`);
      const data = (await res.json()) as Role[];
      setRoles(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async (roleId: number) => {
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/roles/${roleId}/users`);
      if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
      const data = (await res.json()) as UserAssignment[];
      setAssignedUsers(data);
    } catch {
      setAssignedUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async (searchTerm: string) => {
    setEmpLoading(true);
    try {
      const params = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : "";
      const res = await fetch(`/api/employees${params}`);
      if (!res.ok) throw new Error("Failed to load employees");
      const data = (await res.json()) as Employee[];
      setEmployees(data);
    } catch {
      setEmployees([]);
    } finally {
      setEmpLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // When selecting a role, load its users
  useEffect(() => {
    if (selectedRole) {
      fetchUsers(selectedRole.id);
    } else {
      setAssignedUsers([]);
    }
  }, [selectedRole, fetchUsers]);

  // Debounced employee search
  useEffect(() => {
    if (!pickerOpen) return;
    const timer = setTimeout(() => {
      fetchEmployees(empSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [empSearch, pickerOpen, fetchEmployees]);

  // ── Filtered roles ────────────────────────────────────

  const filteredRoles = useMemo(() => {
    if (!search.trim()) return roles;
    const q = search.toLowerCase();
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.caption.toLowerCase().includes(q)
    );
  }, [roles, search]);

  // ── Open create dialog ────────────────────────────────

  const openCreate = useCallback(() => {
    setEditRole(null);
    setFormName("");
    setFormCaption("");
    setCopyFromId("");
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((role: Role) => {
    setEditRole(role);
    setFormName(role.name);
    setFormCaption(role.caption);
    setCopyFromId("");
    setFormError(null);
    setDialogOpen(true);
  }, []);

  // ── Save role (create or update) ─────────────────────

  const handleSave = useCallback(async () => {
    setFormError(null);
    if (!formName.trim()) {
      setFormError("Role name is required");
      return;
    }

    setSaving(true);
    try {
      if (editRole) {
        // Update
        const body: Record<string, string> = {};
        if (formName.trim() !== editRole.name && !editRole.is_system) {
          body.name = formName.trim();
        }
        if (formCaption !== editRole.caption) {
          body.caption = formCaption;
        }
        if (Object.keys(body).length === 0) {
          setDialogOpen(false);
          return;
        }
        const res = await fetch(`/api/roles/${editRole.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error: string };
          setFormError(err.error);
          return;
        }
      } else {
        // Create
        const body: Record<string, string> = { name: formName.trim() };
        if (formCaption) body.caption = formCaption;
        if (copyFromId) body.copy_from_role_id = copyFromId;
        const res = await fetch("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error: string };
          setFormError(err.error);
          return;
        }
      }
      setDialogOpen(false);
      await fetchRoles();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [editRole, formName, formCaption, copyFromId, fetchRoles]);

  // ── Delete role ───────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/roles/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        setError(err.error);
        return;
      }
      setDeleteTarget(null);
      if (selectedRole?.id === deleteTarget.id) {
        setSelectedRole(null);
      }
      await fetchRoles();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedRole, fetchRoles]);

  // ── Assign users ─────────────────────────────────────

  const openPicker = useCallback(async () => {
    setEmpSearch("");
    setSelectedUserIds(new Set(assignedUsers.map((u) => u.user_id)));
    setPickerOpen(true);
    // Initial fetch
    await fetchEmployees("");
  }, [assignedUsers, fetchEmployees]);

  const toggleUserSelection = useCallback((userId: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const handleAssignUsers = useCallback(async () => {
    if (!selectedRole) return;
    setSavingUsers(true);
    try {
      const res = await fetch(`/api/roles/${selectedRole.id}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: [...selectedUserIds] }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        setError(err.error);
        return;
      }
      setPickerOpen(false);
      await fetchUsers(selectedRole.id);
      await fetchRoles(); // Refresh user_count
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingUsers(false);
    }
  }, [selectedRole, selectedUserIds, fetchUsers, fetchRoles]);

  // ── Remove user from role ────────────────────────────

  const handleRemoveUser = useCallback(async () => {
    if (!removeTarget || !selectedRole) return;
    setRemoving(true);
    try {
      const currentIds = assignedUsers
        .filter((u) => u.user_id !== removeTarget.userId)
        .map((u) => u.user_id);
      const res = await fetch(`/api/roles/${selectedRole.id}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: currentIds }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        setError(err.error);
        return;
      }
      setRemoveTarget(null);
      await fetchUsers(selectedRole.id);
      await fetchRoles();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRemoving(false);
    }
  }, [removeTarget, selectedRole, assignedUsers, fetchUsers, fetchRoles]);

  // ── Guard: only admins ────────────────────────────────

  if (permLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm">Loading permissions...</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <ShieldOff className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm">Access denied</p>
          <p className="text-xs text-muted-foreground/60">
            Only administrators can manage roles.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* ── Role list panel ──────────────────────────── */}
      <div className="w-96 border-r flex flex-col shrink-0">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Shield className="h-4 w-4" />
          <span className="text-sm font-semibold">Roles</span>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search roles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-7 text-xs"
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="px-3 py-2 border-b flex items-center gap-2">
          <Button size="sm" onClick={openCreate} className="text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Role
          </Button>
        </div>

        {/* Role list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : error ? (
            <div className="p-4 text-xs text-destructive">{error}</div>
          ) : filteredRoles.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">
              {search ? "No roles match your search." : "No roles found."}
            </div>
          ) : (
            filteredRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role)}
                className={`w-full text-left px-4 py-2.5 border-b border-muted/30 hover:bg-muted/20 transition-colors ${
                  selectedRole?.id === role.id ? "bg-muted/30 border-l-2 border-l-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {role.caption}
                    </span>
                    {role.is_system && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 font-medium shrink-0">
                        system
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(role);
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Edit role"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {!role.is_system && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(role);
                        }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                        title="Delete role"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {role.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Users className="h-2.5 w-2.5" />
                    {role.user_count}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── User assignment panel ────────────────────── */}
      <div className="flex-1 flex flex-col">
        {!selectedRole ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center space-y-2">
              <Shield className="h-8 w-8 mx-auto text-muted-foreground/20" />
              <p className="text-sm">Select a role to manage users</p>
              <p className="text-xs text-muted-foreground/60">
                Click a role from the list to view and assign users.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-sm font-semibold">{selectedRole.caption}</span>
                {selectedRole.is_system && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
                    system
                  </span>
                )}
                <span className="text-xs text-muted-foreground">({selectedRole.name})</span>
              </div>
              <Button size="sm" variant="outline" onClick={openPicker} className="text-xs">
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                Assign Users
              </Button>
            </div>

            {/* User list */}
            <div className="flex-1 overflow-y-auto">
              {usersLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-xs">Loading users...</span>
                </div>
              ) : assignedUsers.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center space-y-2">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground/20" />
                    <p className="text-sm">No users assigned</p>
                    <p className="text-xs text-muted-foreground/60">
                      Click "Assign Users" to add users to this role.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-muted/30">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-4 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/20">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Assigned</span>
                  </div>
                  {assignedUsers.map((user) => (
                    <div
                      key={user.user_id}
                      className="grid grid-cols-[1fr_1fr_auto] gap-2 px-4 py-2 text-xs items-center hover:bg-muted/10"
                    >
                      <span className="truncate">{user.employee_name}</span>
                      <span className="truncate text-muted-foreground">
                        {user.email || "\u2014"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {formatDate(user.assigned_at)}
                        </span>
                        <button
                          onClick={() =>
                            setRemoveTarget({
                              userId: user.user_id,
                              name: user.employee_name,
                            })
                          }
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                          title="Remove user from role"
                        >
                          <UserMinus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Create/Edit Dialog ───────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editRole ? "Edit Role" : "Create Role"}</DialogTitle>
            <DialogDescription>
              {editRole
                ? "Update the role name or display caption."
                : "Create a new role and optionally copy permissions from an existing role."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Name */}
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., inventory-manager"
                className="text-xs"
                disabled={editRole?.is_system ?? false}
              />
              {editRole?.is_system && (
                <p className="text-[10px] text-muted-foreground">
                  System role names cannot be changed.
                </p>
              )}
            </div>

            {/* Caption */}
            <div className="space-y-1">
              <Label className="text-xs">Display Caption</Label>
              <Input
                value={formCaption}
                onChange={(e) => setFormCaption(e.target.value)}
                placeholder="e.g., Inventory Manager"
                className="text-xs"
              />
            </div>

            {/* Copy from (only on create) */}
            {!editRole && (
              <div className="space-y-1">
                <Label className="text-xs">Copy Permissions From (optional)</Label>
                <select
                  value={copyFromId}
                  onChange={(e) => setCopyFromId(e.target.value)}
                  className="h-8 w-full text-xs border rounded-lg px-2.5 bg-background"
                >
                  <option value="">Do not copy</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.caption} ({r.name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Error */}
            {formError && (
              <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {editRole ? "Save Changes" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget?.caption}</strong>? This will also remove all
              permission assignments and user assignments for this role.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Delete Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove user confirmation ─────────────────── */}
      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove User</DialogTitle>
            <DialogDescription>
              Remove <strong>{removeTarget?.name}</strong> from{" "}
              <strong>{selectedRole?.caption}</strong>?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRemoveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemoveUser}
              disabled={removing}
            >
              {removing && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User Picker Dialog ───────────────────────── */}
      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) setPickerOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Assign Users</DialogTitle>
            <DialogDescription>
              Select users to assign to <strong>{selectedRole?.caption}</strong>.
              Currently assigned users are pre-selected.
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Employee list */}
          <div className="flex-1 overflow-y-auto border rounded-lg mt-2 min-h-[200px]">
            {empLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-xs">Loading employees...</span>
              </div>
            ) : employees.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                No employees found.
              </div>
            ) : (
              <div className="divide-y divide-muted/30">
                {employees.map((emp) => {
                  const isSelected = selectedUserIds.has(emp.id);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => toggleUserSelection(emp.id)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/20 transition-colors text-xs ${
                        isSelected ? "bg-primary/5" : ""
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">
                          {emp.firstname} {emp.lastname}
                        </span>
                        {emp.email && (
                          <span className="ml-2 text-muted-foreground">
                            {emp.email}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {selectedUserIds.size} user{selectedUserIds.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPickerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAssignUsers}
                disabled={savingUsers}
              >
                {savingUsers && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                )}
                Save Assignments
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Error banner ─────────────────────────────── */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground text-xs rounded-lg px-4 py-3 shadow-lg flex items-center gap-2 max-w-sm z-50">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="p-0.5 rounded hover:bg-destructive/20"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
