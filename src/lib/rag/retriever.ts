import type { AiConversationFile, AiProjectFile, RagCitation, RagSearchScope } from "@/lib/db/schema";
import { buildFileContextBlock } from "@/lib/ai/file-context";
import { embedQuery } from "@/lib/rag/embeddings";
import { reciprocalRankFusion, rerankByScore } from "@/lib/rag/hybrid";
import { ensureAiFilesIndexed } from "@/lib/rag/indexer";
import { rewriteRetrievalQuery } from "@/lib/rag/query-rewrite";
import {
  buildReferencedFilesFromAiFiles,
  buildReferencedFilesFromChunks,
  categoryLabel,
  enrichCitationFromChunk,
  formatReferencedFilenames,
  sourceTypeToCategory,
} from "@/lib/rag/referenced-files";
import {
  logRetrievalRun,
  searchKeywordChunks,
  searchVectorChunks,
} from "@/lib/rag/store";
import {
  RAG_DEFAULT_TOP_K,
  RAG_HYBRID_CANDIDATE_LIMIT,
  RAG_MAX_CONTEXT_CHARS,
  buildCitationHref,
  isRagEnabled,
  normalizeSearchScopes,
  type RagContextResult,
  type RagRetrievalDebug,
  type RagSearchFilters,
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
  referencedFiles: ReturnType<typeof buildReferencedFilesFromChunks>;
} {
  const citations: RagCitation[] = [];
  const referencedFiles = buildReferencedFilesFromChunks(chunks);

  const sections = chunks.map((chunk, index) => {
    const citationNumber = index + 1;
    const excerpt =
      chunk.content.length > 240 ? `${chunk.content.slice(0, 240).trim()}…` : chunk.content;
    const filename =
      typeof chunk.metadata.filename === "string" ? chunk.metadata.filename : chunk.title;
    const category = sourceTypeToCategory(chunk.sourceType);
    const categoryLabelText = category ? categoryLabel(category) : chunk.sourceType;

    citations.push(
      enrichCitationFromChunk(chunk, {
        chunkId: chunk.id,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        title: chunk.title,
        excerpt,
        href: buildCitationHref(chunk.sourceType, chunk.metadata),
      })
    );

    const scoreLabel = chunk.fusedScore ?? chunk.similarity;
    return `[${citationNumber}] **${filename}** (${categoryLabelText}, score ${scoreLabel.toFixed(3)})\n${chunk.content}`;
  });

  const fileList =
    referencedFiles.length > 0
      ? [
          "### Files available in this context",
          ...referencedFiles.map(
            (file) =>
              `- **${file.filename}** (${categoryLabel(file.sourceCategory)})`
          ),
          "",
          "When your answer uses content from these files, begin by naming the specific filenames (e.g. \"Based on **Requirements_v3.pdf** and **Architecture_Diagram.pptx**...\").",
        ].join("\n")
      : null;

  const contextBlock = [
    "## Retrieved knowledge (cite sources as [1], [2], …)",
    "Use the excerpts below when answering. If the answer is not supported by these sources, say so.",
    fileList,
    referencedFiles.length
      ? `Retrieved files: ${formatReferencedFilenames(referencedFiles)}.`
      : null,
    "",
    sections.join("\n\n---\n\n"),
  ]
    .filter(Boolean)
    .join("\n");

  return { contextBlock, citations, referencedFiles };
}

