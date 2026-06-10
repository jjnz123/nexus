import { readFile } from "fs/promises";
import path from "path";
import { asc, eq } from "drizzle-orm";
import type {
  AiConversationFile,
  AiProjectFile,
  Meeting,
  MeetingActionItem,
  UserNote,
} from "@/lib/db/schema";
import {
  meetingActionItems,
  meetings,
  projects,
  taskComments,
  tasks,
  taskSubtasks,
  userNotes,
  users,
} from "@/lib/db/schema";
import { db } from "@/lib/db";
import { extractTextPreview } from "@/lib/ai/file-context";
import { chooseChunkStrategy, chunkDocumentText, hashContent } from "@/lib/rag/chunking";
import { embedTexts } from "@/lib/rag/embeddings";
import {
  deleteChunksForSource,
  deleteMeetingRagSources,
  deleteRagSource as deleteRagSourceFromStore,
  getIndexState,
  insertChunks,
  upsertIndexState,
} from "@/lib/rag/store";
import {
  RAG_FULL_TEXT_MAX_BYTES,
  RAG_SOURCE_TYPES,
  isRagEnabled,
  type RagIndexInput,
  type RagTextIndexInput,
} from "@/lib/rag/types";

export async function extractFullText(
  filePath: string,
  mimeType: string,
  filename: string
): Promise<string | null> {
  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  const fullPath = path.join(uploadDir, filePath);

  const isTextLike =
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/csv" ||
    /\.(txt|md|csv|json|log|yaml|yml)$/i.test(filename);

  if (!isTextLike) return null;

  try {
    const raw = await readFile(fullPath);
    if (raw.byteLength > RAG_FULL_TEXT_MAX_BYTES) {
      return raw.subarray(0, RAG_FULL_TEXT_MAX_BYTES).toString("utf8");
    }
    const normalized = raw.toString("utf8").replace(/\r\n/g, "\n").trim();
    return normalized || null;
  } catch {
    return null;
  }
}

export async function indexTextContent(input: RagTextIndexInput) {
  if (!isRagEnabled()) return { indexed: false, reason: "RAG disabled" as const };

  const text = input.text.replace(/\r\n/g, "\n").trim();
  if (!text) {
    await deleteRagSourceFromStore(input.sourceType, input.sourceId);
    await upsertIndexState({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contentHash: hashContent(""),
      chunkCount: 0,
      status: "failed",
      errorMessage: "No extractable text content",
    });
    return { indexed: false, reason: "no_text" as const };
  }

  const contentHash = hashContent(text);
  const existing = await getIndexState(input.sourceType, input.sourceId);
  if (existing?.contentHash === contentHash && existing.status === "indexed") {
    return { indexed: true, skipped: true as const, chunkCount: existing.chunkCount };
  }

  await upsertIndexState({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    contentHash,
    chunkCount: 0,
    status: "pending",
  });

  try {
    const strategy =
      input.chunkStrategy ??
      chooseChunkStrategy(input.title, input.mimeType ?? "text/plain");
    const chunks = chunkDocumentText(text, strategy);
    if (!chunks.length) throw new Error("Chunking produced no segments");

    await deleteChunksForSource(input.sourceType, input.sourceId);

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
    await insertChunks(
      chunks.map((chunk, index) => ({
        userId: input.userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        contentHash,
        title: input.title,
        mimeType: input.mimeType ?? null,
        scope: input.scope ?? "user",
        aiProjectId: input.aiProjectId ?? null,
        aiConversationId: input.aiConversationId ?? null,
        meetingId: input.meetingId ?? null,
        noteId: input.noteId ?? null,
        taskId: input.taskId ?? null,
        kanbanProjectId: input.kanbanProjectId ?? null,
        metadata: input.metadata ?? {},
        tokenEstimate: chunk.tokenEstimate ?? Math.ceil(chunk.content.length / 4),
        embedding: embeddings[index],
      }))
    );

    await upsertIndexState({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contentHash,
      chunkCount: chunks.length,
      status: "indexed",
    });

    return { indexed: true, chunkCount: chunks.length };
  } catch (error) {
    await upsertIndexState({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contentHash,
      chunkCount: 0,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Indexing failed",
    });
    throw error;
  }
}

