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
              : "application/octet-stream";
    return new NextResponse(buffer, { headers: { "Content-Type": type } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
