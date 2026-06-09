"use client";

import { useCallback } from "react";
import type { AiSkillEvent, RagCitation } from "@/lib/db/schema";

type ChatMessage = { role: "user" | "assistant"; content: string };

export type AiStreamResult = {
  content: string;
  skills: AiSkillEvent[];
  citations: RagCitation[];
};

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
      signal?: AbortSignal,
      options?: {
        projectId?: string | null;
        conversationId?: string | null;
        enabledSkillNames?: string[];
        onSkill?: (event: AiSkillEvent) => void;
        onSkillsChange?: (skills: AiSkillEvent[]) => void;
        onCitationsChange?: (citations: RagCitation[]) => void;
      }
    ): Promise<AiStreamResult> => {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          projectId: options?.projectId ?? null,
          conversationId: options?.conversationId ?? null,
          enableTools: true,
          enabledSkillNames: options?.enabledSkillNames,
        }),
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(await readAiError(response));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      const skills: AiSkillEvent[] = [];
      const citations: RagCitation[] = [];

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
            const parsed = JSON.parse(data) as
              | { type: "content"; delta: string }
              | { type: "done"; content: string; skills?: AiSkillEvent[]; citations?: RagCitation[] }
              | { type: "skill"; event: AiSkillEvent }
              | { type: "error"; message: string }
              | {
                  choices?: Array<{
                    delta?: { content?: string };
                    message?: { content?: string };
                  }>;
                };

            if ("type" in parsed) {
              if (parsed.type === "error") throw new Error(parsed.message);
              if (parsed.type === "skill") {
                const idx = skills.findIndex((s) => s.name === parsed.event.name);
                if (idx >= 0) skills[idx] = parsed.event;
                else skills.push(parsed.event);
                options?.onSkill?.(parsed.event);
                options?.onSkillsChange?.([...skills]);
                continue;
              }
              if (parsed.type === "content") {
                full += parsed.delta;
                onDelta(full);
                continue;
              }
              if (parsed.type === "done") {
                full = parsed.content || full;
                onDelta(full);
                if (parsed.skills?.length) {
                  skills.splice(0, skills.length, ...parsed.skills);
                  options?.onSkillsChange?.([...skills]);
                }
                if (parsed.citations?.length) {
                  citations.splice(0, citations.length, ...parsed.citations);
                  options?.onCitationsChange?.([...citations]);
                }
                continue;
              }
            }

            const delta =
              parsed.choices?.[0]?.delta?.content ??
              parsed.choices?.[0]?.message?.content ??
              "";
            if (!delta) continue;
            full += delta;
            onDelta(full);
          } catch (error) {
            if (error instanceof Error && error.message !== "Unexpected token") {
              throw error;
            }
          }
        }
      }

      return { content: full, skills, citations };
    },
    []
  );

  return { stream };
}
