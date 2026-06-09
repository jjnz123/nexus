import { isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiConversationFiles,
  aiProjectFiles,
  meetings,
  tasks,
  userNotes,
} from "@/lib/db/schema";
import {
  indexAiConversationFile,
  indexAiProjectFile,
  indexMeetingContent,
  indexTaskById,
  indexUserNote,
} from "@/lib/rag/indexer";
import { isRagEnabled } from "@/lib/rag/types";

export async function backfillAllRagSources(indexedByUserId: string) {
  if (!isRagEnabled()) {
    return { indexed: 0, skipped: true, reason: "RAG disabled" };
  }

  let indexed = 0;

  const notes = await db.select().from(userNotes);
  for (const note of notes) {
    await indexUserNote(note).catch(() => undefined);
    indexed += 1;
  }

  const readyMeetings = await db
    .select()
    .from(meetings)
    .where(isNull(meetings.archivedAt));
  for (const meeting of readyMeetings) {
    if (meeting.status !== "ready") continue;
    await indexMeetingContent(meeting).catch(() => undefined);
    indexed += 1;
  }

  const allTasks = await db.select({ id: tasks.id }).from(tasks);
  for (const task of allTasks) {
    await indexTaskById(task.id, indexedByUserId).catch(() => undefined);
    indexed += 1;
  }

  const projectFiles = await db.select().from(aiProjectFiles);
  for (const file of projectFiles) {
    await indexAiProjectFile(file).catch(() => undefined);
    indexed += 1;
  }

  const conversationFiles = await db.select().from(aiConversationFiles);
  for (const file of conversationFiles) {
    await indexAiConversationFile(file).catch(() => undefined);
    indexed += 1;
  }

  return { indexed, skipped: false };
}
