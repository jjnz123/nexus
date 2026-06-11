import { readFile } from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";

const TEXT_PREVIEW_MAX = 8000;

function isTextLike(mimeType: string, filename: string) {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/csv" ||
    /\.(txt|md|csv|json|log|yaml|yml)$/i.test(filename)
  );
}

function isPdf(mimeType: string, filename: string) {
  return mimeType === "application/pdf" || /\.pdf$/i.test(filename);
}

async function readPdfText(fullPath: string, maxBytes?: number): Promise<string | null> {
  let parser: PDFParse | null = null;
  try {
    const raw = await readFile(fullPath);
    const buffer = maxBytes && raw.byteLength > maxBytes ? raw.subarray(0, maxBytes) : raw;
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text?.replace(/\r\n/g, "\n").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}

/** Extract full document text for RAG indexing (server-side only). */
export async function extractDocumentText(
  filePath: string,
  mimeType: string,
  filename: string,
  maxBytes?: number
): Promise<string | null> {
  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  const fullPath = path.join(uploadDir, filePath);

  if (isPdf(mimeType, filename)) {
    return readPdfText(fullPath, maxBytes);
  }

  if (!isTextLike(mimeType, filename)) return null;

  try {
    const raw = await readFile(fullPath);
    const slice =
      maxBytes && raw.byteLength > maxBytes ? raw.subarray(0, maxBytes) : raw;
    const normalized = slice.toString("utf8").replace(/\r\n/g, "\n").trim();
    return normalized || null;
  } catch {
    return null;
  }
}

/** Shorter extract for previews / fallback indexing. */
export async function extractDocumentTextPreview(
  filePath: string,
  mimeType: string,
  filename: string
): Promise<string | null> {
  const text = await extractDocumentText(filePath, mimeType, filename, TEXT_PREVIEW_MAX);
  if (!text) return null;
  return text.length > TEXT_PREVIEW_MAX ? `${text.slice(0, TEXT_PREVIEW_MAX)}…` : text;
}
