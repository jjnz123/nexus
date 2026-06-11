import { createWriteStream } from "fs";
import { appendFile, mkdir, rename, stat, unlink } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

export const maxDuration = 300;

const chunkSchema = z.object({
  uploadId: z.string().uuid(),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().min(1).max(500),
  filename: z.string().min(1).max(255),
});

function safeExtension(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (!ext || ext.length > 8) return ".webm";
  if (!/^\.[a-z0-9]+$/.test(ext)) return ".webm";
  return ext;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Chunk too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file chunk" }, { status: 400 });
  }

  const parsed = chunkSchema.safeParse({
    uploadId: formData.get("uploadId"),
    chunkIndex: Number(formData.get("chunkIndex")),
    totalChunks: Number(formData.get("totalChunks")),
    filename: formData.get("filename"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid chunk metadata" }, { status: 400 });
  }

  const { uploadId, chunkIndex, totalChunks, filename } = parsed.data;
  if (chunkIndex >= totalChunks) {
    return NextResponse.json({ error: "Invalid chunk index" }, { status: 400 });
  }

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  const partialDir = path.join(uploadDir, ".partial");
  await mkdir(partialDir, { recursive: true });
  await mkdir(uploadDir, { recursive: true });

  const partialPath = path.join(partialDir, `${session.user.id}-${uploadId}.part`);

  if (chunkIndex === 0) {
    const stream = Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(stream, createWriteStream(partialPath));
  } else {
    const existing = await stat(partialPath).catch(() => null);
    if (!existing) {
      return NextResponse.json({ error: "Upload session expired — please retry" }, { status: 409 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    await appendFile(partialPath, buffer);
  }

  if (chunkIndex < totalChunks - 1) {
    return NextResponse.json({ complete: false, received: chunkIndex + 1 });
  }

  const partialStat = await stat(partialPath);
  if (partialStat.size > MAX_UPLOAD_BYTES) {
    await unlink(partialPath).catch(() => undefined);
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }

  const ext = safeExtension(filename);
  const finalName = `${session.user.id}-${Date.now()}${ext}`;
  const finalPath = path.join(uploadDir, finalName);
  await rename(partialPath, finalPath);

  return NextResponse.json({
    complete: true,
    path: finalName,
    size: partialStat.size,
  });
}
