import type { UserRole } from "@/lib/db/schema";
import { isRestrictedToSettings, type SessionUserContext } from "@/lib/auth/user-access";

export type UserPermissionOverrides = {
  useCustom?: boolean;
  ai?: boolean;
  notesView?: boolean;
  notesEdit?: boolean;
  meetingsView?: boolean;
  meetingsEdit?: boolean;
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
  | "notes:view"
  | "notes:edit"
  | "meetings:view"
  | "meetings:edit"
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
    "notes:view",
    "notes:edit",
    "meetings:view",
    "meetings:edit",
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
    "notes:view",
    "notes:edit",
    "meetings:view",
    "meetings:edit",
  ],
  user: [
    "bookmarks:edit",
    "bookmarks:view",
    "tasks:edit",
    "tasks:view",
    "monitoring:view",
    "ai:use",
    "notes:view",
    "notes:edit",
    "meetings:view",
    "meetings:edit",
  ],
  viewer: ["bookmarks:view", "tasks:view", "monitoring:view", "notes:view", "meetings:view"],
};

const permissionOverrideKey: Partial<
  Record<Permission, keyof UserPermissionOverrides>
> = {
  "ai:use": "ai",
  "notes:view": "notesView",
  "notes:edit": "notesEdit",
  "meetings:view": "meetingsView",
  "meetings:edit": "meetingsEdit",
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
  context?: Pick<SessionUserContext, "status" | "totpEnabled" | "email2faEnabled">
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
  if (path.startsWith("/meetings")) return hasPermission(role, "meetings:view", overrides);
  if (path.startsWith("/notes")) return hasPermission(role, "notes:view", overrides);
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
    notesView: roleHasPermission(role, "notes:view"),
    notesEdit: roleHasPermission(role, "notes:edit"),
    meetingsView: roleHasPermission(role, "meetings:view"),
    meetingsEdit: roleHasPermission(role, "meetings:edit"),
    bookmarksView: roleHasPermission(role, "bookmarks:view"),
    bookmarksEdit: roleHasPermission(role, "bookmarks:edit"),
    tasksView: roleHasPermission(role, "tasks:view"),
    tasksEdit: roleHasPermission(role, "tasks:edit"),
    monitoringView: roleHasPermission(role, "monitoring:view"),
    monitoringConfigure: roleHasPermission(role, "monitoring:configure"),
  };
}

/** Default for newly created users — no module access until an admin grants it. */
export function getLockedDownPermissions(): UserPermissionOverrides {
  return {
    useCustom: true,
    ai: false,
    notesView: false,
    notesEdit: false,
    meetingsView: false,
    meetingsEdit: false,
    bookmarksView: false,
    bookmarksEdit: false,
    tasksView: false,
    tasksEdit: false,
    monitoringView: false,
    monitoringConfigure: false,
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
    notesView: overrides.notesView ?? false,
    notesEdit: overrides.notesEdit ?? false,
    meetingsView: overrides.meetingsView ?? false,
    meetingsEdit: overrides.meetingsEdit ?? false,
    bookmarksView: overrides.bookmarksView ?? false,
    bookmarksEdit: overrides.bookmarksEdit ?? false,
    tasksView: overrides.tasksView ?? false,
    tasksEdit: overrides.tasksEdit ?? false,
    monitoringView: overrides.monitoringView ?? false,
    monitoringConfigure: overrides.monitoringConfigure ?? false,
  };
}
