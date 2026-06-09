"use server";

import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission, hasPermission } from "@/lib/permissions";
import { z } from "zod";

const auditFilterSchema = z.object({
  userEmail: z.string().optional(),
  action: z.string().optional(),
  search: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export async function getAuditLogs(input: unknown = {}) {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  const filters = auditFilterSchema.parse(input);
  const conditions = [];

  if (filters.userEmail) {
    conditions.push(ilike(auditLogs.userEmail, `%${filters.userEmail}%`));
  }
  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(auditLogs.summary, `%${filters.search}%`),
        ilike(auditLogs.userName, `%${filters.search}%`),
        ilike(auditLogs.resourceId, `%${filters.search}%`)
      )
    );
  }
  if (filters.from) {
    conditions.push(gte(auditLogs.createdAt, new Date(filters.from)));
  }
  if (filters.to) {
    conditions.push(lte(auditLogs.createdAt, new Date(filters.to)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(filters.limit)
      .offset(filters.offset),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(whereClause),
  ]);

  return {
    logs: rows,
    total: countResult[0]?.value ?? 0,
  };
}

export async function getAuditActions() {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  const rows = await db
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .orderBy(auditLogs.action);

  return rows.map((row) => row.action);
}

export async function exportAuditLogs(input: unknown = {}) {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  const { logs } = await getAuditLogs({
    ...(typeof input === "object" && input ? input : {}),
    limit: 500,
    offset: 0,
  });

  return {
    exportedAt: new Date().toISOString(),
    count: logs.length,
    logs,
  };
}
