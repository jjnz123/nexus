import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";
import {
  failTranscriptionJob,
  runTranscriptionJob,
} from "../src/server/jobs/transcription-runner";

async function claimNextMeetingId(db: ReturnType<typeof drizzle<typeof schema>>) {
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE meetings
    SET transcription_started_at = now(), updated_at = now()
    WHERE id = (
      SELECT id FROM meetings
      WHERE status = 'processing'
        AND audio_path IS NOT NULL
        AND transcript IS NULL
        AND (
          transcription_started_at IS NULL
          OR transcription_started_at < now() - interval '45 minutes'
        )
      ORDER BY updated_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);

  return rows[0]?.id ?? null;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 5 });
  const db = drizzle(client, { schema });

  console.log("Transcription worker started");

  const tick = async () => {
    try {
      const meetingId = await claimNextMeetingId(db);
      if (!meetingId) return;

      try {
        await runTranscriptionJob(db, meetingId);
      } catch (error) {
        await failTranscriptionJob(db, meetingId, error);
      }
    } catch (err) {
      console.error("Transcription worker cycle error:", err);
    }
  };

  await tick();
  setInterval(tick, 10_000);

  process.on("SIGTERM", async () => {
    await client.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
