import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { mkdir, rm, stat } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function probeAudioDuration(fullPath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    fullPath,
  ]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not determine audio duration");
  }
  return duration;
}

export async function splitAudioForWhisper(
  fullPath: string,
  maxSegmentBytes: number
): Promise<{ segments: string[]; tempDir: string }> {
  const fileStat = await stat(fullPath);
  if (fileStat.size <= maxSegmentBytes) {
    return { segments: [fullPath], tempDir: "" };
  }

  const duration = await probeAudioDuration(fullPath);
  const segmentCount = Math.ceil(fileStat.size / maxSegmentBytes);
  const segmentDuration = duration / segmentCount;
  const uploadDir = path.dirname(fullPath);
  const tempDir = path.join(uploadDir, ".tmp", randomUUID());
  await mkdir(tempDir, { recursive: true });

  const ext = path.extname(fullPath) || ".webm";
  const segments: string[] = [];

  for (let index = 0; index < segmentCount; index++) {
    const start = index * segmentDuration;
    const outPath = path.join(tempDir, `segment-${String(index).padStart(3, "0")}${ext}`);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      fullPath,
      "-ss",
      String(start),
      "-t",
      String(segmentDuration),
      "-c",
      "copy",
      outPath,
    ]);
    segments.push(outPath);
  }

  return { segments, tempDir };
}

export async function cleanupTempSegments(tempDir: string) {
  if (!tempDir) return;
  await rm(tempDir, { recursive: true, force: true });
}
