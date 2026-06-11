"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bot, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatConversationTabs } from "@/components/chat/ChatConversationTabs";
import { ChatFileManager, type ChatFileManagerTab } from "@/components/chat/ChatFileManager";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import {
  ChatActiveSkillChips,
  ChatSkillsPanel,
  resolveInitialEnabledSkills,
} from "@/components/chat/ChatSkillsPanel";
import { HistoryIndicatorBar, scrollToMessage } from "@/components/chat/HistoryIndicatorBar";
import { ChatRagControls } from "@/components/chat/ChatRagControls";
import { useAiStream } from "@/components/chat/useAiStream";
import {
  loadChatRagSettings,
  saveChatRagSettings,
  type ChatRagSettings,
} from "@/lib/rag/chat-settings";
import { DEFAULT_RAG_SEARCH_SCOPES, type RagSearchFilters } from "@/lib/rag/types";
import type {
  AiConversation,
  AiMessage,
  AiMessageAttachment,
  AiSkillEvent,
  PortalProjectSummary,
  RagCitation,
  RagSearchScope,
  ReferencedFile,
  UserRole,
} from "@/lib/db/schema";
import type { UserPermissionOverrides } from "@/lib/permissions";
import {
  appendAssistantMessage,
  appendUserMessage,
  createAiConversation,
  deleteAiConversation,
  deleteMessageAfter,
  forkConversationAtMessage,
  getConversationMessages,
  getConversationTabGroup,
  getAiWorkspace,
  renameAiConversation,
  setActiveAiSelection,
  updateConversationEnabledSkills,
} from "@/server/actions/ai-chat";
import { updateBookmarkPreferences } from "@/server/actions/preferences";
import {
  isStaleServerActionError,
  staleServerActionMessage,
} from "@/lib/server-action-errors";

const STARTER_PROMPTS = [
  "Summarize what I should check on the home dashboard today",
  "Help me organize my internal bookmarks by team",
  "What should I monitor for a critical internal service?",
];

function messageToApiContent(message: AiMessage): string {
  const attachments = message.attachments ?? [];
  let content = message.content.trim();

  if (attachments.length) {
    const list = attachments.map((file) => `${file.filename} (${file.mimeType})`).join(", ");
    content = content
      ? `${content}\n\n[Attachments: ${list}]`
      : `[User attached files: ${list}]`;
  }

  return content || "(empty message)";
}

