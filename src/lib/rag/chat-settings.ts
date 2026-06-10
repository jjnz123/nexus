import type { RagSearchScope } from "@/lib/db/schema";
import {
  DEFAULT_RAG_SEARCH_SCOPES,
  normalizeSearchScopes,
  type RagSearchFilters,
} from "@/lib/rag/types";

export type ChatRagSettings = {
  scopes: RagSearchScope[];
  filters: RagSearchFilters;
};

const STORAGE_KEY = "nexus:rag-settings";

const EMPTY_FILTERS: RagSearchFilters = {
  kanbanProjectId: null,
  meetingDateFrom: null,
  meetingDateTo: null,
  meetingLabels: [],
  noteLanguage: null,
  taskDateFrom: null,
  taskDateTo: null,
};

export function defaultChatRagSettings(): ChatRagSettings {
  return {
    scopes: [...DEFAULT_RAG_SEARCH_SCOPES],
    filters: { ...EMPTY_FILTERS },
  };
}

export function loadChatRagSettings(): ChatRagSettings {
  if (typeof window === "undefined") return defaultChatRagSettings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultChatRagSettings();
    const parsed = JSON.parse(raw) as Partial<ChatRagSettings>;
    return {
      scopes: normalizeSearchScopes(parsed.scopes),
      filters: {
        ...EMPTY_FILTERS,
        ...(parsed.filters ?? {}),
        meetingLabels: parsed.filters?.meetingLabels ?? [],
      },
    };
  } catch {
    return defaultChatRagSettings();
  }
}

export function saveChatRagSettings(settings: ChatRagSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function hasActiveRagFilters(filters: RagSearchFilters) {
  return Boolean(
    filters.kanbanProjectId ||
      filters.meetingDateFrom ||
      filters.meetingDateTo ||
      filters.meetingLabels?.length ||
      filters.noteLanguage ||
      filters.taskDateFrom ||
      filters.taskDateTo
  );
}
