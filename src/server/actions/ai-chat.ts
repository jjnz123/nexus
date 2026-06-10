"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiConversations,
  aiMessages,
  projects,
  users,
  type AiMessageAttachment,
  type AiMessageMetadata,
  type PortalProjectSummary,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { hasPermission, requireSessionPermission } from "@/lib/permissions";
import {
  aiAdminSearchSchema,
  aiConversationSchema,
  aiMessageSchema,
} from "@/lib/validators/ai-chat";
import { updateBookmarkPreferences } from "@/server/actions/preferences";

function previewText(content: string, max = 120) {
  const trimmed = content.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
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

async function assertKanbanProject(projectId: string) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) throw new Error("Project not found");
  return row;
}

async function getPortalProjects(session: Awaited<ReturnType<typeof requireAuth>>) {
  if (!hasPermission(session.user.role, "tasks:view", session.user.permissions)) {
    return [] as PortalProjectSummary[];
  }

  return db
    .select({
      id: projects.id,
      key: projects.key,
      name: projects.name,
    })
    .from(projects)
    .orderBy(asc(projects.name));
}

export async function getAiWorkspace() {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");

  const [projectRows, conversations] = await Promise.all([
    getPortalProjects(session),
    db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, session.user.id))
      .orderBy(desc(aiConversations.lastMessageAt), desc(aiConversations.updatedAt)),
  ]);

  return { projects: projectRows, conversations };
}

export async function createAiConversation(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  const data = aiConversationSchema.parse(input);

  if (data.projectId) {
    await assertKanbanProject(data.projectId);
  }

  const [conversation] = await db
    .insert(aiConversations)
    .values({
      userId: session.user.id,
      projectId: data.projectId ?? null,
      title: data.title?.trim() || "New conversation",
    })
    .returning();

  await updateBookmarkPreferences({
    activeAiProjectId: data.projectId ?? null,
    activeAiConversationId: conversation.id,
  });

  revalidatePath("/chat");
  return conversation;
}

export async function renameAiConversation(id: string, title: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertConversationOwner(id, session.user.id);

  const [conversation] = await db
    .update(aiConversations)
    .set({ title: title.trim(), updatedAt: new Date() })
    .where(eq(aiConversations.id, id))
    .returning();

  revalidatePath("/chat");
  return conversation;
}

export async function deleteAiConversation(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertConversationOwner(id, session.user.id);

  await db.delete(aiConversations).where(eq(aiConversations.id, id));
  revalidatePath("/chat");
  return { success: true };
}

export async function setActiveAiSelection(projectId: string | null, conversationId: string | null) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");

  if (projectId) await assertKanbanProject(projectId);
  if (conversationId) await assertConversationOwner(conversationId, session.user.id);

  await updateBookmarkPreferences({
    activeAiProjectId: projectId,
    activeAiConversationId: conversationId,
  });

  return { success: true };
}

export async function updateConversationEnabledSkills(
  conversationId: string,
  enabledSkills: string[] | null
) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertConversationOwner(conversationId, session.user.id);

  const [conversation] = await db
    .update(aiConversations)
    .set({
      enabledSkills,
      updatedAt: new Date(),
    })
    .where(eq(aiConversations.id, conversationId))
    .returning();

  revalidatePath("/chat");
  return conversation;
}

export async function getConversationMessages(conversationId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertConversationOwner(conversationId, session.user.id);

  return db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));
}

export async function appendUserMessage(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  const data = aiMessageSchema.parse(input);
  const conversation = await assertConversationOwner(data.conversationId, session.user.id);

  const attachments = (data.attachments ?? []) as AiMessageAttachment[];

  const [message] = await db
    .insert(aiMessages)
    .values({
      conversationId: data.conversationId,
      role: "user",
      content: data.content,
      attachments,
    })
    .returning();

  const preview = attachments.length
    ? `📎 ${attachments[0].filename}${attachments.length > 1 ? ` +${attachments.length - 1}` : ""}`
    : previewText(data.content);

  const title =
    conversation.title === "New conversation" &&
    (data.content.trim() || attachments.length)
      ? previewText(data.content.trim() || preview, 60)
      : conversation.title;

  await db
    .update(aiConversations)
    .set({
      title,
      lastMessagePreview: preview,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiConversations.id, data.conversationId));

  revalidatePath("/chat");
  return message;
}