export async function indexRagSource(input: RagIndexInput) {
  const fullText =
    (await extractFullText(input.filePath, input.mimeType, input.title)) ??
    (await extractTextPreview(input.filePath, input.mimeType, input.title));

  if (!fullText?.trim()) {
    await deleteRagSourceFromStore(input.sourceType, input.sourceId);
    await upsertIndexState({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contentHash: hashContent(""),
      chunkCount: 0,
      status: "failed",
      errorMessage: "No extractable text content",
    });
    return { indexed: false, reason: "no_text" as const };
  }

  return indexTextContent({
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    title: input.title,
    text: fullText,
    scope: "user",
    mimeType: input.mimeType,
    aiProjectId: input.aiProjectId,
    aiConversationId: input.aiConversationId,
    metadata: {
      filePath: input.filePath,
      ...input.metadata,
    },
    chunkStrategy: chooseChunkStrategy(input.title, input.mimeType),
  });
}

export async function indexAiProjectFile(file: AiProjectFile) {
  return indexRagSource({
    userId: file.userId,
    sourceType: RAG_SOURCE_TYPES.AI_PROJECT_FILE,
    sourceId: file.id,
    title: file.displayName,
    mimeType: file.mimeType,
    filePath: file.path,
    aiProjectId: file.projectId,
    metadata: { filename: file.filename },
  });
}

export async function indexAiConversationFile(file: AiConversationFile) {
  return indexRagSource({
    userId: file.userId,
    sourceType: RAG_SOURCE_TYPES.AI_CONVERSATION_FILE,
    sourceId: file.id,
    title: file.displayName,
    mimeType: file.mimeType,
    filePath: file.path,
    aiConversationId: file.conversationId,
    metadata: { filename: file.filename },
  });
}

export async function indexUserNote(note: UserNote) {
  const text = [`# ${note.title}`, note.content].filter(Boolean).join("\n\n");
  return indexTextContent({
    userId: note.userId,
    sourceType: RAG_SOURCE_TYPES.USER_NOTE,
    sourceId: note.id,
    title: note.title,
    text,
    scope: "user",
    noteId: note.id,
    kanbanProjectId: note.projectId ?? null,
    mimeType: note.language === "markdown" ? "text/markdown" : "text/plain",
    metadata: {
      noteId: note.id,
      language: note.language,
      projectId: note.projectId ?? undefined,
    },
    chunkStrategy: note.language === "markdown" ? "markdown" : "document",
  });
}

