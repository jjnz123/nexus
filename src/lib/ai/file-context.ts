import { readFile } from "fs/promises";
import path from "path";
import type { AiConversationFile, AiProjectFile } from "@/lib/db/schema";

const TEXT_PREVIEW_MAX = 8000;

export async function extractTextPreview(
  filePath: string,
  mimeType: string,
  filename: string
): Promise<string | null> {
  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  const fullPath = path.join(uploadDir, filePath);

  const isTextLike =
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/csv" ||
    /\.(txt|md|csv|json|log|yaml|yml)$/i.test(filename);

  if (!isTextLike) return null;

  try {
    const raw = await readFile(fullPath, "utf8");
    const normalized = raw.replace(/\r\n/g, "\n").trim();
    if (!normalized) return null;
    return normalized.length > TEXT_PREVIEW_MAX
      ? `${normalized.slice(0, TEXT_PREVIEW_MAX)}…`
      : normalized;
  } catch {
    return null;
  }
}

export function buildFileContextBlock(
  projectFiles: AiProjectFile[],
  conversationFiles: AiConversationFile[]
): string {
  const sections: string[] = [];

  if (projectFiles.length) {
    sections.push(
      "## Project knowledge base files\n" +
        "When using these files, name the specific filenames in your answer.\n\n" +
        projectFiles
          .map((file) => formatFileEntry(file.filename, file.mimeType, file.textPreview))
          .join("\n\n")
    );
  }

  if (conversationFiles.length) {
    sections.push(
      "## Conversation files\n" +
        "When using these files, name the specific filenames in your answer.\n\n" +
        conversationFiles
          .map((file) => formatFileEntry(file.filename, file.mimeType, file.textPreview))
          .join("\n\n")
    );
  }

  return sections.join("\n\n");
}

function formatFileEntry(name: string, mimeType: string, textPreview: string | null) {
  if (textPreview) {
    return `### ${name} (${mimeType})\n${textPreview}`;
  }
  return `### ${name} (${mimeType})\n[Binary or unsupported file — metadata only]`;
}
