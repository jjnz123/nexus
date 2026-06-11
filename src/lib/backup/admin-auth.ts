import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function requireAdminSession() {
  const session = await auth();
  if (
    !session?.user ||
    !hasPermission(session.user.role, "admin:access", session.user.permissions ?? null)
  ) {
    return null;
  }
  return session;
}
