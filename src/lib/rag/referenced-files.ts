import type {
  AiConversationFile,
  AiProjectFile,
  RagCitation,
  RagSourceType,
  ReferencedFile,
  ReferencedFileSourceCategory,
} from "@/lib/db/schema";
import { RAG_SOURCE_TYPES, buildCitationHref } from "@/lib/rag/types";
import type { RetrievedRagChunk } from "@/lib/rag/types";

const FILE_SOURCE_TYPES = new Set<RagSourceType>([
  RAG_SOURCE_TYPES.AI_PROJECT_FILE,
  RAG_SOURCE_TYPES.AI_CONVERSATION_FILE,
  RAG_SOURCE_TYPES.TASK_ATTACHMENT,
]);

export function sourceTypeToCategory(
  sourceType: RagSourceType
): ReferencedFileSourceCategory | null {
  if (sourceType === RAG_SOURCE_TYPES.AI_PROJECT_FILE) return "project_file";
  if (sourceType === RAG_SOURCE_TYPES.AI_CONVERSATION_FILE) return "conversation_file";
  if (sourceType === RAG_SOURCE_TYPES.TASK_ATTACHMENT) return "ticket_attachment";
  return null;
}

export function categoryLabel(category: ReferencedFileSourceCategory): string {
  switch (category) {
    case "project_file":
      return "Project file";
    case "conversation_file":
      return "Conversation file";
    case "ticket_attachment":
      return "Ticket attachment";
  }
}

function resolveFilename(chunk: RetrievedRagChunk): string {
  const meta = chunk.metadata;
  if (typeof meta.filename === "string" && meta.filename.trim()) return meta.filename;
  if (typeof meta.displayTitle === "string" && meta.displayTitle.trim()) {
    return meta.displayTitle;
  }
  return chunk.title;
}

function resolvePageLabel(chunk: RetrievedRagChunk): string | undefined {
  const meta = chunk.metadata;
  if (typeof meta.pageNumber === "number") return `Page ${meta.pageNumber}`;
  if (typeof meta.slideNumber === "number") return `Slide ${meta.slideNumber}`;
  if (chunk.chunkIndex > 0) return `Section ${chunk.chunkIndex + 1}`;
  return undefined;
}

function resolveFileHref(chunk: RetrievedRagChunk): string {
  if (chunk.sourceType === RAG_SOURCE_TYPES.TASK_ATTACHMENT) {
    const taskKey =
      typeof chunk.metadata.taskKey === "string" ? chunk.metadata.taskKey : undefined;
    if (taskKey) return `/tasks/${taskKey}`;
  }
  return buildCitationHref(chunk.sourceType, chunk.metadata);
}

export function buildReferencedFilesFromChunks(chunks: RetrievedRagChunk[]): ReferencedFile[] {
  const byKey = new Map<string, ReferencedFile>();

  for (const chunk of chunks) {
    const category = sourceTypeToCategory(chunk.sourceType);
    if (!category) continue;

    const key = `${chunk.sourceType}:${chunk.sourceId}`;
    const filename = resolveFilename(chunk);
    const excerpt =
      chunk.content.length > 160 ? `${chunk.content.slice(0, 160).trim()}…` : chunk.content;
    const pageLabel = resolvePageLabel(chunk);

    const existing = byKey.get(key);
    if (existing) {
      if (!existing.preview && excerpt) existing.preview = excerpt;
      if (!existing.pageLabel && pageLabel) existing.pageLabel = pageLabel;
      continue;
    }

    byKey.set(key, {
      id: chunk.sourceId,
      filename,
      mimeType: chunk.mimeType,
      sourceCategory: category,
      href: resolveFileHref(chunk),
      preview: excerpt,
      pageLabel,
      taskKey:
        typeof chunk.metadata.taskKey === "string" ? chunk.metadata.taskKey : undefined,
      aiProjectId: chunk.aiProjectId,
      aiConversationId: chunk.aiConversationId,
    });
  }

  return [...byKey.values()].sort((a, b) => a.filename.localeCompare(b.filename));
}

export function buildReferencedFilesFromAiFiles(
  projectFiles: AiProjectFile[],
  conversationFiles: AiConversationFile[]
): ReferencedFile[] {
  const files: ReferencedFile[] = [
    ...projectFiles.map((file) => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      sourceCategory: "project_file" as const,
      href: `/uploads/${file.path}`,
      preview: file.textPreview
        ? file.textPreview.length > 160
          ? `${file.textPreview.slice(0, 160).trim()}…`
          : file.textPreview
        : undefined,
      aiProjectId: file.projectId,
    })),
    ...conversationFiles.map((file) => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      sourceCategory: "conversation_file" as const,
      href: `/uploads/${file.path}`,
      preview: file.textPreview
        ? file.textPreview.length > 160
          ? `${file.textPreview.slice(0, 160).trim()}…`
          : file.textPreview
        : undefined,
      aiConversationId: file.conversationId,
    })),
  ];

  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}

export function enrichCitationFromChunk(
  chunk: RetrievedRagChunk,
  citation: RagCitation
): RagCitation {
  const category = sourceTypeToCategory(chunk.sourceType);
  return {
    ...citation,
    filename: resolveFilename(chunk),
    mimeType: chunk.mimeType,
    sourceCategory: category ?? undefined,
    pageLabel: resolvePageLabel(chunk),
  };
}

export function isFileSourceType(sourceType: RagSourceType): boolean {
  return FILE_SOURCE_TYPES.has(sourceType);
}

export function formatReferencedFilenames(files: ReferencedFile[]): string {
  return files.map((file) => `**${file.filename}**`).join(", ");
}