export async function appendAssistantMessage(
  conversationId: string,
  content: string,
  metadata?: AiMessageMetadata
) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertConversationOwner(conversationId, session.user.id);

  const [message] = await db
    .insert(aiMessages)
    .values({
      conversationId,
      role: "assistant",
      content,
      attachments: [],
      metadata: metadata ?? {},
    })
    .returning();

  await db
    .update(aiConversations)
    .set({
      lastMessagePreview: previewText(content),
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiConversations.id, conversationId));

  revalidatePath("/chat");
  return message;
}

export async function deleteMessageAfter(messageId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");

  const [target] = await db
    .select({
      message: aiMessages,
      conversation: aiConversations,
    })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
    .where(and(eq(aiMessages.id, messageId), eq(aiConversations.userId, session.user.id)))
    .limit(1);

  if (!target) throw new Error("Message not found");

  const rows = await db
    .select({ id: aiMessages.id, createdAt: aiMessages.createdAt })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, target.message.conversationId))
    .orderBy(asc(aiMessages.createdAt));

  const idx = rows.findIndex((r) => r.id === messageId);
  if (idx < 0) throw new Error("Message not found");

  const toDelete = rows.slice(idx).map((r) => r.id);
  if (toDelete.length) {
    await db.delete(aiMessages).where(inArray(aiMessages.id, toDelete));
  }

  revalidatePath("/chat");
  return { success: true };
}

export async function searchAiHistoryAdmin(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");
  const data = aiAdminSearchSchema.parse(input);
  const limit = data.limit ?? 50;

  const conditions = [];

  if (data.userId) conditions.push(eq(aiConversations.userId, data.userId));
  if (data.projectId) conditions.push(eq(aiConversations.projectId, data.projectId));
  if (data.dateFrom) conditions.push(gte(aiMessages.createdAt, new Date(data.dateFrom)));
  if (data.dateTo) conditions.push(lte(aiMessages.createdAt, new Date(data.dateTo)));

  const q = data.query?.trim();
  if (q) {
    conditions.push(
      or(
        ilike(aiMessages.content, `%${q}%`),
        ilike(aiConversations.title, `%${q}%`),
        ilike(users.name, `%${q}%`),
        ilike(users.email, `%${q}%`)
      )!
    );
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      messageId: aiMessages.id,
      messageRole: aiMessages.role,
      messageContent: aiMessages.content,
      messageCreatedAt: aiMessages.createdAt,
      conversationId: aiConversations.id,
      conversationTitle: aiConversations.title,
      projectId: projects.id,
      projectName: projects.name,
      projectKey: projects.key,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
    .innerJoin(users, eq(aiConversations.userId, users.id))
    .leftJoin(projects, eq(aiConversations.projectId, projects.id))
    .where(whereClause)
    .orderBy(desc(aiMessages.createdAt))
    .limit(limit);

  return { results: rows, total: rows.length };
}

export async function getAdminConversationMessages(conversationId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  const [conversation] = await db
    .select({
      conversation: aiConversations,
      user: { id: users.id, name: users.name, email: users.email },
      project: {
        id: projects.id,
        key: projects.key,
        name: projects.name,
      },
    })
    .from(aiConversations)
    .innerJoin(users, eq(aiConversations.userId, users.id))
    .leftJoin(projects, eq(aiConversations.projectId, projects.id))
    .where(eq(aiConversations.id, conversationId))
    .limit(1);

  if (!conversation) throw new Error("Conversation not found");

  const messages = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));

  return { ...conversation, messages };
}

export async function getAiProjectsForAdminFilter() {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  return db
    .select({
      id: projects.id,
      key: projects.key,
      name: projects.name,
    })
    .from(projects)
    .orderBy(asc(projects.name));
}