function buildRetrievalDebug(input: {
  originalQuery: string;
  retrievalQuery: string;
  timingsMs: RagRetrievalDebug["timingsMs"];
  vectorResults: RetrievedRagChunk[];
  keywordResults: RetrievedRagChunk[];
  fused: RetrievedRagChunk[];
  trimmed: RetrievedRagChunk[];
}): RagRetrievalDebug {
  const usedIds = new Set(input.trimmed.map((chunk) => chunk.id));
  const vectorById = new Map(input.vectorResults.map((chunk) => [chunk.id, chunk]));
  const keywordById = new Map(input.keywordResults.map((chunk) => [chunk.id, chunk]));

  return {
    originalQuery: input.originalQuery,
    retrievalQuery: input.retrievalQuery,
    timingsMs: input.timingsMs,
    counts: {
      vector: input.vectorResults.length,
      keyword: input.keywordResults.length,
      fused: input.fused.length,
      used: input.trimmed.length,
    },
    chunks: input.fused.map((chunk, index) => {
      const vector = vectorById.get(chunk.id);
      const keyword = keywordById.get(chunk.id);
      return {
        chunkId: chunk.id,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        chunkIndex: chunk.chunkIndex,
        title: chunk.title,
        contentPreview:
          chunk.content.length > 200 ? `${chunk.content.slice(0, 200).trim()}…` : chunk.content,
        vectorScore: vector?.vectorScore ?? vector?.similarity ?? null,
        keywordScore: keyword?.keywordScore ?? keyword?.similarity ?? chunk.keywordScore ?? null,
        fusedScore: chunk.fusedScore ?? chunk.similarity ?? null,
        rankAfterFusion: index + 1,
        usedInContext: usedIds.has(chunk.id),
      };
    }),
  };
}

