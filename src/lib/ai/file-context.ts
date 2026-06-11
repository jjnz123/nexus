import type { AiConversationFile, AiProjectFile } from "@/lib/db/schema";
import { extractDocumentTextPreview } from "@/lib/files/document-text";

export async function extractTextPreview(
  filePath: string,
  mimeType: string,
  filename: string
): Promise<string | null> {
  return extractDocumentTextPreview(filePath, mimeType, filename);
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
