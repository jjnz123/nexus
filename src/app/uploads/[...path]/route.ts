import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;
  const filename = segments.join("/");
  if (filename.includes("..")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  try {
    const buffer = await readFile(path.join(uploadDir, filename));
    const ext = path.extname(filename).toLowerCase();
    const type =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".pdf"
                ? "application/pdf"
                : ext === ".docx"
                  ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  : ext === ".xlsx"
                    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    : ext === ".pptx"
                      ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      : ext === ".txt"
                        ? "text/plain"
                        : ext === ".webm"
                          ? "audio/webm"
                          : ext === ".mp3"
                            ? "audio/mpeg"
                            : ext === ".wav"
                              ? "audio/wav"
                              : ext === ".m4a"
                                ? "audio/mp4"
                                : "application/octet-stream";
    return new NextResponse(buffer, { headers: { "Content-Type": type } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
