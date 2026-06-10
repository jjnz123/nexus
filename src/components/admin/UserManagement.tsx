"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { createUser, updateUser } from "@/server/actions/users";
import type { UserRole, UserStatus } from "@/lib/db/schema";
import {
  getDefaultPermissionsForRole,
  getLockedDownPermissions,
  type UserPermissionOverrides,
} from "@/lib/permissions";
import { UserProjectAccessPanel } from "@/components/admin/UserProjectAccessPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  disabled: boolean;
  avatarPath: string | null;
  permissions: UserPermissionOverrides | null;
  createdAt: Date;
};

type UserFormState = {
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  disabled: boolean;
  password: string;
  sendWelcomeEmail: boolean;
  permissions: UserPermissionOverrides;
};

const roleOptions: UserRole[] = ["admin", "editor", "user", "viewer"];

const permissionFields: {
  key: keyof UserPermissionOverrides;
  label: string;
  description: string;
}[] = [
  { key: "ai", label: "AI Chat", description: "Use AI Chat workspace and home AI search" },
  { key: "notesView", label: "View notes", description: "Open Notes workspace" },
  { key: "notesEdit", label: "Edit notes", description: "Create and edit notes" },
  { key: "meetingsView", label: "View meetings", description: "Open Meeting Assistant" },
  { key: "meetingsEdit", label: "Edit meetings", description: "Create and manage meetings" },
  { key: "bookmarksView", label: "View bookmarks", description: "See bookmarks page and home favourites" },
  { key: "bookmarksEdit", label: "Edit bookmarks", description: "Create, import, export, and bulk edit" },
  { key: "tasksView", label: "View tasks", description: "See tasks and home overdue widget" },
  { key: "tasksEdit", label: "Edit tasks", description: "Create and update tasks" },
  { key: "monitoringView", label: "View monitoring", description: "See monitoring and home status widget" },
  {
    key: "monitoringConfigure",
    label: "Configure monitoring",
    description: "Add or edit monitors and alerts",
  },
];

const statusOptions: UserStatus[] = ["pending", "member", "administrator"];

function statusBadgeVariant(status: UserStatus) {
  if (status === "administrator") return "destructive" as const;
  if (status === "pending") return "outline" as const;
  return "secondary" as const;
}

function roleBadge(role: UserRole) {
  if (role === "admin") return "destructive";
  if (role === "editor") return "default";
  return "secondary";
}

function resolvePermissions(
  role: UserRole,
  stored?: UserPermissionOverrides | null
): UserPermissionOverrides {
  if (stored?.useCustom) {
    return {
      useCustom: true,
      ai: stored.ai ?? false,
      notesView: stored.notesView ?? false,
      notesEdit: stored.notesEdit ?? false,
      meetingsView: stored.meetingsView ?? false,
      meetingsEdit: stored.meetingsEdit ?? false,
      bookmarksView: stored.bookmarksView ?? false,
      bookmarksEdit: stored.bookmarksEdit ?? false,
      tasksView: stored.tasksView ?? false,
      tasksEdit: stored.tasksEdit ?? false,
      monitoringView: stored.monitoringView ?? false,
      monitoringConfigure: stored.monitoringConfigure ?? false,
    };
  }
  return getDefaultPermissionsForRole(role);
}

function initialState(user?: UserRow): UserFormState {
  const role = user?.role ?? "user";
  return {
    email: user?.email ?? "",
    name: user?.name ?? "",
    role,
    status: user?.status ?? "pending",
    disabled: user?.disabled ?? false,
    password: "",
    sendWelcomeEmail: true,
    permissions: user
      ? resolvePermissions(role, user.permissions)
      : getLockedDownPermissions(),
  };
}

