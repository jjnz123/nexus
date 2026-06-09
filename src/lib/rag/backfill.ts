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

export type RagBackfillStage = {
  name: string;
  total: number;
  processed: number;
  failed: number;
};

export async function backfillAllRagSources(indexedByUserId: string) {
  if (!isRagEnabled()) {
    return {
      indexed: 0,
      skipped: true,
      reason: "RAG disabled",
      stages: [] as RagBackfillStage[],
    };
  }

  const stages: RagBackfillStage[] = [];
  let indexed = 0;

  const notes = await db.select().from(userNotes);
  const noteStage: RagBackfillStage = {
    name: "notes",
    total: notes.length,
    processed: 0,
    failed: 0,
  };
  for (const note of notes) {
    try {
      await indexUserNote(note);
      noteStage.processed += 1;
      indexed += 1;
    } catch {
      noteStage.failed += 1;
    }
  }
  stages.push(noteStage);

  const readyMeetings = await db
    .select()
    .from(meetings)
    .where(isNull(meetings.archivedAt));
  const meetingCandidates = readyMeetings.filter((meeting) => meeting.status === "ready");
  const meetingStage: RagBackfillStage = {
    name: "meetings",
    total: meetingCandidates.length,
    processed: 0,
    failed: 0,
  };
  for (const meeting of meetingCandidates) {
    try {
      await indexMeetingContent(meeting);
      meetingStage.processed += 1;
      indexed += 1;
    } catch {
      meetingStage.failed += 1;
    }
  }
  stages.push(meetingStage);

  const allTasks = await db.select({ id: tasks.id }).from(tasks);
  const taskStage: RagBackfillStage = {
    name: "tasks",
    total: allTasks.length,
    processed: 0,
    failed: 0,
  };
  for (const task of allTasks) {
    try {
      await indexTaskById(task.id, indexedByUserId);
      taskStage.processed += 1;
      indexed += 1;
    } catch {
      taskStage.failed += 1;
    }
  }
  stages.push(taskStage);

  const projectFiles = await db.select().from(aiProjectFiles);
  const projectFileStage: RagBackfillStage = {
    name: "project_files",
    total: projectFiles.length,
    processed: 0,
    failed: 0,
  };
  for (const file of projectFiles) {
    try {
      await indexAiProjectFile(file);
      projectFileStage.processed += 1;
      indexed += 1;
    } catch {
      projectFileStage.failed += 1;
    }
  }
  stages.push(projectFileStage);

  const conversationFiles = await db.select().from(aiConversationFiles);
  const conversationFileStage: RagBackfillStage = {
    name: "conversation_files",
    total: conversationFiles.length,
    processed: 0,
    failed: 0,
  };
  for (const file of conversationFiles) {
    try {
      await indexAiConversationFile(file);
      conversationFileStage.processed += 1;
      indexed += 1;
    } catch {
      conversationFileStage.failed += 1;
    }
  }
  stages.push(conversationFileStage);

  return { indexed, skipped: false, stages };
}
