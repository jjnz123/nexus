"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiConversationFiles,
  aiConversations,
  aiProjectFiles,
  aiProjects,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import { extractTextPreview } from "@/lib/ai/file-context";
import { indexAiConversationFile, indexAiProjectFile } from "@/lib/rag/indexer";
import { deleteRagSource as deleteRagSourceFromStore } from "@/lib/rag/store";
import { RAG_SOURCE_TYPES } from "@/lib/rag/types";
import {
  aiConversationFileInputSchema,
  aiProjectFileInputSchema,
  aiRenameFileSchema,
} from "@/lib/validators/ai-files";

async function assertProjectOwner(projectId: string, userId: string) {
  const [row] = await db
    .select()
    .from(aiProjects)
    .where(and(eq(aiProjects.id, projectId), eq(aiProjects.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Project not found");
  return row;
}

async function assertConversationOwner(conversationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Conversation not found");
  return row;
}

export async function getAiProjectFiles(projectId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertProjectOwner(projectId, session.user.id);

  return db
    .select()
    .from(aiProjectFiles)
    .where(eq(aiProjectFiles.projectId, projectId))
    .orderBy(asc(aiProjectFiles.displayName));
}

export async function getAiConversationFiles(conversationId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertConversationOwner(conversationId, session.user.id);

  return db
    .select()
    .from(aiConversationFiles)
    .where(eq(aiConversationFiles.conversationId, conversationId))
    .orderBy(asc(aiConversationFiles.displayName));
}

export async function addAiProjectFile(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  const data = aiProjectFileInputSchema.parse(input);
  await assertProjectOwner(data.projectId, session.user.id);

  const displayName = data.displayName?.trim() || data.filename;
  const textPreview = await extractTextPreview(data.path, data.mimeType, data.filename);

  const [file] = await db
    .insert(aiProjectFiles)
    .values({
      projectId: data.projectId,
      userId: session.user.id,
      path: data.path,
      filename: data.filename,
      displayName,
      mimeType: data.mimeType,
      size: data.size,
      textPreview,
    })
    .returning();

  revalidatePath("/chat");

  void indexAiProjectFile(file).catch(() => undefined);

  return file;
}

export async function addAiConversationFile(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  const data = aiConversationFileInputSchema.parse(input);
  await assertConversationOwner(data.conversationId, session.user.id);

  const displayName = data.displayName?.trim() || data.filename;
  const textPreview = await extractTextPreview(data.path, data.mimeType, data.filename);

  const [file] = await db
    .insert(aiConversationFiles)
    .values({
      conversationId: data.conversationId,
      userId: session.user.id,
      path: data.path,
      filename: data.filename,
      displayName,
      mimeType: data.mimeType,
      size: data.size,
      textPreview,
    })
    .returning();

  revalidatePath("/chat");

  void indexAiConversationFile(file).catch(() => undefined);

  return file;
}

export async function renameAiProjectFile(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  const data = aiRenameFileSchema.parse(input);

  const [file] = await db
    .update(aiProjectFiles)
    .set({ displayName: data.displayName.trim(), updatedAt: new Date() })
    .where(and(eq(aiProjectFiles.id, data.id), eq(aiProjectFiles.userId, session.user.id)))
    .returning();

  if (!file) throw new Error("File not found");
  revalidatePath("/chat");
  return file;
}

export async function renameAiConversationFile(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  const data = aiRenameFileSchema.parse(input);

  const [file] = await db
    .update(aiConversationFiles)
    .set({ displayName: data.displayName.trim(), updatedAt: new Date() })
    .where(
      and(eq(aiConversationFiles.id, data.id), eq(aiConversationFiles.userId, session.user.id))
    )
    .returning();

  if (!file) throw new Error("File not found");
  revalidatePath("/chat");
  return file;
}

export async function deleteAiProjectFile(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");

  await db
    .delete(aiProjectFiles)
    .where(and(eq(aiProjectFiles.id, id), eq(aiProjectFiles.userId, session.user.id)));

  await deleteRagSourceFromStore(RAG_SOURCE_TYPES.AI_PROJECT_FILE, id);

  revalidatePath("/chat");
  return { success: true };
}

export async function deleteAiConversationFile(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");

  await db
    .delete(aiConversationFiles)
    .where(
      and(eq(aiConversationFiles.id, id), eq(aiConversationFiles.userId, session.user.id))
    );

  await deleteRagSourceFromStore(RAG_SOURCE_TYPES.AI_CONVERSATION_FILE, id);

  revalidatePath("/chat");
  return { success: true };
}

export async function loadAiFileContext(projectId: string | null, conversationId: string | null) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");

  let projectFiles: Awaited<ReturnType<typeof getAiProjectFiles>> = [];
  let conversationFiles: Awaited<ReturnType<typeof getAiConversationFiles>> = [];

  if (projectId) {
    projectFiles = await getAiProjectFiles(projectId);
  }
  if (conversationId) {
    conversationFiles = await getAiConversationFiles(conversationId);
  }

  return { projectFiles, conversationFiles };
}
