"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { createUser, updateUser } from "@/server/actions/users";
import type { UserRole } from "@/lib/db/schema";
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
  disabled: boolean;
  avatarPath: string | null;
  createdAt: Date;
};

type UserFormState = {
  email: string;
  name: string;
  role: UserRole;
  disabled: boolean;
  password: string;
};

const roleOptions: UserRole[] = ["admin", "editor", "user", "viewer"];

function roleBadge(role: UserRole) {
  if (role === "admin") return "destructive";
  if (role === "editor") return "default";
  return "secondary";
}

function initialState(user?: UserRow): UserFormState {
  return {
    email: user?.email ?? "",
    name: user?.name ?? "",
    role: user?.role ?? "user",
    disabled: user?.disabled ?? false,
    password: "",
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

  const onSubmit = () => {
    if (!state.email.trim() || !state.name.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!editing && state.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    startTransition(async () => {
      try {
        if (editing) {
          await updateUser({
            id: editing.id,
            email: state.email.trim(),
            name: state.name.trim(),
            role: state.role,
            disabled: state.disabled,
            ...(state.password ? { password: state.password } : {}),
          });
          toast.success("User updated");
        } else {
          await createUser({
            email: state.email.trim(),
            name: state.name.trim(),
            role: state.role,
            password: state.password,
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
          <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Manage users, roles, and account access.</p>
        </div>
        <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closeAndReset())}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {editing ? "Update user details and access role." : "Create a new user account."}
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
                <Select
                  value={state.role}
                  onValueChange={(value: UserRole) => setState((prev) => ({ ...prev, role: value }))}
                >
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
              </div>
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
          <CardTitle>User Management</CardTitle>
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
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
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