export function ChatPage({
  initialProjects,
  initialConversations,
  initialMessages,
  initialProjectId,
  initialConversationId,
  initialSidebarCollapsed,
  userRole,
  userPermissions,
  initialEnabledSkills,
  kanbanProjects = [],
  initialPrompt = null,
}: {
  initialProjects: PortalProjectSummary[];
  initialConversations: AiConversation[];
  initialMessages: AiMessage[];
  initialProjectId: string | null;
  initialConversationId: string | null;
  initialSidebarCollapsed: boolean;
  userRole: UserRole;
  userPermissions: UserPermissionOverrides | null;
  initialEnabledSkills: string[];
  kanbanProjects?: PortalProjectSummary[];
  initialPrompt?: string | null;
}) {
  const { stream } = useAiStream();
  const [projects, setProjects] = useState(initialProjects);
  const [conversations, setConversations] = useState(initialConversations);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId
  );
  const [messages, setMessages] = useState<AiMessage[]>(initialMessages);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AiMessageAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSkills, setStreamingSkills] = useState<AiSkillEvent[]>([]);
  const [streamingCitations, setStreamingCitations] = useState<RagCitation[]>([]);
  const [streamingReferencedFiles, setStreamingReferencedFiles] = useState<ReferencedFile[]>([]);
  const [searchScopes, setSearchScopes] = useState<RagSearchScope[]>([...DEFAULT_RAG_SEARCH_SCOPES]);
  const [searchFilters, setSearchFilters] = useState<RagSearchFilters>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const [filesOpen, setFilesOpen] = useState(false);
  const [fileManagerTab, setFileManagerTab] = useState<ChatFileManagerTab>("conversation");
  const [fileManagerProjectId, setFileManagerProjectId] = useState<string | null>(null);
  const [fileManagerConversationId, setFileManagerConversationId] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [enabledSkillNames, setEnabledSkillNames] = useState(initialEnabledSkills);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [tabConversations, setTabConversations] = useState<AiConversation[]>([]);
  const [, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const conversationIdRef = useRef(activeConversationId);
  const conversationProjectIdRef = useRef<string | null>(initialProjectId);
  const enabledSkillNamesRef = useRef(enabledSkillNames);
  const searchScopesRef = useRef(searchScopes);
  const searchFiltersRef = useRef(searchFilters);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    enabledSkillNamesRef.current = enabledSkillNames;
  }, [enabledSkillNames]);

  useEffect(() => {
    const settings = loadChatRagSettings();
    setSearchScopes(settings.scopes);
    setSearchFilters(settings.filters);
  }, []);

  useEffect(() => {
    searchScopesRef.current = searchScopes;
  }, [searchScopes]);

  useEffect(() => {
    searchFiltersRef.current = searchFilters;
  }, [searchFilters]);

  useEffect(() => {
    const settings: ChatRagSettings = { scopes: searchScopes, filters: searchFilters };
    saveChatRagSettings(settings);
  }, [searchScopes, searchFilters]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const lockedProject = useMemo(() => {
    const projectId = activeConversation?.projectId ?? null;
    if (!projectId) return null;
    return projects.find((project) => project.id === projectId) ?? null;
  }, [activeConversation?.projectId, projects]);

  useEffect(() => {
    conversationProjectIdRef.current = activeConversation?.projectId ?? null;
  }, [activeConversation?.projectId]);

  useEffect(() => {
    const projectId = activeConversation?.projectId ?? null;
    setSearchFilters((prev) => ({ ...prev, kanbanProjectId: projectId }));
    if (projectId === null) {
      setSearchScopes(["files"]);
    }
  }, [activeConversation?.projectId]);

  useEffect(() => {
    const tabGroupId = activeConversation?.tabGroupId;
    if (!tabGroupId) {
      setTabConversations(activeConversation ? [activeConversation] : []);
      return;
    }

    startTransition(async () => {
      try {
        const tabs = await getConversationTabGroup(tabGroupId);
        setTabConversations(tabs);
      } catch {
        setTabConversations(activeConversation ? [activeConversation] : []);
      }
    });
  }, [activeConversation?.id, activeConversation?.tabGroupId]);

  const syncEnabledSkills = useCallback(
    (conversation: AiConversation | null) => {
      const resolved = resolveInitialEnabledSkills(
        conversation?.enabledSkills,
        userRole,
        userPermissions
      );
      setEnabledSkillNames(resolved);
    },
    [userRole, userPermissions]
  );

  const handleEnabledSkillsChange = (names: string[]) => {
    setEnabledSkillNames(names);
    const conversationId = conversationIdRef.current;
    if (!conversationId) return;
    startTransition(async () => {
      try {
        const updated = await updateConversationEnabledSkills(conversationId, names);
        setConversations((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, enabledSkills: updated.enabledSkills } : c))
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update skills");
      }
    });
  };

  const displayMessages = useMemo(() => {
    if (!isStreaming || (!streamingContent && streamingSkills.length === 0)) return messages;
    const streamingMessage: AiMessage = {
      id: "streaming",
      conversationId: activeConversationId ?? "",
      role: "assistant",
      content: streamingContent,
      attachments: [],
      metadata: {
        skills: streamingSkills,
        citations: streamingCitations,
        referencedFiles: streamingReferencedFiles,
      },
      createdAt: new Date(),
    };
    return [...messages, streamingMessage];
  }, [
    messages,
    isStreaming,
    streamingContent,
    streamingSkills,
    streamingCitations,
    streamingReferencedFiles,
    activeConversationId,
  ]);

  const refreshWorkspace = useCallback(async () => {
    const workspace = await getAiWorkspace();
    setProjects(workspace.projects);
    setConversations(workspace.conversations);
  }, []);

  const loadConversation = useCallback(
    (conversationId: string) => {
      startTransition(async () => {
        try {
          const rows = await getConversationMessages(conversationId);
          setMessages(rows);
          setActiveConversationId(conversationId);
          const conversation = conversations.find((c) => c.id === conversationId);
          syncEnabledSkills(conversation ?? null);
          await setActiveAiSelection(activeProjectId, conversationId);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to load conversation");
        }
      });
    },
    [activeProjectId, conversations, syncEnabledSkills]
  );

  const selectProject = (projectId: string | null) => {
    setActiveProjectId(projectId);
    void setActiveAiSelection(projectId, activeConversationId);
  };

  const selectConversation = (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) {
      setActiveProjectId(conversation.projectId);
      syncEnabledSkills(conversation);
    }
    loadConversation(conversationId);
  };

  const handleCreateConversation = () => {
    startTransition(async () => {
      try {
        const conversation = await createAiConversation({ projectId: activeProjectId });
        setConversations((prev) => [conversation, ...prev]);
        setActiveConversationId(conversation.id);
        setMessages([]);
        syncEnabledSkills(conversation);
        await refreshWorkspace();
        toast.success("Conversation created");
      } catch (error) {
        toast.error(
          isStaleServerActionError(error)
            ? staleServerActionMessage()
            : error instanceof Error
              ? error.message
              : "Failed to create conversation"
        );
      }
    });
  };

  const handleRenameConversation = (conversation: AiConversation) => {
    const title = window.prompt("Conversation title", conversation.title)?.trim();
    if (!title || title === conversation.title) return;
    startTransition(async () => {
      try {
        const updated = await renameAiConversation(conversation.id, title);
        setConversations((prev) => prev.map((c) => (c.id === conversation.id ? updated : c)));
        toast.success("Conversation renamed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to rename conversation");
      }
    });
  };

  const handleDeleteConversation = (conversation: AiConversation) => {
    if (!window.confirm(`Delete "${conversation.title}"?`)) return;
    startTransition(async () => {
      try {
        await deleteAiConversation(conversation.id);
        setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
        if (activeConversationId === conversation.id) {
          setActiveConversationId(null);
          setMessages([]);
        }
        toast.success("Conversation deleted");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete conversation");
      }
    });
  };

  const projectIdRef = useRef(activeProjectId);

  useEffect(() => {
    projectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const openProjectFiles = (projectId: string) => {
    setFileManagerTab("project");
    setFileManagerProjectId(projectId);
    setFileManagerConversationId(activeConversationId);
    setFilesOpen(true);
  };

  const openConversationFiles = (conversationId: string) => {
    setFileManagerTab("conversation");
    setFileManagerProjectId(activeProjectId);
    setFileManagerConversationId(conversationId);
    setFilesOpen(true);
  };

  const handleSidebarCollapsedChange = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    void updateBookmarkPreferences({ chatSidebarCollapsed: collapsed });
  };

  const runStream = useCallback(
    async (history: AiMessage[], conversationId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsStreaming(true);
      setStreamingContent("");
      setStreamingSkills([]);
      setStreamingCitations([]);
      setStreamingReferencedFiles([]);

      try {
        const apiMessages = history.map((message) => ({
          role: message.role,
          content: messageToApiContent(message),
        }));

        const result = await stream(
          apiMessages,
          (content) => setStreamingContent(content),
          controller.signal,
          {
            projectId: conversationProjectIdRef.current,
            conversationId,
            enabledSkillNames: enabledSkillNamesRef.current,
            searchScopes: searchScopesRef.current,
            searchFilters: searchFiltersRef.current,
            onSkillsChange: setStreamingSkills,
            onCitationsChange: setStreamingCitations,
            onReferencedFilesChange: setStreamingReferencedFiles,
          }
        );

        if (controller.signal.aborted) {
          if (result.content.trim()) {
            const saved = await appendAssistantMessage(conversationId, result.content, {
              skills: result.skills,
              citations: result.citations,
              referencedFiles: result.referencedFiles,
            });
            setMessages((prev) => [...prev, saved]);
          }
          return;
        }

        const saved = await appendAssistantMessage(conversationId, result.content, {
          skills: result.skills,
          citations: result.citations,
          referencedFiles: result.referencedFiles,
        });
        setMessages((prev) => [...prev, saved]);
        await refreshWorkspace();
      } catch (error) {
        if (controller.signal.aborted) return;
        toast.error(error instanceof Error ? error.message : "AI request failed");
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
        setStreamingSkills([]);
        abortRef.current = null;
      }
    },
    [stream, refreshWorkspace]
  );

  const sendMessage = useCallback(
    async (rawText?: string) => {
      const conversationId = conversationIdRef.current;
      if (!conversationId || isStreaming) return;

      const text = (rawText ?? input).trim();
      if (!text && attachments.length === 0) return;

      try {
        const saved = await appendUserMessage({
          conversationId,
          content: text,
          attachments,
        });

        setMessages((prev) => [...prev, saved]);
        setInput("");
        setAttachments([]);
        await refreshWorkspace();

        await runStream([...messagesRef.current, saved], conversationId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send message");
      }
    },
    [attachments, input, isStreaming, runStream, refreshWorkspace]
  );

  const regenerateFrom = useCallback(
    async (assistantMessageId: string) => {
      const conversationId = conversationIdRef.current;
      if (!conversationId || isStreaming) return;

      try {
        const targetIndex = messagesRef.current.findIndex((m) => m.id === assistantMessageId);
        if (targetIndex < 0) return;

        const history = messagesRef.current.slice(0, targetIndex);
        await deleteMessageAfter(assistantMessageId);
        setMessages(history);
        await runStream(history, conversationId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to regenerate");
      }
    },
    [isStreaming, runStream]
  );

  const editLastUserMessage = useCallback(
    async (userMessageId: string) => {
      const conversationId = conversationIdRef.current;
      if (!conversationId || isStreaming) return;

      try {
        const targetIndex = messagesRef.current.findIndex((m) => m.id === userMessageId);
        if (targetIndex < 0) return;

        const message = messagesRef.current[targetIndex];
        if (message.role !== "user") return;

        setInput(message.content);
        setAttachments(message.attachments ?? []);
        await deleteMessageAfter(userMessageId);
        setMessages(messagesRef.current.slice(0, targetIndex));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to edit message");
      }
    },
    [isStreaming]
  );

  const forkFromMessage = useCallback(
    async (messageId: string) => {
      const conversationId = conversationIdRef.current;
      if (!conversationId || isStreaming) return;

      startTransition(async () => {
        try {
          const forked = await forkConversationAtMessage(conversationId, messageId);
          setConversations((prev) => [forked, ...prev.filter((c) => c.id !== forked.id)]);
          const tabs = await getConversationTabGroup(forked.tabGroupId ?? forked.id);
          setTabConversations(tabs);
          setActiveProjectId(forked.projectId);
          syncEnabledSkills(forked);
          const rows = await getConversationMessages(forked.id);
          setMessages(rows);
          setActiveConversationId(forked.id);
          toast.success("Conversation forked");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to fork conversation");
        }
      });
    },
    [isStreaming, syncEnabledSkills]
  );

  const handleCloseForkTab = useCallback(
    (conversationId: string) => {
      const tab = tabConversations.find((item) => item.id === conversationId);
      if (!tab?.forkFromMessageId) return;
      if (!window.confirm(`Close fork "${tab.title}"?`)) return;

      startTransition(async () => {
        try {
          await deleteAiConversation(conversationId);
          setConversations((prev) => prev.filter((c) => c.id !== conversationId));

          const remaining = tabConversations.filter((item) => item.id !== conversationId);
          setTabConversations(remaining);

          if (activeConversationId === conversationId) {
            const fallback = remaining[0];
            if (fallback) {
              selectConversation(fallback.id);
            } else {
              setActiveConversationId(null);
              setMessages([]);
            }
          }

          toast.success("Fork closed");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to close fork");
        }
      });
    },
    [activeConversationId, selectConversation, tabConversations]
  );

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    if (isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages, isStreaming, streamingContent]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target.id.startsWith("msg-")) return;
        setActiveMessageId(visible.target.id.replace(/^msg-/, ""));
      },
      { root, threshold: [0.35, 0.6, 0.9] }
    );

    for (const message of displayMessages) {
      const el = document.getElementById(`msg-${message.id}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [displayMessages]);

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") return messages[i].id;
    }
    return null;
  }, [messages]);

  const didAutoCreate = useRef(false);
  const didSendInitialPrompt = useRef(false);

  useEffect(() => {
    if (!initialPrompt || didSendInitialPrompt.current || !activeConversationId || isStreaming) {
      return;
    }
    didSendInitialPrompt.current = true;
    setInput(initialPrompt);
    void sendMessage(initialPrompt);
  }, [activeConversationId, initialPrompt, isStreaming, sendMessage]);

  useEffect(() => {
    if (didAutoCreate.current || activeConversationId) return;
    didAutoCreate.current = true;
    handleCreateConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] min-h-[520px] flex-col md:-m-6">
      <div className="flex items-center justify-between border-b px-4 py-3 md:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {activeConversation?.title ?? "AI Chat"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Grok workspace · projects, files, skills, and history
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setSkillsOpen(true)}>
            <Wrench className="mr-1 h-4 w-4" />
            Skills
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <ChatSidebar
          projects={projects}
          conversations={conversations}
          activeProjectId={activeProjectId}
          activeConversationId={activeConversationId}
          search={search}
          collapsed={sidebarCollapsed}
          onCollapsedChange={handleSidebarCollapsedChange}
          onSearchChange={setSearch}
          onSelectProject={selectProject}
          onSelectConversation={selectConversation}
          onCreateConversation={handleCreateConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={handleDeleteConversation}
          onOpenProjectFiles={openProjectFiles}
          onOpenConversationFiles={openConversationFiles}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {!activeConversationId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Creating your workspace…
            </div>
          ) : (
            <>
              <ChatConversationTabs
                tabs={tabConversations}
                activeConversationId={activeConversationId}
                onSelect={selectConversation}
                onClose={handleCloseForkTab}
              />
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {displayMessages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-6 py-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                      <Bot className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="max-w-md space-y-2">
                      <h3 className="text-lg font-medium">Start a conversation</h3>
                      <p className="text-sm text-muted-foreground">
                        Ask Grok about your operations, enable skills for tasks and monitoring, or
                        upload project files for context.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {STARTER_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => void sendMessage(prompt)}
                          className="rounded-full border px-3 py-1.5 text-xs transition hover:bg-accent"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl space-y-6">
                    {displayMessages.map((message) => (
                      <ChatMessageBubble
                        key={message.id}
                        message={message}
                        isStreaming={message.id === "streaming"}
                        streamingSkills={message.id === "streaming" ? streamingSkills : []}
                        streamingCitations={message.id === "streaming" ? streamingCitations : []}
                        streamingReferencedFiles={
                          message.id === "streaming" ? streamingReferencedFiles : []
                        }
                        showRegenerate={
                          message.role === "assistant" &&
                          message.id === lastAssistantId &&
                          !isStreaming
                        }
                        onRegenerate={() => void regenerateFrom(message.id)}
                        showEdit={
                          message.role === "user" &&
                          message.id === lastUserMessageId &&
                          !isStreaming
                        }
                        onEdit={() => void editLastUserMessage(message.id)}
                        showFork={message.role === "assistant" && message.id !== "streaming" && !isStreaming}
                        onFork={() => void forkFromMessage(message.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t bg-background/95 px-4 py-2 backdrop-blur space-y-2">
                <ChatRagControls
                  scopes={searchScopes}
                  filters={searchFilters}
                  kanbanProjects={kanbanProjects}
                  lockedProjectId={lockedProject?.id ?? null}
                  lockedProjectName={lockedProject?.name ?? (activeConversation?.projectId ? null : "General")}
                  generalOnly={!activeConversation?.projectId}
                  onScopesChange={setSearchScopes}
                  onFiltersChange={setSearchFilters}
                />
                <ChatActiveSkillChips
                  userRole={userRole}
                  userPermissions={userPermissions}
                  enabledSkillNames={enabledSkillNames}
                  onOpenSkills={() => setSkillsOpen(true)}
                />
              </div>

              <ChatComposer
                value={input}
                onChange={setInput}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                onSend={() => void sendMessage()}
                onStop={stopStreaming}
                isLoading={isStreaming}
                disabled={!activeConversationId}
              />
            </>
          )}
        </div>

        {activeConversationId && displayMessages.length > 0 ? (
          <HistoryIndicatorBar
            messages={displayMessages.filter((m) => m.id !== "streaming")}
            activeMessageId={activeMessageId}
            onSelect={(messageId) => {
              setActiveMessageId(messageId);
              scrollToMessage(messageId);
            }}
          />
        ) : null}
      </div>

      <ChatFileManager
        open={filesOpen}
        onOpenChange={setFilesOpen}
        projectId={fileManagerProjectId ?? activeProjectId}
        conversationId={fileManagerConversationId ?? activeConversationId}
        defaultTab={fileManagerTab}
      />

      <ChatSkillsPanel
        open={skillsOpen}
        onOpenChange={setSkillsOpen}
        userRole={userRole}
        userPermissions={userPermissions}
        enabledSkillNames={enabledSkillNames}
        onEnabledChange={handleEnabledSkillsChange}
      />
    </div>
  );
}
