"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hasTwoFactorEnabled, isTwoFactorRequired } from "@/lib/auth/totp";
import { isAdminUser } from "@/lib/auth/user-access";

export async function checkLoginRequirements(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user || user.disabled) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const requiresTwoFactor = hasTwoFactorEnabled(user);

  const requiresSetup =
    isTwoFactorRequired({
      role: user.role,
      status: user.status,
      totpEnabled: user.totpEnabled,
      email2faEnabled: user.email2faEnabled,
    }) && !hasTwoFactorEnabled(user);

  return {
    ok: true as const,
    requiresTwoFactor,
    twoFactorMethod: user.totpEnabled
      ? ("totp" as const)
      : user.email2faEnabled
        ? ("email" as const)
        : null,
    requiresTotp: user.totpEnabled,
    requiresEmail2fa: user.email2faEnabled,
    requiresSetup,
    isPending: user.status === "pending",
    isAdmin: isAdminUser({
      role: user.role,
      status: user.status,
      totpEnabled: user.totpEnabled,
      email2faEnabled: user.email2faEnabled,
    }),
  };
}
