"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  Copy,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createId } from "@/lib/create-id";
import { MarkdownMessage } from "@/components/ai/MarkdownMessage";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AiDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  promptNonce?: number;
};

const STARTER_PROMPTS = [
  "Summarize what I should check on the home dashboard today",
  "Help me organize my internal bookmarks by team",
  "What should I monitor for a critical internal service?",
];

async function readAiError(response: Response): Promise<string> {
  const text = await response.text();
  if (response.status === 401) return "You do not have permission to use AI.";
  if (response.status === 503) return "AI is not configured. Set XAI_API_KEY on the server.";
  return text || `AI request failed (${response.status})`;
}

function MessageActions({
  content,
  onRegenerate,
  showRegenerate,
}: {
  content: string;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyContent() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => void copyContent()}
      >
        {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
        Copy
      </Button>
      {showRegenerate && onRegenerate ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={onRegenerate}
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Regenerate
        </Button>
      ) : null}
    </div>
  );
}

export function AiDrawer({
  open,
  onOpenChange,
  initialPrompt,
  promptNonce = 0,
}: AiDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isThinking, isLoading]);

  const canSend = useMemo(
    () => input.trim().length > 0 && !isLoading,
    [input, isLoading]
  );

  const streamChat = useCallback(
    async (history: Message[], assistantMessageId: string, signal: AbortSignal) => {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(await readAiError(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event
            .split("\n")
            .map((part) => part.trim())
            .find((part) => part.startsWith("data:"));
          if (!line) continue;

          const data = line.replace(/^data:\s*/, "");
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string };
                message?: { content?: string };
              }>;
            };
            const delta =
              parsed.choices?.[0]?.delta?.content ??
              parsed.choices?.[0]?.message?.content ??
              "";

            if (!delta) continue;
            setIsThinking(false);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: `${message.content}${delta}` }
                  : message
              )
            );
          } catch {
            // Ignore malformed stream chunks.
          }
        }
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (
      rawInput?: string,
      options?: { regenerate?: boolean }
    ) => {
      if (isLoading) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let historyForApi: Message[];
      let assistantMessageId = createId();

      if (options?.regenerate) {
        const lastUserIndex = [...messagesRef.current]
          .map((m, i) => (m.role === "user" ? i : -1))
          .filter((i) => i >= 0)
          .pop();
        if (lastUserIndex == null) return;

        historyForApi = messagesRef.current.slice(0, lastUserIndex + 1);
        setMessages([
          ...historyForApi,
          { id: assistantMessageId, role: "assistant", content: "" },
        ]);
      } else {
        const value = (rawInput ?? input).trim();
        if (!value) return;

        const userMessage: Message = {
          id: createId(),
          role: "user",
          content: value,
        };
        historyForApi = [...messagesRef.current, userMessage];
        assistantMessageId = createId();
        setMessages([
          ...historyForApi,
          { id: assistantMessageId, role: "assistant", content: "" },
        ]);
        setInput("");
      }

      setIsLoading(true);
      setIsThinking(true);

      try {
        await streamChat(historyForApi, assistantMessageId, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "I hit an issue while generating a response.";
        toast.error(message);
        setMessages((prev) =>
          prev.map((entry) =>
            entry.id === assistantMessageId ? { ...entry, content: message } : entry
          )
        );
        setIsThinking(false);
      } finally {
        setIsLoading(false);
        setIsThinking(false);
        abortRef.current = null;
      }
    },
    [input, isLoading, streamChat]
  );

  const regenerateLast = useCallback(() => {
    void sendMessage(undefined, { regenerate: true });
  }, [sendMessage]);

  const stopStreaming = () => {
    abortRef.current?.abort();
    setIsLoading(false);
    setIsThinking(false);
  };

  const clearChat = () => {
    stopStreaming();
    setMessages([]);
    setInput("");
  };

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    if (!open) return;
    if (initialPrompt?.trim()) {
      setInput(initialPrompt);
    }
    if (promptNonce > 0 && initialPrompt?.trim()) {
      void sendMessageRef.current(initialPrompt);
    }
  }, [open, promptNonce, initialPrompt]);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [open]);

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close AI drawer"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l bg-background shadow-2xl"
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-zinc-100 to-zinc-300 text-zinc-900 dark:from-zinc-700 dark:to-zinc-900 dark:text-zinc-100">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold tracking-tight">Grok</h2>
                  <p className="text-xs text-muted-foreground">
                    Nexus AI assistant
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={clearChat}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    New chat
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-6 py-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                    <Bot className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h3 className="text-lg font-medium">How can I help?</h3>
                    <p className="text-sm text-muted-foreground">
                      Ask about bookmarks, tasks, monitoring, or anything related to your internal operations.
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
                <div className="space-y-6">
                  {messages.map((message, index) => {
                    const isUser = message.role === "user";
                    const isStreamingEmpty =
                      !isUser &&
                      !message.content &&
                      isThinking &&
                      index === messages.length - 1;

                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={cn("group flex gap-3", isUser && "flex-row-reverse")}
                      >
                        {!isUser ? (
                          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                            <Sparkles className="h-4 w-4" />
                          </div>
                        ) : (
                          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <span className="text-xs font-semibold">You</span>
                          </div>
                        )}

                        <div
                          className={cn(
                            "min-w-0 max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                            isUser
                              ? "bg-primary text-primary-foreground"
                              : "border bg-card shadow-sm"
                          )}
                        >
                          {isUser ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                          ) : isStreamingEmpty ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="animate-pulse">Thinking…</span>
                            </div>
                          ) : message.content ? (
                            <MarkdownMessage content={message.content} />
                          ) : null}

                          {!isUser && message.content ? (
                            <MessageActions
                              content={message.content}
                              showRegenerate={index === lastAssistantIndex && !isLoading}
                              onRegenerate={regenerateLast}
                            />
                          ) : null}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t bg-background/95 p-4 backdrop-blur">
              <form
                className="relative rounded-2xl border bg-card shadow-sm"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (canSend) void sendMessage();
                    }
                  }}
                  placeholder="Message Grok…"
                  disabled={isLoading}
                  rows={3}
                  className="min-h-[88px] resize-none border-0 bg-transparent px-4 py-3 pr-24 focus-visible:ring-0"
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  {isLoading ? (
                    <Button type="button" size="sm" variant="outline" onClick={stopStreaming}>
                      <Square className="mr-1 h-3.5 w-3.5" />
                      Stop
                    </Button>
                  ) : (
                    <Button type="submit" size="sm" disabled={!canSend}>
                      <Send className="mr-1 h-3.5 w-3.5" />
                      Send
                    </Button>
                  )}
                </div>
              </form>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
