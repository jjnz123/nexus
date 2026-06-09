import { readFile } from "fs/promises";
import path from "path";

export async function transcribeAudioFile(audioPath: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for Whisper transcription");

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  const fullPath = path.join(uploadDir, audioPath);
  const buffer = await readFile(fullPath);
  const ext = path.extname(audioPath) || ".webm";
  const mime =
    ext === ".mp3"
      ? "audio/mpeg"
      : ext === ".wav"
        ? "audio/wav"
        : ext === ".m4a"
          ? "audio/mp4"
          : "audio/webm";

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
  if (!data.text?.trim()) throw new Error("Whisper returned an empty transcript");
  return data.text.trim();
}
