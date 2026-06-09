import type { AiConversationFile, AiProjectFile, RagCitation } from "@/lib/db/schema";
import { buildFileContextBlock } from "@/lib/ai/file-context";
import { ensureAiFilesIndexed } from "@/lib/rag/indexer";
import { embedQuery } from "@/lib/rag/embeddings";
import { searchSimilarChunks } from "@/lib/rag/store";
import {
  RAG_DEFAULT_TOP_K,
  RAG_MAX_CONTEXT_CHARS,
  RAG_SOURCE_TYPES,
  buildCitationHref,
  isRagEnabled,
  type RagContextResult,
  type RetrievedRagChunk,
} from "@/lib/rag/types";

function dedupeChunks(chunks: RetrievedRagChunk[]) {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = `${chunk.sourceType}:${chunk.sourceId}:${chunk.chunkIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function trimChunksToBudget(chunks: RetrievedRagChunk[], maxChars: number) {
  const selected: RetrievedRagChunk[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const next = chunk.content.length + 120;
    if (used + next > maxChars && selected.length) break;
    selected.push(chunk);
    used += next;
  }

  return selected;
}

export function buildRagContextBlock(chunks: RetrievedRagChunk[]): {
  contextBlock: string;
  citations: RagCitation[];
} {
  const citations: RagCitation[] = [];

  const sections = chunks.map((chunk, index) => {
    const citationNumber = index + 1;
    const filePath =
      typeof chunk.metadata.filePath === "string" ? chunk.metadata.filePath : undefined;
    const excerpt =
      chunk.content.length > 240 ? `${chunk.content.slice(0, 240).trim()}…` : chunk.content;

    citations.push({
      chunkId: chunk.id,
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      title: chunk.title,
      excerpt,
      href: buildCitationHref(chunk.sourceType, filePath),
    });

    return `[${citationNumber}] **${chunk.title}** (${chunk.sourceType}, score ${chunk.similarity.toFixed(2)})\n${chunk.content}`;
  });

  const contextBlock = [
    "## Retrieved knowledge (cite sources as [1], [2], …)",
    "Use only the excerpts below when answering questions about uploaded files. If the answer is not in these excerpts, say so.",
    "",
    sections.join("\n\n---\n\n"),
  ].join("\n");

  return { contextBlock, citations };
}

export async function retrieveChatKnowledge(input: {
  userId: string;
  query: string;
  projectId: string | null;
  conversationId: string | null;
  projectFiles: AiProjectFile[];
  conversationFiles: AiConversationFile[];
  limit?: number;
}): Promise<RagContextResult> {
  const fallbackBlock = buildFileContextBlock(input.projectFiles, input.conversationFiles);

  if (!isRagEnabled()) {
    return {
      contextBlock: fallbackBlock,
      citations: [],
      usedRag: false,
    };
  }

  const hasFiles = input.projectFiles.length > 0 || input.conversationFiles.length > 0;
  if (!hasFiles) {
    return { contextBlock: "", citations: [], usedRag: false };
  }

  await ensureAiFilesIndexed(input.projectFiles, input.conversationFiles);

  const queryEmbedding = await embedQuery(input.query);
  if (!queryEmbedding.length) {
    return {
      contextBlock: fallbackBlock,
      citations: [],
      usedRag: false,
    };
  }

  const projectResults = input.projectId
    ? await searchSimilarChunks({
        userId: input.userId,
        queryEmbedding,
        aiProjectId: input.projectId,
        sourceTypes: [RAG_SOURCE_TYPES.AI_PROJECT_FILE],
        limit: input.limit ?? RAG_DEFAULT_TOP_K,
      })
    : [];

  const conversationResults = input.conversationId
    ? await searchSimilarChunks({
        userId: input.userId,
        queryEmbedding,
        aiConversationId: input.conversationId,
        sourceTypes: [RAG_SOURCE_TYPES.AI_CONVERSATION_FILE],
        limit: input.limit ?? RAG_DEFAULT_TOP_K,
      })
    : [];

  const merged = dedupeChunks(
    [...projectResults, ...conversationResults].sort((a, b) => b.similarity - a.similarity)
  );

  if (!merged.length) {
    return {
      contextBlock: fallbackBlock,
      citations: [],
      usedRag: false,
    };
  }

  const trimmed = trimChunksToBudget(merged, RAG_MAX_CONTEXT_CHARS);
  const { contextBlock, citations } = buildRagContextBlock(trimmed);

  return {
    contextBlock,
    citations,
    usedRag: true,
  };
}
