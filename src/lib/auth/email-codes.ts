import bcrypt from "bcryptjs";

export type EmailCodePurpose = "setup" | "login" | "disable";

type StoredEmailCode = {
  hash: string;
  expiresAt: number;
  purpose: EmailCodePurpose;
};

const emailCodeStore = new Map<string, StoredEmailCode>();

const CODE_TTL_MS = 10 * 60 * 1000;

export async function storeEmailCode(
  userId: string,
  code: string,
  purpose: EmailCodePurpose
): Promise<void> {
  emailCodeStore.set(userId, {
    hash: await bcrypt.hash(code, 10),
    expiresAt: Date.now() + CODE_TTL_MS,
    purpose,
  });
}

export async function verifyEmailCode(
  userId: string,
  code: string,
  purpose: EmailCodePurpose
): Promise<boolean> {
  const entry = emailCodeStore.get(userId);
  if (!entry || entry.expiresAt < Date.now() || entry.purpose !== purpose) {
    return false;
  }
  const ok = await bcrypt.compare(code.trim(), entry.hash);
  if (ok) emailCodeStore.delete(userId);
  return ok;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.length <= 2 ? local[0] ?? "*" : local.slice(0, 2);
  return `${visible}***@${domain}`;
}
