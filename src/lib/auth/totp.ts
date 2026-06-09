import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";
import * as OTPAuth from "otpauth";
import bcrypt from "bcryptjs";

const APP_NAME = "Nexus";

function getEncryptionKey() {
  const secret = process.env.AUTH_SECRET ?? "development-secret-key";
  return createHash("sha256").update(secret).digest();
}

export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptTotpSecret(payload: string): string {
  const [ivHex, dataHex] = payload.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid TOTP secret payload");
  const decipher = createDecipheriv(
    "aes-256-cbc",
    getEncryptionKey(),
    Buffer.from(ivHex, "hex")
  );
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateTotpSecret(email: string) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(4).toString("hex").toUpperCase()
  );
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
}

export async function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): Promise<number | null> {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(code.replace(/\s/g, "").toUpperCase(), hashedCodes[i])) {
      return i;
    }
  }
  return null;
}

export function isTwoFactorRequired(user: {
  role: string;
  status: string;
  totpEnabled?: boolean;
  email2faEnabled?: boolean;
}): boolean {
  if (user.role === "admin" || user.status === "administrator") return false;
  return true;
}

export function hasTwoFactorEnabled(user: {
  totpEnabled: boolean;
  email2faEnabled: boolean;
}): boolean {
  return user.totpEnabled || user.email2faEnabled;
}

/** True when the user must complete a second factor at sign-in. */
export function requiresTwoFactorAtLogin(user: {
  totpEnabled: boolean;
  email2faEnabled: boolean;
}): boolean {
  return hasTwoFactorEnabled(user);
}

/** @deprecated Use requiresTwoFactorAtLogin */
export function requiresTotpAtLogin(user: {
  totpEnabled: boolean;
  email2faEnabled?: boolean;
}): boolean {
  return requiresTwoFactorAtLogin({
    totpEnabled: user.totpEnabled,
    email2faEnabled: user.email2faEnabled ?? false,
  });
}

export function isTwoFactorSatisfied(user: {
  role: string;
  status: string;
  totpEnabled: boolean;
  email2faEnabled: boolean;
}): boolean {
  if (!isTwoFactorRequired(user)) return true;
  return hasTwoFactorEnabled(user);
}
