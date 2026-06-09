"use client";

import { useCallback } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

async function readAiError(response: Response): Promise<string> {
  const text = await response.text();
  if (response.status === 401) return "You do not have permission to use AI.";
  if (response.status === 503) return "AI is not configured. Set XAI_API_KEY on the server.";
  return text || `AI request failed (${response.status})`;
}

export function useAiStream() {
  const stream = useCallback(
    async (
      messages: ChatMessage[],
      onDelta: (delta: string) => void,
      signal?: AbortSignal
    ) => {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(await readAiError(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
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
            full += delta;
            onDelta(full);
          } catch {
            // Ignore malformed chunks.
          }
        }
      }

      return full;
    },
    []
  );

  return { stream };
}
