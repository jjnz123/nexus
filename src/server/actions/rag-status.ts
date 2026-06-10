"use server";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ragIndexState, type RagSourceType } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import { RAG_SOURCE_TYPES } from "@/lib/rag/types";

export type RagIndexStatus = "indexed" | "failed" | "pending";

export type RagStatusSource = {
  sourceType: RagSourceType;
  sourceId: string;
};

export function ragStatusKey(sourceType: RagSourceType, sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

export async function getRagIndexStatuses(sources: RagStatusSource[]) {
  await requireAuth();
  if (!sources.length) return {} as Record<string, RagIndexStatus>;

  const unique = Array.from(
    new Map(sources.map((s) => [ragStatusKey(s.sourceType, s.sourceId), s])).values()
  );

  const conditions = unique.map((source) =>
    and(
      eq(ragIndexState.sourceType, source.sourceType),
      eq(ragIndexState.sourceId, source.sourceId)
    )
  );

  const rows = await db
    .select({
      sourceType: ragIndexState.sourceType,
      sourceId: ragIndexState.sourceId,
      status: ragIndexState.status,
    })
    .from(ragIndexState)
    .where(or(...conditions));

  return Object.fromEntries(
    rows.map((row) => [ragStatusKey(row.sourceType, row.sourceId), row.status])
  ) as Record<string, RagIndexStatus>;
}

export async function getTaskAttachmentRagStatuses(attachmentIds: string[]) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:view");
  if (!attachmentIds.length) return {} as Record<string, RagIndexStatus>;

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

/** Meeting indexed if transcript source is indexed. */
export async function getMeetingRagStatuses(meetingIds: string[]) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  if (!meetingIds.length) return {} as Record<string, RagIndexStatus>;

  const rows = await db
    .select({
      sourceId: ragIndexState.sourceId,
      status: ragIndexState.status,
    })
    .from(ragIndexState)
    .where(
      and(
        eq(ragIndexState.sourceType, RAG_SOURCE_TYPES.MEETING_TRANSCRIPT),
        inArray(ragIndexState.sourceId, meetingIds)
      )
    );

  return Object.fromEntries(rows.map((row) => [row.sourceId, row.status]));
}

/** AI project/conversation file indexed status. */
export async function getAiFileRagStatuses(
  sources: Array<{ sourceType: "ai_project_file" | "ai_conversation_file"; sourceId: string }>
) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  return getRagIndexStatuses(sources);
}
