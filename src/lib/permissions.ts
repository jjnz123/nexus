import type { UserRole } from "@/lib/db/schema";
import { isRestrictedToSettings, type SessionUserContext } from "@/lib/auth/user-access";

export type UserPermissionOverrides = {
  useCustom?: boolean;
  ai?: boolean;
  bookmarksView?: boolean;
  bookmarksEdit?: boolean;
  tasksView?: boolean;
  tasksEdit?: boolean;
  monitoringView?: boolean;
  monitoringConfigure?: boolean;
};

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

const permissionOverrideKey: Partial<
  Record<Permission, keyof UserPermissionOverrides>
> = {
  "ai:use": "ai",
  "bookmarks:view": "bookmarksView",
  "bookmarks:edit": "bookmarksEdit",
  "tasks:view": "tasksView",
  "tasks:edit": "tasksEdit",
  "monitoring:view": "monitoringView",
  "monitoring:configure": "monitoringConfigure",
};

function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

function customHasPermission(
  overrides: UserPermissionOverrides,
  permission: Permission
): boolean {
  const key = permissionOverrideKey[permission];
  if (!key) return false;
  return Boolean(overrides[key]);
}

export function hasPermission(
  role: UserRole,
  permission: Permission,
  overrides?: UserPermissionOverrides | null
): boolean {
  if (permission === "admin:access" || permission === "users:manage") {
    return roleHasPermission(role, permission);
  }

  if (overrides?.useCustom) {
    return customHasPermission(overrides, permission);
  }

  return roleHasPermission(role, permission);
}

export function requirePermission(
  role: UserRole,
  permission: Permission,
  overrides?: UserPermissionOverrides | null
): void {
  if (!hasPermission(role, permission, overrides)) {
    throw new Error("Forbidden");
  }
}

export function requireSessionPermission(
  session: {
    user: { role: UserRole; permissions?: UserPermissionOverrides | null };
  },
  permission: Permission
): void {
  requirePermission(session.user.role, permission, session.user.permissions);
}

export function canAccessRoute(
  role: UserRole,
  path: string,
  overrides?: UserPermissionOverrides | null,
  context?: Pick<SessionUserContext, "status" | "totpEnabled">
): boolean {
  if (context && isRestrictedToSettings({ role, ...context, permissions: overrides })) {
    return path.startsWith("/settings");
  }

  if (path.startsWith("/admin")) return hasPermission(role, "admin:access", overrides);
  if (path.startsWith("/bookmarks"))
    return hasPermission(role, "bookmarks:view", overrides);
  if (path.startsWith("/tasks")) return hasPermission(role, "tasks:view", overrides);
  if (path.startsWith("/monitoring"))
    return hasPermission(role, "monitoring:view", overrides);
  if (path.startsWith("/chat")) return hasPermission(role, "ai:use", overrides);
  if (path.startsWith("/meetings")) return hasPermission(role, "ai:use", overrides);
  if (path.startsWith("/settings")) return true;
  if (path === "/" && context && isRestrictedToSettings({ role, ...context, permissions: overrides })) {
    return false;
  }
  return true;
}

export function getDefaultPermissionsForRole(
  role: UserRole
): UserPermissionOverrides {
  return {
    useCustom: false,
    ai: roleHasPermission(role, "ai:use"),
    bookmarksView: roleHasPermission(role, "bookmarks:view"),
    bookmarksEdit: roleHasPermission(role, "bookmarks:edit"),
    tasksView: roleHasPermission(role, "tasks:view"),
    tasksEdit: roleHasPermission(role, "tasks:edit"),
    monitoringView: roleHasPermission(role, "monitoring:view"),
    monitoringConfigure: roleHasPermission(role, "monitoring:configure"),
  };
}

export function getEffectivePermissions(
  role: UserRole,
  overrides?: UserPermissionOverrides | null
): UserPermissionOverrides {
  const defaults = getDefaultPermissionsForRole(role);
  if (!overrides?.useCustom) return defaults;
  return {
    useCustom: true,
    ai: overrides.ai ?? false,
    bookmarksView: overrides.bookmarksView ?? false,
    bookmarksEdit: overrides.bookmarksEdit ?? false,
    tasksView: overrides.tasksView ?? false,
    tasksEdit: overrides.tasksEdit ?? false,
    monitoringView: overrides.monitoringView ?? false,
    monitoringConfigure: overrides.monitoringConfigure ?? false,
  };
}
