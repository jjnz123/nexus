import { readFile } from "fs/promises";
import path from "path";
import type { AiConversationFile, AiProjectFile } from "@/lib/db/schema";
import { extractTextPreview } from "@/lib/ai/file-context";
import { chooseChunkStrategy, chunkDocumentText, hashContent } from "@/lib/rag/chunking";
import { embedTexts } from "@/lib/rag/embeddings";
import {
  deleteChunksForSource,
  deleteRagSource as deleteRagSourceFromStore,
  getIndexState,
  insertChunks,
  upsertIndexState,
} from "@/lib/rag/store";
import {
  RAG_FULL_TEXT_MAX_BYTES,
  RAG_SOURCE_TYPES,
  isRagEnabled,
  type RagIndexInput,
} from "@/lib/rag/types";

export async function extractFullText(
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
    const raw = await readFile(fullPath);
    if (raw.byteLength > RAG_FULL_TEXT_MAX_BYTES) {
      return raw.subarray(0, RAG_FULL_TEXT_MAX_BYTES).toString("utf8");
    }
    const normalized = raw.toString("utf8").replace(/\r\n/g, "\n").trim();
    return normalized || null;
  } catch {
    return null;
  }
}

export async function indexRagSource(input: RagIndexInput) {
  if (!isRagEnabled()) return { indexed: false, reason: "RAG disabled" as const };

  const fullText =
    (await extractFullText(input.filePath, input.mimeType, input.title)) ??
    (await extractTextPreview(input.filePath, input.mimeType, input.title));

  if (!fullText?.trim()) {
    await deleteRagSourceFromStore(input.sourceType, input.sourceId);
    await upsertIndexState({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contentHash: hashContent(""),
      chunkCount: 0,
      status: "failed",
      errorMessage: "No extractable text content",
    });
    return { indexed: false, reason: "no_text" as const };
  }

  const contentHash = hashContent(fullText);
  const existing = await getIndexState(input.sourceType, input.sourceId);
  if (existing?.contentHash === contentHash && existing.status === "indexed") {
    return { indexed: true, skipped: true as const, chunkCount: existing.chunkCount };
  }

  await upsertIndexState({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    contentHash,
    chunkCount: 0,
    status: "pending",
  });

  try {
    const strategy = chooseChunkStrategy(input.title, input.mimeType);
    const chunks = chunkDocumentText(fullText, strategy);
    if (!chunks.length) {
      throw new Error("Chunking produced no segments");
    }

    await deleteChunksForSource(input.sourceType, input.sourceId);

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
    await insertChunks(
      chunks.map((chunk, index) => ({
        userId: input.userId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        contentHash,
        title: input.title,
        mimeType: input.mimeType,
        aiProjectId: input.aiProjectId ?? null,
        aiConversationId: input.aiConversationId ?? null,
        metadata: {
          filePath: input.filePath,
          ...input.metadata,
        },
        tokenEstimate: chunk.tokenEstimate ?? Math.ceil(chunk.content.length / 4),
        embedding: embeddings[index],
      }))
    );

    await upsertIndexState({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contentHash,
      chunkCount: chunks.length,
      status: "indexed",
    });

    return { indexed: true, chunkCount: chunks.length };
  } catch (error) {
    await upsertIndexState({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contentHash,
      chunkCount: 0,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Indexing failed",
    });
    throw error;
  }
}

export async function indexAiProjectFile(file: AiProjectFile) {
  return indexRagSource({
    userId: file.userId,
    sourceType: RAG_SOURCE_TYPES.AI_PROJECT_FILE,
    sourceId: file.id,
    title: file.displayName,
    mimeType: file.mimeType,
    filePath: file.path,
    aiProjectId: file.projectId,
    metadata: { filename: file.filename },
  });
}

export async function indexAiConversationFile(file: AiConversationFile) {
  return indexRagSource({
    userId: file.userId,
    sourceType: RAG_SOURCE_TYPES.AI_CONVERSATION_FILE,
    sourceId: file.id,
    title: file.displayName,
    mimeType: file.mimeType,
    filePath: file.path,
    aiConversationId: file.conversationId,
    metadata: { filename: file.filename },
  });
}

export async function ensureAiFilesIndexed(
  projectFiles: AiProjectFile[],
  conversationFiles: AiConversationFile[]
) {
  if (!isRagEnabled()) return;

  await Promise.all([
    ...projectFiles.map(async (file) => {
      const state = await getIndexState(RAG_SOURCE_TYPES.AI_PROJECT_FILE, file.id);
      if (state?.status === "indexed") return;
      await indexAiProjectFile(file).catch(() => undefined);
    }),
    ...conversationFiles.map(async (file) => {
      const state = await getIndexState(RAG_SOURCE_TYPES.AI_CONVERSATION_FILE, file.id);
      if (state?.status === "indexed") return;
      await indexAiConversationFile(file).catch(() => undefined);
    }),
  ]);
}
