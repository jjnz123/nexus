"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createId } from "@/lib/create-id";

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

async function readAiError(response: Response): Promise<string> {
  const text = await response.text();
  if (response.status === 401) return "You do not have permission to use AI.";
  if (response.status === 503) return "AI is not configured. Set XAI_API_KEY on the server.";
  return text || `AI request failed (${response.status})`;
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

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const canSend = useMemo(
    () => input.trim().length > 0 && !isLoading,
    [input, isLoading]
  );

  const sendMessage = useCallback(async (rawInput?: string) => {
    const value = (rawInput ?? input).trim();
    if (!value || isLoading) return;

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content: value,
    };
    const assistantMessageId = createId();
    const nextMessages = [
      ...messagesRef.current,
      userMessage,
      { id: assistantMessageId, role: "assistant" as const, content: "" },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setIsThinking(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messagesRef.current, userMessage].map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
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
            // Ignore non-JSON chunks in the stream.
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "I hit an issue while generating a response.";
      toast.error(message);
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === assistantMessageId
            ? { ...entry, content: message }
            : entry
        )
      );
      setIsThinking(false);
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  }, [input, isLoading]);

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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close AI drawer"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l bg-background shadow-2xl"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">AI Assistant</h2>
                <p className="text-sm text-muted-foreground">
                  Ask for help with your internal operations.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Start a conversation by asking a question below.
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "mr-auto w-fit max-w-[85%] rounded-lg border bg-card px-3 py-2 text-sm"
                  }
                >
                  {message.content || (isThinking ? "Thinking..." : "")}
                </div>
              ))}
              {isThinking && messages[messages.length - 1]?.content === "" && (
                <div className="mr-auto flex w-fit items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              )}
            </div>

            <form
              className="flex gap-2 border-t p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask AI anything..."
                disabled={isLoading}
              />
              <Button type="submit" disabled={!canSend}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
