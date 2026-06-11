"use server";

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { meetings, projects, taskAttachments, tasks } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import { assertProjectViewAccess } from "@/lib/project-access";

export type ProjectMeetingFileRow = {
  id: string;
  title: string;
  meetingAt: string;
  status: string;
  audioFilename: string | null;
  audioMimeType: string | null;
  audioSize: number | null;
  hasTranscript: boolean;
};

export type ProjectTaskAttachmentRow = {
  id: string;
  taskId: string;
  taskKey: string;
  taskTitle: string;
  displayName: string;
  filename: string;
  mimeType: string;
  size: number;
  kind: string;
  createdAt: string;
  path: string | null;
};

export async function getProjectMeetingsForChat(projectId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  await assertProjectViewAccess(session.user.id, session.user.role, projectId);

  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      meetingAt: meetings.meetingAt,
      status: meetings.status,
      audioFilename: meetings.audioFilename,
      audioMimeType: meetings.audioMimeType,
      audioSize: meetings.audioSize,
      transcript: meetings.transcript,
    })
    .from(meetings)
    .where(and(eq(meetings.projectId, projectId), eq(meetings.userId, session.user.id)))
    .orderBy(desc(meetings.meetingAt));

  return rows.map(
    (row): ProjectMeetingFileRow => ({
      id: row.id,
      title: row.title,
      meetingAt: row.meetingAt.toISOString(),
      status: row.status,
      audioFilename: row.audioFilename,
      audioMimeType: row.audioMimeType,
      audioSize: row.audioSize,
      hasTranscript: Boolean(row.transcript?.trim()),
    })
  );
}

export async function getProjectTaskAttachmentsForChat(projectId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "ai:use");
  requireSessionPermission(session, "tasks:view");
  await assertProjectViewAccess(session.user.id, session.user.role, projectId);

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("Project not found");

  const rows = await db
    .select({
      attachment: taskAttachments,
      task: tasks,
    })
    .from(taskAttachments)
    .innerJoin(tasks, eq(taskAttachments.taskId, tasks.id))
    .where(
      and(
        eq(tasks.projectId, projectId),
        inArray(taskAttachments.kind, ["file", "email"]),
        eq(taskAttachments.isCurrent, true),
        isNotNull(taskAttachments.path)
      )
    )
    .orderBy(desc(taskAttachments.createdAt));

  return rows.map(
    ({ attachment, task }): ProjectTaskAttachmentRow => ({
      id: attachment.id,
      taskId: task.id,
      taskKey: `${project.key}-${String(task.number).padStart(3, "0")}`,
      taskTitle: task.title,
      displayName: attachment.displayTitle ?? attachment.filename,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      createdAt: attachment.createdAt.toISOString(),
      path: attachment.path,
    })
  );
}
