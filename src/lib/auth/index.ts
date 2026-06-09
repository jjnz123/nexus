import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { loginSchema } from "@/lib/validators/auth";
import {
  decryptTotpSecret,
  requiresTotpAtLogin,
  verifyBackupCode,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { isRestrictedToSettings } from "@/lib/auth/user-access";
import { sendPendingUserLoginAlert } from "@/lib/email";
import { getAppUrlFromEnv } from "@/lib/url";
import { authConfig } from "./auth.config";

async function notifyAdminsOfPendingFirstLogin(user: {
  name: string;
  email: string;
}) {
  const admins = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.role, "admin"));

  const authUrl = getAppUrlFromEnv();
  await sendPendingUserLoginAlert({
    adminEmails: admins.map((a) => a.email),
    userName: user.name,
    userEmail: user.email,
    adminUrl: `${authUrl}/admin`,
  });
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "TOTP Code", type: "text" },
        backupCode: { label: "Backup Code", type: "text" },
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email.toLowerCase()))
          .limit(1);

        if (!user || user.disabled) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        if (requiresTotpAtLogin(user)) {
          const totpCode = parsed.data.totpCode?.trim();
          const backupCode = parsed.data.backupCode?.trim();
          let verified = false;

          if (totpCode && user.totpSecret) {
            try {
              const secret = decryptTotpSecret(user.totpSecret);
              verified = verifyTotpCode(secret, totpCode);
            } catch {
              verified = false;
            }
          }

          if (!verified && backupCode) {
            const hashed = user.totpBackupCodes ?? [];
            const index = await verifyBackupCode(backupCode, hashed);
            if (index !== null) {
              verified = true;
              const nextCodes = [...hashed];
              nextCodes.splice(index, 1);
              await db
                .update(users)
                .set({ totpBackupCodes: nextCodes, updatedAt: new Date() })
                .where(eq(users.id, user.id));
            }
          }

          if (!verified) return null;
        }

        if (user.status === "pending" && !user.firstLoginAt) {
          await db
            .update(users)
            .set({ firstLoginAt: new Date(), updatedAt: new Date() })
            .where(eq(users.id, user.id));
          void notifyAdminsOfPendingFirstLogin(user);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          totpEnabled: user.totpEnabled,
          avatarPath: user.avatarPath,
          permissions: user.permissions ?? null,
        };
      },
    }),
  ],
});

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireActiveMember() {
  const session = await requireAuth();
  if (
    isRestrictedToSettings({
      role: session.user.role,
      status: session.user.status,
      totpEnabled: session.user.totpEnabled,
      permissions: session.user.permissions,
    })
  ) {
    throw new Error("Account setup incomplete");
  }
  return session;
}
