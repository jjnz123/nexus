import type { RagCitation, RagSourceType } from "@/lib/db/schema";

export const RAG_SOURCE_TYPES = {
  AI_PROJECT_FILE: "ai_project_file",
  AI_CONVERSATION_FILE: "ai_conversation_file",
} as const satisfies Record<string, RagSourceType>;

export const RAG_EMBEDDING_MODEL = "text-embedding-3-small";
export const RAG_EMBEDDING_DIMENSIONS = 1536;
export const RAG_DEFAULT_TOP_K = 8;
export const RAG_MAX_CONTEXT_CHARS = 12_000;
export const RAG_MIN_SIMILARITY = 0.25;
export const RAG_FULL_TEXT_MAX_BYTES = 2_000_000;

export type RagChunkInput = {
  chunkIndex: number;
  content: string;
  tokenEstimate?: number;
};

export type RetrievedRagChunk = {
  id: string;
  sourceType: RagSourceType;
  sourceId: string;
  chunkIndex: number;
  content: string;
  title: string;
  mimeType: string | null;
  aiProjectId: string | null;
  aiConversationId: string | null;
  metadata: Record<string, unknown>;
  similarity: number;
};

export type RagContextResult = {
  contextBlock: string;
  citations: RagCitation[];
  usedRag: boolean;
};

export type RagIndexInput = {
  userId: string;
  sourceType: RagSourceType;
  sourceId: string;
  title: string;
  mimeType: string;
  filePath: string;
  aiProjectId?: string | null;
  aiConversationId?: string | null;
  metadata?: Record<string, unknown>;
};

export function isRagEnabled() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function buildCitationHref(
  sourceType: RagSourceType,
  filePath: string | undefined
): string {
  if (filePath) return `/uploads/${filePath}`;
  return "/chat";
}
