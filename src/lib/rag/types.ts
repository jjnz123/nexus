import type { RagCitation, RagScope, RagSearchScope, RagSourceType, ReferencedFile } from "@/lib/db/schema";

export const RAG_SOURCE_TYPES = {
  AI_PROJECT_FILE: "ai_project_file",
  AI_CONVERSATION_FILE: "ai_conversation_file",
  TASK_ATTACHMENT: "task_attachment",
  USER_NOTE: "user_note",
  MEETING_TRANSCRIPT: "meeting_transcript",
  MEETING_SUMMARY: "meeting_summary",
  MEETING_ACTION_ITEM: "meeting_action_item",
  TASK: "task",
} as const satisfies Record<string, RagSourceType>;

export const RAG_EMBEDDING_MODEL = "text-embedding-3-small";
export const RAG_EMBEDDING_DIMENSIONS = 1536;
export const RAG_DEFAULT_TOP_K = 8;
export const RAG_HYBRID_CANDIDATE_LIMIT = 20;
export const RAG_MAX_CONTEXT_CHARS = 12_000;
export const RAG_MIN_SIMILARITY = 0.2;
export const RAG_FULL_TEXT_MAX_BYTES = 2_000_000;
export const DEFAULT_RAG_SEARCH_SCOPES: RagSearchScope[] = [
  "files",
  "notes",
  "meetings",
  "tasks",
];

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
  keywordScore?: number;
  vectorScore?: number;
  fusedScore?: number;
};

export type RagSearchFilters = {
  kanbanProjectId?: string | null;
  meetingDateFrom?: string | null;
  meetingDateTo?: string | null;
  meetingLabels?: string[];
  noteLanguage?: string | null;
};

export type RagRetrievalDebugChunk = {
  chunkId: string;
  sourceType: RagSourceType;
  sourceId: string;
  chunkIndex: number;
  title: string;
  contentPreview: string;
  vectorScore: number | null;
  keywordScore: number | null;
  fusedScore: number | null;
  rankAfterFusion: number;
  usedInContext: boolean;
};

export type RagRetrievalDebug = {
  originalQuery: string;
  retrievalQuery: string;
  timingsMs: {
    rewrite: number;
    embed: number;
    vectorSearch: number;
    keywordSearch: number;
    fusion: number;
    total: number;
  };
  counts: {
    vector: number;
    keyword: number;
    fused: number;
    used: number;
  };
  chunks: RagRetrievalDebugChunk[];
};

export type RagContextResult = {
  contextBlock: string;
  citations: RagCitation[];
  referencedFiles: ReferencedFile[];
  usedRag: boolean;
  retrievalQuery?: string;
  debug?: RagRetrievalDebug;
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

export type RagTextIndexInput = {
  userId: string;
  sourceType: RagSourceType;
  sourceId: string;
  title: string;
  text: string;
  scope?: RagScope;
  mimeType?: string | null;
  aiProjectId?: string | null;
  aiConversationId?: string | null;
  meetingId?: string | null;
  noteId?: string | null;
  taskId?: string | null;
  kanbanProjectId?: string | null;
  metadata?: Record<string, unknown>;
  chunkStrategy?: "document" | "markdown";
};

export type RagSearchInput = {
  userId: string;
  query: string;
  queryEmbedding: number[];
  scopes: RagSearchScope[];
  includeOrgTasks?: boolean;
  adminMode?: boolean;
  aiProjectId?: string | null;
  aiConversationId?: string | null;
  meetingId?: string | null;
  filters?: RagSearchFilters;
  limit?: number;
  minSimilarity?: number;
};

export type RagChunkAdminRow = {
  id: string;
  sourceType: RagSourceType;
  sourceId: string;
  chunkIndex: number;
  title: string;
  contentPreview: string;
  metadata: Record<string, unknown>;
  indexedAt: string;
};

export function isRagEnabled() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function scopesToSourceTypes(scopes: RagSearchScope[]): RagSourceType[] {
  const types: RagSourceType[] = [];
  if (scopes.includes("files")) {
    types.push(RAG_SOURCE_TYPES.AI_PROJECT_FILE, RAG_SOURCE_TYPES.AI_CONVERSATION_FILE);
  }
  if (scopes.includes("notes")) types.push(RAG_SOURCE_TYPES.USER_NOTE);
  if (scopes.includes("meetings")) {
    types.push(
      RAG_SOURCE_TYPES.MEETING_TRANSCRIPT,
      RAG_SOURCE_TYPES.MEETING_SUMMARY,
      RAG_SOURCE_TYPES.MEETING_ACTION_ITEM
    );
  }
  if (scopes.includes("tasks")) {
    types.push(RAG_SOURCE_TYPES.TASK, RAG_SOURCE_TYPES.TASK_ATTACHMENT);
  }
  return types;
}

export function buildCitationHref(
  sourceType: RagSourceType,
  metadata: Record<string, unknown>
): string {
  if (typeof metadata.filePath === "string") {
    return `/uploads/${metadata.filePath}`;
  }
  if (sourceType === "user_note") return "/notes";
  if (
    sourceType === "meeting_transcript" ||
    sourceType === "meeting_summary" ||
    sourceType === "meeting_action_item"
  ) {
    const meetingId =
      typeof metadata.meetingId === "string" ? metadata.meetingId : undefined;
    return meetingId ? `/meetings/${meetingId}` : "/meetings";
  }
  if (sourceType === "task" && typeof metadata.taskKey === "string") {
    return `/tasks/${metadata.taskKey}`;
  }
  if (sourceType === "task_attachment" && typeof metadata.taskKey === "string") {
    return `/tasks/${metadata.taskKey}`;
  }
  return "/chat";
}

export function normalizeSearchScopes(scopes?: RagSearchScope[] | null): RagSearchScope[] {
  if (!scopes?.length) return [...DEFAULT_RAG_SEARCH_SCOPES];
  const allowed = new Set(DEFAULT_RAG_SEARCH_SCOPES);
  const normalized = scopes.filter((scope) => allowed.has(scope));
  return normalized.length ? normalized : [...DEFAULT_RAG_SEARCH_SCOPES];
}
