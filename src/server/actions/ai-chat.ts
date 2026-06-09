"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiConversations,
  aiMessages,
  aiProjects,
  users,
  type AiMessageAttachment,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import {
  aiAdminSearchSchema,
  aiConversationSchema,
  aiMessageSchema,
  aiProjectSchema,
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

async function assertProjectOwner(projectId: string, userId: string) {
  const [row] = await db
    .select()
    .from(aiProjects)
    .where(and(eq(aiProjects.id, projectId), eq(aiProjects.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Project not found");
  return row;
}

export async function getAiWorkspace() {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");

  const projects = await db
    .select()
    .from(aiProjects)
    .where(eq(aiProjects.userId, session.user.id))
    .orderBy(asc(aiProjects.name));

  const conversations = await db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.userId, session.user.id))
    .orderBy(desc(aiConversations.lastMessageAt), desc(aiConversations.updatedAt));

  return { projects, conversations };
}

export async function createAiProject(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  const data = aiProjectSchema.parse(input);

  const [project] = await db
    .insert(aiProjects)
    .values({ userId: session.user.id, name: data.name.trim() })
    .returning();

  revalidatePath("/chat");
  return project;
}

export async function renameAiProject(id: string, name: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertProjectOwner(id, session.user.id);

  const [project] = await db
    .update(aiProjects)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(eq(aiProjects.id, id))
    .returning();

  revalidatePath("/chat");
  return project;
}

export async function deleteAiProject(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertProjectOwner(id, session.user.id);

  await db.delete(aiProjects).where(eq(aiProjects.id, id));
  revalidatePath("/chat");
  return { success: true };
}

export async function createAiConversation(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  const data = aiConversationSchema.parse(input);

  if (data.projectId) {
    await assertProjectOwner(data.projectId, session.user.id);
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

  if (projectId) await assertProjectOwner(projectId, session.user.id);
  if (conversationId) await assertConversationOwner(conversationId, session.user.id);

  await updateBookmarkPreferences({
    activeAiProjectId: projectId,
    activeAiConversationId: conversationId,
  });

  return { success: true };
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

export async function appendAssistantMessage(conversationId: string, content: string) {
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
      projectId: aiProjects.id,
      projectName: aiProjects.name,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
    .innerJoin(users, eq(aiConversations.userId, users.id))
    .leftJoin(aiProjects, eq(aiConversations.projectId, aiProjects.id))
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
      project: aiProjects,
    })
    .from(aiConversations)
    .innerJoin(users, eq(aiConversations.userId, users.id))
    .leftJoin(aiProjects, eq(aiConversations.projectId, aiProjects.id))
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
      id: aiProjects.id,
      name: aiProjects.name,
      userId: aiProjects.userId,
      userName: users.name,
    })
    .from(aiProjects)
    .innerJoin(users, eq(aiProjects.userId, users.id))
    .orderBy(asc(aiProjects.name));
}
