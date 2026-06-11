import { readFile, stat } from "fs/promises";
import path from "path";
import { WHISPER_MAX_BYTES } from "@/lib/uploads";
import {
  cleanupTempSegments,
  splitAudioForWhisper,
} from "@/lib/ai/transcription/audio-prep";

/** Stay under OpenAI's 25MB limit with headroom for container overhead. */
const WHISPER_SEGMENT_MAX_BYTES = 24 * 1024 * 1024;

function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".ogg") return "audio/ogg";
  return "audio/webm";
}

async function transcribeSegment(apiKey: string, segmentPath: string): Promise<string> {
  const buffer = await readFile(segmentPath);
  if (buffer.length > WHISPER_MAX_BYTES) {
    throw new Error(
      `Audio segment is ${Math.round(buffer.length / 1024 / 1024)}MB but Whisper accepts at most ${WHISPER_MAX_BYTES / 1024 / 1024}MB per request`
    );
  }

  const ext = path.extname(segmentPath) || ".webm";
  const mime = mimeForPath(segmentPath);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), `audio${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { text?: string };
  if (!data.text?.trim()) throw new Error("Whisper returned an empty transcript segment");
  return data.text.trim();
}

export async function transcribeAudioFile(audioPath: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for Whisper transcription");

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  const fullPath = path.join(uploadDir, audioPath);
  const fileStat = await stat(fullPath);

  if (fileStat.size <= WHISPER_SEGMENT_MAX_BYTES) {
    return transcribeSegment(apiKey, fullPath);
  }

  const { segments, tempDir } = await splitAudioForWhisper(fullPath, WHISPER_SEGMENT_MAX_BYTES);

  try {
    const parts: string[] = [];
    for (let index = 0; index < segments.length; index++) {
      const segmentPath = segments[index]!;
      try {
        parts.push(await transcribeSegment(apiKey, segmentPath));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transcription failed";
        throw new Error(`Segment ${index + 1}/${segments.length}: ${message}`);
      }
    }

    const transcript = parts.join("\n\n").trim();
    if (!transcript) throw new Error("Whisper returned an empty transcript");
    return transcript;
  } finally {
    await cleanupTempSegments(tempDir);
  }
}
