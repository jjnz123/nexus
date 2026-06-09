import type { UserRole, UserStatus } from "@/lib/db/schema";
import type { UserPermissionOverrides } from "@/lib/permissions";

export type UserPermissionsSchema = UserPermissionOverrides;

export type SessionUserContext = {
  role: UserRole;
  status: UserStatus;
  totpEnabled: boolean;
  permissions?: UserPermissionOverrides | null;
};

export function isAdminUser(ctx: SessionUserContext): boolean {
  return ctx.role === "admin" || ctx.status === "administrator";
}

export function isPendingUser(ctx: SessionUserContext): boolean {
  return ctx.status === "pending";
}

export function mustSetupTwoFactor(ctx: SessionUserContext): boolean {
  if (isAdminUser(ctx)) return false;
  return !ctx.totpEnabled;
}

export function isRestrictedToSettings(ctx: SessionUserContext): boolean {
  return isPendingUser(ctx) || mustSetupTwoFactor(ctx);
}
