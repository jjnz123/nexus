"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ragIndexState } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import { RAG_SOURCE_TYPES } from "@/lib/rag/types";

export async function getTaskAttachmentRagStatuses(attachmentIds: string[]) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:view");
  if (!attachmentIds.length) return {} as Record<string, "indexed" | "failed" | "pending">;

  const rows = await db
    .select({
      sourceId: ragIndexState.sourceId,
      status: ragIndexState.status,
    })
    .from(ragIndexState)
    .where(
      and(
        eq(ragIndexState.sourceType, RAG_SOURCE_TYPES.TASK_ATTACHMENT),
        inArray(ragIndexState.sourceId, attachmentIds)
      )
    );

  return Object.fromEntries(rows.map((row) => [row.sourceId, row.status]));
}
