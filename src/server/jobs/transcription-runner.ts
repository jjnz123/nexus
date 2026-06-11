import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { analyzeMeetingTranscript } from "@/lib/ai/meeting-analysis";
import { transcribeAudioFile } from "@/lib/ai/transcription/openai-whisper";
import * as schema from "@/lib/db/schema";
import { meetingActionItems, meetings } from "@/lib/db/schema";
import { indexMeetingContent } from "@/lib/rag/indexer";

export type TranscriptionDb = PostgresJsDatabase<typeof schema>;

export async function runTranscriptionJob(db: TranscriptionDb, meetingId: string) {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!meeting?.audioPath) throw new Error("No audio attached");

  console.log(`[transcription] Starting meeting ${meetingId} (${meeting.title})`);

  const transcript = await transcribeAudioFile(meeting.audioPath);
  console.log(`[transcription] Whisper complete for ${meetingId} (${transcript.length} chars)`);

  const analysis = await analyzeMeetingTranscript(transcript);

  await db
    .update(meetings)
    .set({
      transcript,
      summary: analysis.summary,
      status: "ready",
      updatedAt: new Date(),
      errorMessage: null,
      transcriptionStartedAt: null,
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

  const [updatedMeeting] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .limit(1);
  const actionItems = await db
    .select()
    .from(meetingActionItems)
    .where(eq(meetingActionItems.meetingId, meetingId));

  if (updatedMeeting) {
    await indexMeetingContent(updatedMeeting, actionItems).catch((error) => {
      console.error(`[transcription] RAG index failed for ${meetingId}:`, error);
    });
  }

  console.log(`[transcription] Completed meeting ${meetingId}`);
}

export async function failTranscriptionJob(
  db: TranscriptionDb,
  meetingId: string,
  error: unknown
) {
  const message = error instanceof Error ? error.message : "Processing failed";
  console.error(`[transcription] Failed meeting ${meetingId}:`, message);

  await db
    .update(meetings)
    .set({
      status: "failed",
      errorMessage: message,
      updatedAt: new Date(),
      transcriptionStartedAt: null,
    })
    .where(eq(meetings.id, meetingId));
}
