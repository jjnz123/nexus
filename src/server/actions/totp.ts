"use server";

import { randomInt } from "crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { maskEmail, storeEmailCode, verifyEmailCode } from "@/lib/auth/email-codes";
import { isAdminUser } from "@/lib/auth/user-access";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  hasTwoFactorEnabled,
  hashBackupCodes,
  verifyTotpCode,
} from "@/lib/auth/totp";
import {
  email2faConfirmSchema,
  email2faDisableSchema,
  sendEmailTotpSchema,
  totpDisableSchema,
  totpSetupVerifySchema,
} from "@/lib/validators/auth";
import { isEmailConfigured, sendTwoFactorEmailCode } from "@/lib/email";

async function issueEmailCode(user: { id: string; email: string; name: string }, purpose: "setup" | "login" | "disable") {
  if (!isEmailConfigured()) {
    throw new Error("Email is not configured. Set SMTP2GO_API_KEY and SMTP2GO_SENDER_EMAIL.");
  }

  const code = String(randomInt(100000, 999999));
  await storeEmailCode(user.id, code, purpose);
  await sendTwoFactorEmailCode({
    to: user.email,
    name: user.name,
    code,
  });
}

export async function getTwoFactorStatus() {
  const session = await requireAuth();
  const [user] = await db
    .select({
      totpEnabled: users.totpEnabled,
      email2faEnabled: users.email2faEnabled,
      status: users.status,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) throw new Error("User not found");

  const ctx = {
    role: user.role,
    status: user.status,
    totpEnabled: user.totpEnabled,
    email2faEnabled: user.email2faEnabled,
  };

  return {
    required: !isAdminUser(ctx),
    totpEnabled: user.totpEnabled,
    email2faEnabled: user.email2faEnabled,
    enabled: hasTwoFactorEnabled(user),
    method: user.totpEnabled ? ("totp" as const) : user.email2faEnabled ? ("email" as const) : null,
    emailConfigured: isEmailConfigured(),
  };
}

export async function beginTotpSetup() {
  const session = await requireAuth();
  const [user] = await db
    .select({
      email: users.email,
      totpEnabled: users.totpEnabled,
      email2faEnabled: users.email2faEnabled,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) throw new Error("User not found");
  if (user.totpEnabled) throw new Error("Authenticator 2FA is already enabled");
  if (user.email2faEnabled) throw new Error("Disable email 2FA before setting up an authenticator");

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
      email2faEnabled: false,
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
      email2faEnabled: user.email2faEnabled,
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

export async function sendEmail2faSetupCode(input: unknown) {
  const session = await requireAuth();
  const data = sendEmailTotpSchema.parse(input);

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) throw new Error("User not found");
  if (user.email2faEnabled) throw new Error("Email 2FA is already enabled");
  if (user.totpEnabled) throw new Error("Disable authenticator 2FA before enabling email codes");

  const validPassword = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!validPassword) throw new Error("Invalid password");

  await issueEmailCode(user, "setup");
  return { sent: true, maskedEmail: maskEmail(user.email) };
}

export async function confirmEmail2faSetup(input: unknown) {
  const session = await requireAuth();
  const data = email2faConfirmSchema.parse(input);

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) throw new Error("User not found");
  if (user.email2faEnabled) throw new Error("Email 2FA is already enabled");

  const ok = await verifyEmailCode(user.id, data.code, "setup");
  if (!ok) throw new Error("Invalid or expired verification code");

  await db
    .update(users)
    .set({
      email2faEnabled: true,
      totpEnabled: false,
      totpSecret: null,
      totpBackupCodes: [],
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  return { success: true };
}

export async function sendEmail2faDisableCode(input: unknown) {
  const session = await requireAuth();
  const data = sendEmailTotpSchema.parse(input);

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) throw new Error("User not found");
  if (!user.email2faEnabled) throw new Error("Email 2FA is not enabled");

  if (
    !isAdminUser({
      role: user.role,
      status: user.status,
      totpEnabled: user.totpEnabled,
      email2faEnabled: user.email2faEnabled,
    })
  ) {
    throw new Error("2FA is mandatory for your account");
  }

  const validPassword = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!validPassword) throw new Error("Invalid password");

  await issueEmailCode(user, "disable");
  return { sent: true, maskedEmail: maskEmail(user.email) };
}

export async function disableEmail2fa(input: unknown) {
  const session = await requireAuth();
  const data = email2faDisableSchema.parse(input);

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) throw new Error("User not found");
  if (!user.email2faEnabled) throw new Error("Email 2FA is not enabled");

  if (
    !isAdminUser({
      role: user.role,
      status: user.status,
      totpEnabled: user.totpEnabled,
      email2faEnabled: user.email2faEnabled,
    })
  ) {
    throw new Error("2FA is mandatory for your account");
  }

  const validPassword = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!validPassword) throw new Error("Invalid password");

  const ok = await verifyEmailCode(user.id, data.code, "disable");
  if (!ok) throw new Error("Invalid or expired verification code");

  await db
    .update(users)
    .set({
      email2faEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  return { success: true };
}

export async function sendLoginEmailCode(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user || user.disabled) throw new Error("Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid email or password");

  if (!user.email2faEnabled) throw new Error("Email 2FA is not enabled for this account");

  await issueEmailCode(user, "login");
  return { sent: true, maskedEmail: maskEmail(user.email) };
}

export async function verifyEmailCodeForLogin(userId: string, code: string) {
  return verifyEmailCode(userId, code, "login");
}
