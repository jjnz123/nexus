import type { UserRole } from "@/lib/db/schema";

export type Permission =
  | "users:manage"
  | "bookmarks:edit"
  | "bookmarks:view"
  | "tasks:edit"
  | "tasks:view"
  | "monitoring:configure"
  | "monitoring:view"
  | "ai:use"
  | "admin:access";

const rolePermissions: Record<UserRole, Permission[]> = {
  admin: [
    "users:manage",
    "bookmarks:edit",
    "bookmarks:view",
    "tasks:edit",
    "tasks:view",
    "monitoring:configure",
    "monitoring:view",
    "ai:use",
    "admin:access",
  ],
  editor: [
    "bookmarks:edit",
    "bookmarks:view",
    "tasks:edit",
    "tasks:view",
    "monitoring:configure",
    "monitoring:view",
    "ai:use",
  ],
  user: [
    "bookmarks:edit",
    "bookmarks:view",
    "tasks:edit",
    "tasks:view",
    "monitoring:view",
    "ai:use",
  ],
  viewer: ["bookmarks:view", "tasks:view", "monitoring:view"],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function requirePermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error("Forbidden");
  }
}

export function canAccessRoute(role: UserRole, path: string): boolean {
  if (path.startsWith("/admin")) return hasPermission(role, "admin:access");
  if (path.startsWith("/bookmarks"))
    return hasPermission(role, "bookmarks:view");
  if (path.startsWith("/tasks")) return hasPermission(role, "tasks:view");
  if (path.startsWith("/monitoring"))
    return hasPermission(role, "monitoring:view");
  return true;
}