export async function indexMeetingContent(
  meeting: Meeting,
  actionItems: MeetingActionItem[] = []
) {
  if (!isRagEnabled() || meeting.status !== "ready") return;

  const archived = Boolean(meeting.archivedAt);
  const baseMetadata = {
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    meetingAt: meeting.meetingAt.toISOString(),
    projectId: meeting.projectId ?? undefined,
    labels: meeting.labels ?? [],
    archived: archived ? "true" : "false",
  };

  const jobs: Promise<unknown>[] = [];

  if (meeting.transcript?.trim()) {
    jobs.push(
      indexTextContent({
        userId: meeting.userId,
        sourceType: RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
        sourceId: meeting.id,
        title: `${meeting.title} — Transcript`,
        text: meeting.transcript,
        scope: "user",
        meetingId: meeting.id,
        metadata: baseMetadata,
        chunkStrategy: "document",
      })
    );
  }

  if (meeting.summary?.trim()) {
    jobs.push(
      indexTextContent({
        userId: meeting.userId,
        sourceType: RAG_SOURCE_TYPES.MEETING_SUMMARY,
        sourceId: meeting.id,
        title: `${meeting.title} — Summary`,
        text: meeting.summary,
        scope: "user",
        meetingId: meeting.id,
        metadata: baseMetadata,
        chunkStrategy: "markdown",
      })
    );
  }

  for (const item of actionItems) {
    const text = [
      item.title,
      item.description ? `Description: ${item.description}` : null,
      item.assigneeHint ? `Assignee hint: ${item.assigneeHint}` : null,
      item.priority ? `Priority: ${item.priority}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    jobs.push(
      indexTextContent({
        userId: meeting.userId,
        sourceType: RAG_SOURCE_TYPES.MEETING_ACTION_ITEM,
        sourceId: item.id,
        title: `${meeting.title} — Action: ${item.title}`,
        text,
        scope: "user",
        meetingId: meeting.id,
        metadata: { ...baseMetadata, actionItemId: item.id },
        chunkStrategy: "document",
      })
    );
  }

  await Promise.all(jobs.map((job) => job.catch(() => undefined)));
}

export async function indexTaskById(taskId: string, indexedByUserId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, task.projectId))
    .limit(1);
  if (!project) return;

  const subtasks = await db
    .select()
    .from(taskSubtasks)
    .where(eq(taskSubtasks.taskId, task.id))
    .orderBy(asc(taskSubtasks.sortOrder));

  const comments = await db
    .select({ body: taskComments.body, userName: users.name })
    .from(taskComments)
    .innerJoin(users, eq(taskComments.userId, users.id))
    .where(eq(taskComments.taskId, task.id))
    .orderBy(asc(taskComments.createdAt));

  const taskKey = `${project.key}-${task.number}`;
  const sections = [
    `# ${taskKey}: ${task.title}`,
    task.description ? `## Description\n${task.description}` : null,
    task.details ? `## Details\n${task.details}` : null,
    task.acceptanceCriteria ? `## Acceptance criteria\n${task.acceptanceCriteria}` : null,
    task.definitionOfDone ? `## Definition of done\n${task.definitionOfDone}` : null,
    subtasks.length
      ? `## Subtasks\n${subtasks.map((item) => `- [${item.completed ? "x" : " "}] ${item.title}`).join("\n")}`
      : null,
    comments.length
      ? `## Comments\n${comments.map((comment) => `- ${comment.userName}: ${comment.body}`).join("\n")}`
      : null,
  ].filter(Boolean);

  return indexTextContent({
    userId: indexedByUserId,
    sourceType: RAG_SOURCE_TYPES.TASK,
    sourceId: task.id,
    title: `${taskKey} — ${task.title}`,
    text: sections.join("\n\n"),
    scope: "org",
    taskId: task.id,
    kanbanProjectId: task.projectId,
    metadata: {
      taskId: task.id,
      taskKey,
      projectKey: project.key,
      projectId: task.projectId,
    },
    chunkStrategy: "markdown",
  });
}

export async function deleteMeetingIndex(meetingId: string) {
  await deleteMeetingRagSources(meetingId);
}

export async function ensureAiFilesIndexed(
  projectFiles: AiProjectFile[],
  conversationFiles: AiConversationFile[]
) {
  if (!isRagEnabled()) return;

  await Promise.all([
    ...projectFiles.map(async (file) => {
      const state = await getIndexState(RAG_SOURCE_TYPES.AI_PROJECT_FILE, file.id);
      if (state?.status === "indexed") return;
      await indexAiProjectFile(file).catch(() => undefined);
    }),
    ...conversationFiles.map(async (file) => {
      const state = await getIndexState(RAG_SOURCE_TYPES.AI_CONVERSATION_FILE, file.id);
      if (state?.status === "indexed") return;
      await indexAiConversationFile(file).catch(() => undefined);
    }),
  ]);
}

export async function reindexRagSource(sourceType: RagTextIndexInput["sourceType"], sourceId: string) {
  if (sourceType === RAG_SOURCE_TYPES.USER_NOTE) {
    const [note] = await db.select().from(userNotes).where(eq(userNotes.id, sourceId)).limit(1);
    if (!note) throw new Error("Note not found");
    return indexUserNote(note);
  }

  if (
    sourceType === RAG_SOURCE_TYPES.MEETING_TRANSCRIPT ||
    sourceType === RAG_SOURCE_TYPES.MEETING_SUMMARY
  ) {
    const [meeting] = await db.select().from(meetings).where(eq(meetings.id, sourceId)).limit(1);
    if (!meeting) throw new Error("Meeting not found");
    const actionItems = await db
      .select()
      .from(meetingActionItems)
      .where(eq(meetingActionItems.meetingId, meeting.id));
    await deleteMeetingIndex(meeting.id);
    return indexMeetingContent(meeting, actionItems);
  }

  if (sourceType === RAG_SOURCE_TYPES.MEETING_ACTION_ITEM) {
    const [item] = await db
      .select({ item: meetingActionItems, meeting: meetings })
      .from(meetingActionItems)
      .innerJoin(meetings, eq(meetingActionItems.meetingId, meetings.id))
      .where(eq(meetingActionItems.id, sourceId))
      .limit(1);
    if (!item) throw new Error("Action item not found");
    return indexMeetingContent(item.meeting, [item.item]);
  }

  if (sourceType === RAG_SOURCE_TYPES.TASK) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, sourceId)).limit(1);
    if (!task) throw new Error("Task not found");
    return indexTaskById(task.id, task.assigneeId ?? task.projectId);
  }

  throw new Error(`Reindex not supported for ${sourceType}`);
}