export async function retrievePortalKnowledge(input: {
  userId: string;
  query: string;
  scopes?: RagSearchScope[];
  includeOrgTasks?: boolean;
  projectId?: string | null;
  conversationId?: string | null;
  meetingId?: string | null;
  filters?: RagSearchFilters;
  projectFiles?: AiProjectFile[];
  conversationFiles?: AiConversationFile[];
  limit?: number;
  context?: string;
  rewriteQuery?: boolean;
  adminMode?: boolean;
  includeDebug?: boolean;
}): Promise<RagContextResult> {
  const startedAt = Date.now();
  const scopes = normalizeSearchScopes(input.scopes);
  const fallbackBlock =
    input.projectFiles || input.conversationFiles
      ? buildFileContextBlock(input.projectFiles ?? [], input.conversationFiles ?? [])
      : "";
  const fallbackReferencedFiles =
    input.projectFiles || input.conversationFiles
      ? buildReferencedFilesFromAiFiles(input.projectFiles ?? [], input.conversationFiles ?? [])
      : [];

  if (!isRagEnabled()) {
    return {
      contextBlock: fallbackBlock,
      citations: [],
      referencedFiles: fallbackReferencedFiles,
      usedRag: false,
    };
  }

  if (input.projectFiles?.length || input.conversationFiles?.length) {
    await ensureAiFilesIndexed(input.projectFiles ?? [], input.conversationFiles ?? []);
  }

  const timings = {
    rewrite: 0,
    embed: 0,
    vectorSearch: 0,
    keywordSearch: 0,
    fusion: 0,
    total: 0,
  };

  const rewriteStarted = Date.now();
  const retrievalQuery = input.rewriteQuery
    ? await rewriteRetrievalQuery(input.query)
    : input.query;
  timings.rewrite = Date.now() - rewriteStarted;

  const embedStarted = Date.now();
  const queryEmbedding = await embedQuery(retrievalQuery);
  timings.embed = Date.now() - embedStarted;

  if (!queryEmbedding.length) {
    return {
      contextBlock: fallbackBlock,
      citations: [],
      referencedFiles: fallbackReferencedFiles,
      usedRag: false,
      retrievalQuery,
    };
  }

  const searchInput = {
    userId: input.userId,
    query: retrievalQuery,
    queryEmbedding,
    scopes,
    includeOrgTasks: input.includeOrgTasks ?? scopes.includes("tasks"),
    adminMode: input.adminMode ?? false,
    aiProjectId: input.projectId ?? null,
    aiConversationId: input.conversationId ?? null,
    meetingId: input.meetingId ?? null,
    filters: input.filters,
    limit: input.limit ?? RAG_HYBRID_CANDIDATE_LIMIT,
  };

  const vectorStarted = Date.now();
  const vectorPromise = searchVectorChunks(searchInput).then((results) => {
    timings.vectorSearch = Date.now() - vectorStarted;
    return results;
  });

  const keywordStarted = Date.now();
  const keywordPromise = searchKeywordChunks(searchInput).then((results) => {
    timings.keywordSearch = Date.now() - keywordStarted;
    return results;
  });

  const [vectorResults, keywordResults] = await Promise.all([vectorPromise, keywordPromise]);

  const fusionStarted = Date.now();
  const fused = rerankByScore(
    dedupeChunks(reciprocalRankFusion(vectorResults, keywordResults))
  ).slice(0, input.limit ?? RAG_DEFAULT_TOP_K);
  timings.fusion = Date.now() - fusionStarted;
  timings.total = Date.now() - startedAt;

  if (!fused.length) {
    await logRetrievalRun({
      userId: input.userId,
      query: input.query,
      rewrittenQuery: retrievalQuery,
      context: input.context ?? "chat",
      scopes,
      filters: input.filters,
      vectorCount: vectorResults.length,
      keywordCount: keywordResults.length,
      fusedCount: 0,
      usedCount: 0,
      durationMs: timings.total,
      success: false,
      vectorResults,
      keywordResults,
      fusedResults: [],
      usedChunks: [],
    }).catch(() => undefined);

    return {
      contextBlock: fallbackBlock,
      citations: [],
      referencedFiles: fallbackReferencedFiles,
      usedRag: false,
      retrievalQuery,
      debug: input.includeDebug
        ? buildRetrievalDebug({
            originalQuery: input.query,
            retrievalQuery,
            timingsMs: timings,
            vectorResults,
            keywordResults,
            fused: [],
            trimmed: [],
          })
        : undefined,
    };
  }

  const trimmed = trimChunksToBudget(fused, RAG_MAX_CONTEXT_CHARS);
  const { contextBlock, citations, referencedFiles } = buildRagContextBlock(trimmed);

  await logRetrievalRun({
    userId: input.userId,
    query: input.query,
    rewrittenQuery: retrievalQuery,
    context: input.context ?? "chat",
    scopes,
    filters: input.filters,
    vectorCount: vectorResults.length,
    keywordCount: keywordResults.length,
    fusedCount: fused.length,
    usedCount: trimmed.length,
    durationMs: timings.total,
    success: true,
    vectorResults,
    keywordResults,
    fusedResults: fused,
    usedChunks: trimmed,
  }).catch(() => undefined);

  return {
    contextBlock,
    citations,
    referencedFiles,
    usedRag: true,
    retrievalQuery,
    debug: input.includeDebug
      ? buildRetrievalDebug({
          originalQuery: input.query,
          retrievalQuery,
          timingsMs: timings,
          vectorResults,
          keywordResults,
          fused,
          trimmed,
        })
      : undefined,
  };
}

export async function retrieveChatKnowledge(input: {
  userId: string;
  query: string;
  projectId: string | null;
  conversationId: string | null;
  projectFiles: AiProjectFile[];
  conversationFiles: AiConversationFile[];
  scopes?: RagSearchScope[];
  includeOrgTasks?: boolean;
  filters?: RagSearchFilters;
  limit?: number;
}): Promise<RagContextResult> {
  return retrievePortalKnowledge({
    userId: input.userId,
    query: input.query,
    scopes: input.scopes,
    includeOrgTasks: input.includeOrgTasks,
    filters: input.filters,
    projectId: input.projectId,
    conversationId: input.conversationId,
    projectFiles: input.projectFiles,
    conversationFiles: input.conversationFiles,
    limit: input.limit,
    context: "chat",
    rewriteQuery: true,
  });
}

export async function retrieveMeetingKnowledge(input: {
  userId: string;
  meetingId: string;
  query: string;
}): Promise<RagContextResult> {
  return retrievePortalKnowledge({
    userId: input.userId,
    query: input.query,
    scopes: ["meetings"],
    meetingId: input.meetingId,
    context: "meeting",
    rewriteQuery: true,
  });
}
