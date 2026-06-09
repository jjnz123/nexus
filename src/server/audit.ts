import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { auth } from "@/lib/auth";

export type AuditInput = {
  action: string;
  resource?: string;
  resourceId?: string;
  summary: string;
  details?: Record<string, unknown>;
};

export async function logAudit(input: AuditInput) {
  try {
    const session = await auth();
    const headerList = await headers();
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      undefined;

    await db.insert(auditLogs).values({
      userId: session?.user?.id ?? null,
      userEmail: session?.user?.email ?? null,
      userName: session?.user?.name ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      summary: input.summary,
      details: input.details ?? {},
      ipAddress,
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
