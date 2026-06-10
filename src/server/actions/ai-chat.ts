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
import { requireSessionPermission } from "@/lib/permissions";
import { listAccessibleProjects, assertProjectViewAccess } from "@/lib/project-access";
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

async function assertKanbanProject(
  projectId: string,
  session: Awaited<ReturnType<typeof requireAuth>>
) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) throw new Error("Project not found");
  await assertProjectViewAccess(session.user.id, session.user.role, projectId);
  return row;
}

async function getPortalProjects(session: Awaited<ReturnType<typeof requireAuth>>) {
  return listAccessibleProjects(session.user.id, session.user.role, {
    permissions: session.user.permissions,
  });
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
    await assertKanbanProject(data.projectId, session);
  }

  const [conversation] = await db
    .insert(aiConversations)
    .values({
      userId: session.user.id,
      projectId: data.projectId ?? null,
      title: data.title?.trim() || "New conversation",
    })
    .returning();

  await db
    .update(aiConversations)
    .set({ tabGroupId: conversation.id })
    .where(eq(aiConversations.id, conversation.id));

  const [withTabGroup] = await db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.id, conversation.id))
    .limit(1);

  await updateBookmarkPreferences({
    activeAiProjectId: data.projectId ?? null,
    activeAiConversationId: conversation.id,
  });

  revalidatePath("/chat");
  return withTabGroup ?? { ...conversation, tabGroupId: conversation.id };
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

  if (projectId) await assertKanbanProject(projectId, session);
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

export async function getConversationTabGroup(tabGroupId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");

  return db
    .select()
    .from(aiConversations)
    .where(
      and(eq(aiConversations.tabGroupId, tabGroupId), eq(aiConversations.userId, session.user.id))
    )
    .orderBy(asc(aiConversations.createdAt));
}

export async function forkConversationAtMessage(conversationId: string, messageId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  const source = await assertConversationOwner(conversationId, session.user.id);

  const [targetMessage] = await db
    .select()
    .from(aiMessages)
    .where(and(eq(aiMessages.id, messageId), eq(aiMessages.conversationId, conversationId)))
    .limit(1);

  if (!targetMessage) throw new Error("Message not found");

  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));

  const forkIndex = history.findIndex((message) => message.id === messageId);
  if (forkIndex < 0) throw new Error("Message not found");

  const messagesToCopy = history.slice(0, forkIndex + 1);
  const tabGroupId = source.tabGroupId ?? source.id;
  const forkNumber =
    (
      await db
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(
          and(
            eq(aiConversations.tabGroupId, tabGroupId),
            eq(aiConversations.userId, session.user.id)
          )
        )
    ).length + 1;

  const preview = previewText(targetMessage.content, 40);
  const title =
    targetMessage.role === "assistant"
      ? `Fork · ${preview}`
      : `Fork ${forkNumber} · ${preview}`;

  const [forked] = await db
    .insert(aiConversations)
    .values({
      userId: session.user.id,
      projectId: source.projectId,
      title,
      tabGroupId,
      forkFromMessageId: messageId,
      enabledSkills: source.enabledSkills,
      lastMessagePreview: source.lastMessagePreview,
      lastMessageAt: messagesToCopy.at(-1)?.createdAt ?? new Date(),
    })
    .returning();

  if (messagesToCopy.length) {
    await db.insert(aiMessages).values(
      messagesToCopy.map((message) => ({
        conversationId: forked.id,
        role: message.role,
        content: message.content,
        attachments: message.attachments ?? [],
        metadata: message.metadata ?? {},
        createdAt: message.createdAt,
      }))
    );
  }

  await updateBookmarkPreferences({
    activeAiProjectId: forked.projectId,
    activeAiConversationId: forked.id,
  });

  revalidatePath("/chat");
  return forked;
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
