"use server";

import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import type { RagSearchScope, RagSourceType } from "@/lib/db/schema";
import { reindexRagSource } from "@/lib/rag/indexer";
import {
  countRagIndexStates,
  getRagAnalyticsSummary,
  listRagIndexStates,
} from "@/lib/rag/store";
import { retrievePortalKnowledge } from "@/lib/rag/retriever";
import { normalizeSearchScopes } from "@/lib/rag/types";
import { logAudit } from "@/server/audit";

export async function getRagAdminOverview() {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  const [analytics, recentStates, totalSources] = await Promise.all([
    getRagAnalyticsSummary(),
    listRagIndexStates(100),
    countRagIndexStates(),
  ]);

  return { analytics, recentStates, totalSources };
}

export async function reindexRagSourceAdmin(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  const data = z
    .object({
      sourceType: z.string(),
      sourceId: z.string().uuid(),
    })
    .parse(input);

  await reindexRagSource(data.sourceType as RagSourceType, data.sourceId);

  await logAudit({
    action: "rag.reindex",
    resource: "rag_index_state",
    resourceId: data.sourceId,
    summary: `Reindexed ${data.sourceType}`,
    details: data,
  });

  return { ok: true };
}

export async function searchKnowledgeAdmin(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  const data = z
    .object({
      query: z.string().min(1).max(2000),
      scopes: z.array(z.enum(["files", "notes", "meetings", "tasks"])).optional(),
    })
    .parse(input);

  const scopes = normalizeSearchScopes(data.scopes as RagSearchScope[] | undefined);
  const result = await retrievePortalKnowledge({
    userId: session.user.id,
    query: data.query,
    scopes,
    includeOrgTasks: scopes.includes("tasks"),
    context: "admin",
    rewriteQuery: true,
    adminMode: true,
  });

  return {
    retrievalQuery: result.retrievalQuery ?? data.query,
    citations: result.citations,
    contextPreview: result.contextBlock.slice(0, 4000),
    usedRag: result.usedRag,
  };
}

export async function backfillRagSources() {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  const { backfillAllRagSources } = await import("@/lib/rag/backfill");
  const result = await backfillAllRagSources(session.user.id);

  await logAudit({
    action: "rag.backfill",
    resource: "rag_index_state",
    summary: "Triggered RAG backfill",
    details: result,
  });

  return result;
}
