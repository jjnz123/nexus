"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  meetingActionItems,
  meetingMessages,
  meetings,
  projects,
  taskColumns,
  tasks,
} from "@/lib/db/schema";
import { requireActiveMember } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import { analyzeMeetingTranscript, answerMeetingQuestion } from "@/lib/ai/meeting-analysis";
import { transcribeAudioFile } from "@/lib/ai/whisper";
import {
  attachMeetingAudioSchema,
  convertActionItemSchema,
  createMeetingSchema,
  meetingChatSchema,
  meetingSearchSchema,
  updateMeetingSchema,
} from "@/lib/validators/meetings";
import { logAudit } from "@/server/audit";

export async function getMeetings(input?: unknown) {
  const session = await requireActiveMember();
  requireSessionPermission(session, "ai:use");
  const filters = meetingSearchSchema.parse(input ?? {});

  const conditions = [eq(meetings.userId, session.user.id)];
  if (filters.projectId) conditions.push(eq(meetings.projectId, filters.projectId));
  if (filters.query?.trim()) {
    const q = `%${filters.query.trim()}%`;
    conditions.push(
      or(ilike(meetings.title, q), ilike(meetings.transcript, q), ilike(meetings.summary, q))!
    );
  }
  if (filters.label?.trim()) {
    conditions.push(sql`${meetings.labels} @> ${JSON.stringify([filters.label.trim()])}::jsonb`);
  }

  const rows = await db
    .select({
      meeting: meetings,
      projectName: projects.name,
      projectKey: projects.key,
    })
    .from(meetings)
    .leftJoin(projects, eq(meetings.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(meetings.createdAt));

  return rows;
}

export async function getMeeting(id: string) {
  const session = await requireActiveMember();
  requireSessionPermission(session, "ai:use");

  const [row] = await db
    .select({
      meeting: meetings,
      projectName: projects.name,
      projectKey: projects.key,
    })
    .from(meetings)
    .leftJoin(projects, eq(meetings.projectId, projects.id))
    .where(and(eq(meetings.id, id), eq(meetings.userId, session.user.id)))
    .limit(1);

  if (!row) throw new Error("Meeting not found");

  const actionItems = await db
    .select()
    .from(meetingActionItems)
    .where(eq(meetingActionItems.meetingId, id))
    .orderBy(meetingActionItems.sortOrder);

  const messages = await db
    .select()
    .from(meetingMessages)
    .where(eq(meetingMessages.meetingId, id))
    .orderBy(meetingMessages.createdAt);

  return { ...row, actionItems, messages };
}

export async function createMeeting(input: unknown) {
  const session = await requireActiveMember();
  requireSessionPermission(session, "ai:use");
  const data = createMeetingSchema.parse(input);

  const [meeting] = await db
    .insert(meetings)
    .values({
      userId: session.user.id,
      title: data.title,
      projectId: data.projectId ?? null,
      labels: data.labels ?? [],
      status: "recording",
    })
    .returning();

  revalidatePath("/meetings");
  return meeting;
}

export async function updateMeeting(input: unknown) {
  const session = await requireActiveMember();
  requireSessionPermission(session, "ai:use");
  const data = updateMeetingSchema.parse(input);

  const [meeting] = await db
    .update(meetings)
    .set({
      ...(data.title ? { title: data.title } : {}),
      ...(data.projectId !== undefined ? { projectId: data.projectId } : {}),
      ...(data.labels ? { labels: data.labels } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(meetings.id, data.id), eq(meetings.userId, session.user.id)))
    .returning();

  if (!meeting) throw new Error("Meeting not found");
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${meeting.id}`);
  return meeting;
}

export async function attachMeetingAudio(input: unknown) {
  const session = await requireActiveMember();
  requireSessionPermission(session, "ai:use");
  const data = attachMeetingAudioSchema.parse(input);

  const [meeting] = await db
    .update(meetings)
    .set({
      audioPath: data.audioPath,
      audioFilename: data.audioFilename,
      audioMimeType: data.audioMimeType,
      audioSize: data.audioSize,
      status: "processing",
      updatedAt: new Date(),
    })
    .where(and(eq(meetings.id, data.meetingId), eq(meetings.userId, session.user.id)))
    .returning();

  if (!meeting) throw new Error("Meeting not found");

  void processMeetingRecording(meeting.id);
  revalidatePath(`/meetings/${meeting.id}`);
  return meeting;
}

async function processMeetingRecording(meetingId: string) {
  try {
    const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
    if (!meeting?.audioPath) throw new Error("No audio attached");

    const transcript = await transcribeAudioFile(meeting.audioPath);
    const analysis = await analyzeMeetingTranscript(transcript);

    await db
      .update(meetings)
      .set({
        transcript,
        summary: analysis.summary,
        status: "ready",
        updatedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(meetings.id, meetingId));

    await db.delete(meetingActionItems).where(eq(meetingActionItems.meetingId, meetingId));

    if (analysis.actionItems.length) {
      await db.insert(meetingActionItems).values(
        analysis.actionItems.map((item, index) => ({
          meetingId,
          title: item.title,
          description: item.description ?? null,
          assigneeHint: item.assigneeHint ?? null,
          priority: item.priority ?? "medium",
          sortOrder: index,
        }))
      );
    }
  } catch (error) {
    await db
      .update(meetings)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Processing failed",
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));
  }
}

export async function reprocessMeeting(meetingId: string) {
  const session = await requireActiveMember();
  requireSessionPermission(session, "ai:use");

  const [meeting] = await db
    .update(meetings)
    .set({ status: "processing", errorMessage: null, updatedAt: new Date() })
    .where(and(eq(meetings.id, meetingId), eq(meetings.userId, session.user.id)))
    .returning();

  if (!meeting) throw new Error("Meeting not found");
  void processMeetingRecording(meetingId);
  revalidatePath(`/meetings/${meetingId}`);
  return { ok: true };
}

export async function askMeetingQuestion(input: unknown) {
  const session = await requireActiveMember();
  requireSessionPermission(session, "ai:use");
  const data = meetingChatSchema.parse(input);

  const [meeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, data.meetingId), eq(meetings.userId, session.user.id)))
    .limit(1);

  if (!meeting?.transcript) throw new Error("Meeting transcript not ready");

  const historyRows = await db
    .select()
    .from(meetingMessages)
    .where(eq(meetingMessages.meetingId, meeting.id))
    .orderBy(meetingMessages.createdAt);

  await db.insert(meetingMessages).values({
    meetingId: meeting.id,
    role: "user",
    content: data.question,
  });

  const answer = await answerMeetingQuestion(
    meeting.transcript,
    data.question,
    historyRows.map((m) => ({ role: m.role, content: m.content }))
  );

  const [assistantMessage] = await db
    .insert(meetingMessages)
    .values({ meetingId: meeting.id, role: "assistant", content: answer })
    .returning();

  revalidatePath(`/meetings/${meeting.id}`);
  return assistantMessage;
}

export async function convertActionItemToTask(input: unknown) {
  const session = await requireActiveMember();
  requireSessionPermission(session, "tasks:edit");
  const data = convertActionItemSchema.parse(input);

  const [item] = await db
    .select({
      item: meetingActionItems,
      meeting: meetings,
    })
    .from(meetingActionItems)
    .innerJoin(meetings, eq(meetingActionItems.meetingId, meetings.id))
    .where(
      and(eq(meetingActionItems.id, data.actionItemId), eq(meetings.userId, session.user.id))
    )
    .limit(1);

  if (!item) throw new Error("Action item not found");
  if (item.item.convertedTaskId) throw new Error("Already converted");

  let columnId = data.columnId;
  if (!columnId) {
    const [todo] = await db
      .select()
      .from(taskColumns)
      .where(
        and(
          eq(taskColumns.projectId, data.projectId),
          eq(taskColumns.isBacklog, false),
          eq(taskColumns.name, "To Do")
        )
      )
      .limit(1);
    columnId = todo?.id;
  }
  if (!columnId) throw new Error("No target column found");

  const [countRow] = await db
    .select({ value: sql<number>`coalesce(max(${tasks.number}), 0)` })
    .from(tasks)
    .where(eq(tasks.projectId, data.projectId));

  const [project] = await db.select().from(projects).where(eq(projects.id, data.projectId)).limit(1);
  if (!project) throw new Error("Project not found");

  const [task] = await db
    .insert(tasks)
    .values({
      projectId: data.projectId,
      columnId,
      number: (countRow?.value ?? 0) + 1,
      title: item.item.title,
      description: item.item.description ?? `From meeting: ${item.meeting.title}`,
      priority: item.item.priority ?? "medium",
      type: "task",
      sortOrder: 0,
    })
    .returning();

  await db
    .update(meetingActionItems)
    .set({ convertedTaskId: task.id })
    .where(eq(meetingActionItems.id, item.item.id));

  await logAudit({
    action: "meetings.convert_action",
    resource: "task",
    resourceId: task.id,
    summary: `Created task from meeting action item`,
    details: { meetingId: item.meeting.id, actionItemId: item.item.id },
  });

  revalidatePath(`/meetings/${item.meeting.id}`);
  revalidatePath("/tasks");
  return task;
}

export async function deleteMeeting(id: string) {
  const session = await requireActiveMember();
  requireSessionPermission(session, "ai:use");

  await db
    .delete(meetings)
    .where(and(eq(meetings.id, id), eq(meetings.userId, session.user.id)));

  revalidatePath("/meetings");
  return { ok: true };
}