export function UserManagement({ users }: { users: UserRow[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [state, setState] = useState<UserFormState>(initialState());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const title = useMemo(() => (editing ? "Edit user" : "Create user"), [editing]);

  const closeAndReset = () => {
    setOpen(false);
    setEditing(null);
    setState(initialState());
  };

  const openCreate = () => {
    setEditing(null);
    setState(initialState());
    setOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditing(user);
    setState(initialState(user));
    setOpen(true);
  };

  const setRole = (role: UserRole) => {
    setState((prev) => ({
      ...prev,
      role,
      permissions: prev.permissions.useCustom
        ? prev.permissions
        : getDefaultPermissionsForRole(role),
    }));
  };

  const setUseCustomPermissions = (useCustom: boolean) => {
    setState((prev) => ({
      ...prev,
      permissions: useCustom
        ? { ...getLockedDownPermissions(), ...prev.permissions, useCustom: true }
        : getDefaultPermissionsForRole(prev.role),
    }));
  };

  const setPermission = (key: keyof UserPermissionOverrides, value: boolean) => {
    setState((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: value },
    }));
  };

  const onSubmit = () => {
    if (!state.email.trim() || !state.name.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!editing && state.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    const permissions = state.permissions.useCustom
      ? state.permissions
      : { useCustom: false };

    startTransition(async () => {
      try {
        if (editing) {
          await updateUser({
            id: editing.id,
            email: state.email.trim(),
            name: state.name.trim(),
            role: state.role,
            status: state.status,
            disabled: state.disabled,
            permissions,
            ...(state.password ? { password: state.password } : {}),
          });
          toast.success("User updated");
        } else {
          await createUser({
            email: state.email.trim(),
            name: state.name.trim(),
            role: state.role,
            password: state.password,
            permissions,
            sendWelcomeEmail: state.sendWelcomeEmail,
          });
          toast.success("User created");
        }
        closeAndReset();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save user");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Users</h2>
          <p className="text-sm text-muted-foreground">
            Manage accounts, roles, and per-user feature access.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closeAndReset())}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Update user details, role, and optional custom permissions."
                  : "Create a new user account."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user-name">Name</Label>
                <Input
                  id="user-name"
                  value={state.name}
                  onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={state.email}
                  onChange={(event) => setState((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={state.role} onValueChange={(value: UserRole) => setRole(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Role defaults apply unless custom permissions are enabled below.
                </p>
              </div>
              {editing ? (
                <div className="space-y-2">
                  <Label>Account status</Label>
                  <Select
                    value={state.status}
                    onValueChange={(value: UserStatus) =>
                      setState((prev) => ({
                        ...prev,
                        status: value,
                        role: value === "administrator" ? "admin" : prev.role,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                  New users are created as <strong>pending</strong> until elevated by an
                  administrator.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="user-password">
                  {editing ? "New Password (optional)" : "Password"}
                </Label>
                <Input
                  id="user-password"
                  type="password"
                  value={state.password}
                  onChange={(event) => setState((prev) => ({ ...prev, password: event.target.value }))}
                />
              </div>
              {!editing && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Send welcome email</p>
                    <p className="text-xs text-muted-foreground">
                      Email login details via SMTP2go when configured
                    </p>
                  </div>
                  <Switch
                    checked={state.sendWelcomeEmail}
                    onCheckedChange={(checked) =>
                      setState((prev) => ({ ...prev, sendWelcomeEmail: checked }))
                    }
                  />
                </div>
              )}
              {editing && (
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Disabled</p>
                    <p className="text-xs text-muted-foreground">Disable user sign in</p>
                  </div>
                  <Switch
                    checked={state.disabled}
                    onCheckedChange={(checked) => setState((prev) => ({ ...prev, disabled: checked }))}
                  />
                </div>
              )}

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Custom permissions</p>
                    <p className="text-xs text-muted-foreground">
                      Override role defaults for this user only.
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(state.permissions.useCustom)}
                    onCheckedChange={setUseCustomPermissions}
                  />
                </div>

                {state.permissions.useCustom && (
                  <div className="space-y-2 border-t pt-3">
                    {permissionFields.map((field) => (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{field.label}</p>
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        </div>
                        <Switch
                          checked={Boolean(state.permissions[field.key])}
                          onCheckedChange={(checked) => setPermission(field.key, checked)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editing ? (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Project sharing</p>
                  <UserProjectAccessPanel userId={editing.id} enabled={Boolean(editing.id)} />
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button onClick={onSubmit} disabled={isPending}>
                  {isPending ? "Saving..." : editing ? "Save Changes" : "Create User"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User accounts</CardTitle>
          <CardDescription>{users.length} user accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Access</th>
                  <th className="py-2 pr-3 font-medium">Login</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b">
                    <td className="py-3 pr-3">{user.name}</td>
                    <td className="py-3 pr-3">{user.email}</td>
                    <td className="py-3 pr-3">
                      <Badge variant={roleBadge(user.role)}>{user.role}</Badge>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge variant={statusBadgeVariant(user.status)}>{user.status}</Badge>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge variant={user.permissions?.useCustom ? "default" : "outline"}>
                        {user.permissions?.useCustom ? "Custom" : "Role default"}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge variant={user.disabled ? "destructive" : "secondary"}>
                        {user.disabled ? "Disabled" : "Active"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
