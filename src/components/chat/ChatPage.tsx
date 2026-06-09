"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bot, FolderOpen, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatFileManager } from "@/components/chat/ChatFileManager";
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
  AiProject,
  AiSkillEvent,
  RagCitation,
  RagSearchScope,
  UserRole,
} from "@/lib/db/schema";
import type { UserPermissionOverrides } from "@/lib/permissions";
import {
  appendAssistantMessage,
  appendUserMessage,
  createAiConversation,
  createAiProject,
  deleteAiConversation,
  deleteAiProject,
  deleteMessageAfter,
  getConversationMessages,
  getAiWorkspace,
  renameAiConversation,
  renameAiProject,
  setActiveAiSelection,
  updateConversationEnabledSkills,
} from "@/server/actions/ai-chat";
import { updateBookmarkPreferences } from "@/server/actions/preferences";

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
}: {
  initialProjects: AiProject[];
  initialConversations: AiConversation[];
  initialMessages: AiMessage[];
  initialProjectId: string | null;
  initialConversationId: string | null;
  initialSidebarCollapsed: boolean;
  userRole: UserRole;
  userPermissions: UserPermissionOverrides | null;
  initialEnabledSkills: string[];
  kanbanProjects?: Array<{ id: string; name: string }>;
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
  const [searchScopes, setSearchScopes] = useState<RagSearchScope[]>([...DEFAULT_RAG_SEARCH_SCOPES]);
  const [searchFilters, setSearchFilters] = useState<RagSearchFilters>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const [filesOpen, setFilesOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [enabledSkillNames, setEnabledSkillNames] = useState(initialEnabledSkills);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const conversationIdRef = useRef(activeConversationId);
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
      metadata: { skills: streamingSkills, citations: streamingCitations },
      createdAt: new Date(),
    };
    return [...messages, streamingMessage];
  }, [messages, isStreaming, streamingContent, streamingSkills, streamingCitations, activeConversationId]);

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

  const handleCreateProject = () => {
    const name = window.prompt("Project name")?.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        const project = await createAiProject({ name });
        setProjects((prev) => [...prev, project].sort((a, b) => a.name.localeCompare(b.name)));
        setActiveProjectId(project.id);
        await setActiveAiSelection(project.id, activeConversationId);
        toast.success("Project created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create project");
      }
    });
  };

  const handleRenameProject = (project: AiProject) => {
    const name = window.prompt("Project name", project.name)?.trim();
    if (!name || name === project.name) return;
    startTransition(async () => {
      try {
        const updated = await renameAiProject(project.id, name);
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? updated : p)).sort((a, b) => a.name.localeCompare(b.name))
        );
        toast.success("Project renamed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to rename project");
      }
    });
  };

  const handleDeleteProject = (project: AiProject) => {
    if (!window.confirm(`Delete project "${project.name}" and all its conversations?`)) return;
    startTransition(async () => {
      try {
        await deleteAiProject(project.id);
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
        setConversations((prev) => prev.filter((c) => c.projectId !== project.id));
        if (activeProjectId === project.id) {
          setActiveProjectId(null);
        }
        if (conversations.some((c) => c.projectId === project.id && c.id === activeConversationId)) {
          setActiveConversationId(null);
          setMessages([]);
        }
        toast.success("Project deleted");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete project");
      }
    });
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
        toast.error(error instanceof Error ? error.message : "Failed to create conversation");
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
            projectId: projectIdRef.current,
            conversationId,
            enabledSkillNames: enabledSkillNamesRef.current,
            searchScopes: searchScopesRef.current,
            searchFilters: searchFiltersRef.current,
            onSkillsChange: setStreamingSkills,
            onCitationsChange: setStreamingCitations,
          }
        );

        if (controller.signal.aborted) {
          if (result.content.trim()) {
            const saved = await appendAssistantMessage(conversationId, result.content, {
              skills: result.skills,
              citations: result.citations,
            });
            setMessages((prev) => [...prev, saved]);
          }
          return;
        }

        const saved = await appendAssistantMessage(conversationId, result.content, {
          skills: result.skills,
          citations: result.citations,
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

  const didAutoCreate = useRef(false);

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
          <Button size="sm" variant="outline" onClick={() => setFilesOpen(true)}>
            <FolderOpen className="mr-1 h-4 w-4" />
            Files
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
          onCreateProject={handleCreateProject}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onCreateConversation={handleCreateConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={handleDeleteConversation}
          onOpenFiles={() => setFilesOpen(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {!activeConversationId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Creating your workspace…
            </div>
          ) : (
            <>
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
                        showRegenerate={
                          message.role === "assistant" &&
                          message.id === lastAssistantId &&
                          !isStreaming
                        }
                        onRegenerate={() => void regenerateFrom(message.id)}
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
        projectId={activeProjectId}
        conversationId={activeConversationId}
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
