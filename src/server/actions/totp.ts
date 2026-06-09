"use server";

import { randomInt } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/auth/user-access";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { totpDisableSchema, totpSetupVerifySchema } from "@/lib/validators/auth";
import { sendTwoFactorEmailCode } from "@/lib/email";

const emailCodeStore = new Map<string, { hash: string; expiresAt: number }>();

export async function getTwoFactorStatus() {
  const session = await requireAuth();
  const [user] = await db
    .select({
      totpEnabled: users.totpEnabled,
      status: users.status,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) throw new Error("User not found");

  return {
    required: !isAdminUser({
      role: user.role,
      status: user.status,
      totpEnabled: user.totpEnabled,
    }),
    enabled: user.totpEnabled,
  };
}

export async function beginTotpSetup() {
  const session = await requireAuth();
  const [user] = await db
    .select({ email: users.email, totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) throw new Error("User not found");
  if (user.totpEnabled) throw new Error("2FA is already enabled");

  const { secret, uri } = generateTotpSecret(user.email);
  const qrDataUrl = await QRCode.toDataURL(uri);

  await db
    .update(users)
    .set({
      totpSecret: encryptTotpSecret(secret),
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  return { qrDataUrl, manualKey: secret };
}

export async function confirmTotpSetup(input: unknown) {
  const session = await requireAuth();
  const data = totpSetupVerifySchema.parse(input);

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user?.totpSecret) throw new Error("Start 2FA setup first");

  const secret = decryptTotpSecret(user.totpSecret);
  if (!verifyTotpCode(secret, data.code)) {
    throw new Error("Invalid verification code");
  }

  const backupCodes = generateBackupCodes();
  const hashedCodes = await hashBackupCodes(backupCodes);

  await db
    .update(users)
    .set({
      totpEnabled: true,
      totpBackupCodes: hashedCodes,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  return { backupCodes };
}

export async function disableTotp(input: unknown) {
  const session = await requireAuth();
  const data = totpDisableSchema.parse(input);

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) throw new Error("User not found");

  if (
    !isAdminUser({
      role: user.role,
      status: user.status,
      totpEnabled: user.totpEnabled,
    })
  ) {
    throw new Error("2FA is mandatory for your account");
  }

  const validPassword = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!validPassword) throw new Error("Invalid password");

  if (user.totpEnabled && user.totpSecret) {
    const secret = decryptTotpSecret(user.totpSecret);
    if (!verifyTotpCode(secret, data.code)) {
      throw new Error("Invalid verification code");
    }
  }

  await db
    .update(users)
    .set({
      totpEnabled: false,
      totpSecret: null,
      totpBackupCodes: [],
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  return { success: true };
}

export async function sendEmailVerificationCode(currentPassword: string) {
  const session = await requireAuth();
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) throw new Error("User not found");

  const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!validPassword) throw new Error("Invalid password");

  const code = String(randomInt(100000, 999999));
  emailCodeStore.set(user.id, {
    hash: await bcrypt.hash(code, 10),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  await sendTwoFactorEmailCode({
    to: user.email,
    name: user.name,
    code,
  });

  return { sent: true };
}

export async function verifyEmailCodeForLogin(userId: string, code: string) {
  const entry = emailCodeStore.get(userId);
  if (!entry || entry.expiresAt < Date.now()) return false;
  const ok = await bcrypt.compare(code, entry.hash);
  if (ok) emailCodeStore.delete(userId);
  return ok;
}
