"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatFileManager } from "@/components/chat/ChatFileManager";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { HistoryIndicatorBar, scrollToMessage } from "@/components/chat/HistoryIndicatorBar";
import { useAiStream } from "@/components/chat/useAiStream";
import type {
  AiConversation,
  AiMessage,
  AiMessageAttachment,
  AiProject,
  AiSkillEvent,
} from "@/lib/db/schema";
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
}: {
  initialProjects: AiProject[];
  initialConversations: AiConversation[];
  initialMessages: AiMessage[];
  initialProjectId: string | null;
  initialConversationId: string | null;
  initialSidebarCollapsed: boolean;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const [filesOpen, setFilesOpen] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const conversationIdRef = useRef(activeConversationId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const displayMessages = useMemo(() => {
    if (!isStreaming || (!streamingContent && streamingSkills.length === 0)) return messages;
    const streamingMessage: AiMessage = {
      id: "streaming",
      conversationId: activeConversationId ?? "",
      role: "assistant",
      content: streamingContent,
      attachments: [],
      metadata: { skills: streamingSkills },
      createdAt: new Date(),
    };
    return [...messages, streamingMessage];
  }, [messages, isStreaming, streamingContent, streamingSkills, activeConversationId]);

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
          await setActiveAiSelection(activeProjectId, conversationId);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to load conversation");
        }
      });
    },
    [activeProjectId]
  );

  const selectProject = (projectId: string | null) => {
    setActiveProjectId(projectId);
    void setActiveAiSelection(projectId, activeConversationId);
  };

  const selectConversation = (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) {
      setActiveProjectId(conversation.projectId);
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
            onSkillsChange: setStreamingSkills,
          }
        );

        if (controller.signal.aborted) {
          if (result.content.trim()) {
            const saved = await appendAssistantMessage(conversationId, result.content, {
              skills: result.skills,
            });
            setMessages((prev) => [...prev, saved]);
          }
          return;
        }

        const saved = await appendAssistantMessage(conversationId, result.content, {
          skills: result.skills,
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
    <div className="flex h-[calc(100vh-4rem)] min-h-[520px] flex-col">
      <div className="border-b px-4 py-3">
        <h1 className="text-xl font-semibold tracking-tight">AI Chat</h1>
        <p className="text-sm text-muted-foreground">
          Projects, conversations, and Grok — with full history navigation.
        </p>
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
                      <h3 className="text-lg font-medium">How can I help?</h3>
                      <p className="text-sm text-muted-foreground">
                        Ask about bookmarks, tasks, monitoring, or day-to-day operations.
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
    </div>
  );
}
