import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiConversationFiles,
  aiConversations,
  aiProjectFiles,
  aiProjects,
} from "@/lib/db/schema";
import { retrieveChatKnowledge } from "@/lib/rag/retriever";
import type { RagCitation } from "@/lib/db/schema";
import { getSkillLabel } from "@/lib/ai/skills/definitions";
import { skillDefinitionsForApi } from "@/lib/ai/skills/index";
import { executeSkill } from "@/lib/ai/skills/executor";
import type { AiSkillEvent, UserRole } from "@/lib/db/schema";
import type { UserPermissionOverrides } from "@/lib/permissions";
import { getAiModel } from "@/server/settings";

type ChatMessage = {
  role: string;
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

type ChatUser = {
  id: string;
  role: UserRole;
  permissions: UserPermissionOverrides | null;
};

type StreamEvent =
  | { type: "skill"; event: AiSkillEvent }
  | { type: "content"; delta: string }
  | { type: "done"; content: string; skills: AiSkillEvent[]; citations?: RagCitation[] }
  | { type: "error"; message: string };

async function loadKnowledgeContext(
  userId: string,
  projectId: string | null,
  conversationId: string | null,
  query: string
) {
  const projectFiles = projectId
    ? await db
        .select({ file: aiProjectFiles, project: aiProjects })
        .from(aiProjectFiles)
        .innerJoin(aiProjects, eq(aiProjectFiles.projectId, aiProjects.id))
        .where(eq(aiProjectFiles.projectId, projectId))
        .then((rows) => rows.filter((r) => r.project.userId === userId).map((r) => r.file))
    : [];

  const conversationFiles = conversationId
    ? await db
        .select({ file: aiConversationFiles, conversation: aiConversations })
        .from(aiConversationFiles)
        .innerJoin(aiConversations, eq(aiConversationFiles.conversationId, aiConversations.id))
        .where(eq(aiConversationFiles.conversationId, conversationId))
        .then((rows) =>
          rows.filter((r) => r.conversation.userId === userId).map((r) => r.file)
        )
    : [];

  return retrieveChatKnowledge({
    userId,
    query,
    projectId,
    conversationId,
    projectFiles,
    conversationFiles,
  });
}

function encodeSse(event: StreamEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function chunkText(text: string, size = 24) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export async function runAiChatWithSkills({
  user,
  messages,
  projectId,
  conversationId,
  enableTools = true,
  enabledSkillNames,
  signal,
  onEvent,
}: {
  user: ChatUser;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  projectId?: string | null;
  conversationId?: string | null;
  enableTools?: boolean;
  enabledSkillNames?: string[];
  signal?: AbortSignal;
  onEvent?: (event: StreamEvent) => void;
}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("AI not configured");

  const model = await getAiModel();
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const knowledge = await loadKnowledgeContext(
    user.id,
    projectId ?? null,
    conversationId ?? null,
    latestUserMessage
  );

  const systemParts = [
    "You are Grok, a helpful AI assistant embedded in Nexus, an internal operations portal.",
    "You help staff with bookmarks, tasks, network monitoring, and day-to-day operational questions.",
    "Be concise, practical, and friendly. Use markdown when it improves clarity.",
    "When you use a skill/tool, explain what you did briefly after receiving the result.",
  ];

  if (knowledge.contextBlock) {
    systemParts.push(knowledge.contextBlock);
    if (knowledge.usedRag) {
      systemParts.push(
        "When you use retrieved knowledge, cite sources inline using [1], [2], etc. matching the numbered excerpts above."
      );
    }
  }

  if (enableTools) {
    systemParts.push(
      "You have access to Nexus skills for tasks, monitoring, bookmarks, web search, and X search. Use them when the user asks you to perform actions or fetch live data."
    );
  }

  const apiMessages: ChatMessage[] = [
    { role: "system", content: systemParts.join("\n\n") },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const skillEvents: AiSkillEvent[] = [];
  const tools = enableTools ? skillDefinitionsForApi(enabledSkillNames) : undefined;
  const maxRounds = 6;

  for (let round = 0; round < maxRounds; round += 1) {
    if (signal?.aborted) throw new Error("Aborted");

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        tools,
        tool_choice: tools ? "auto" : undefined,
        stream: false,
        temperature: 0.6,
      }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "AI request failed");
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: ChatMessage;
      }>;
    };

    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error("Empty AI response");

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length > 0) {
      apiMessages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const name = call.function.name;
        const label = getSkillLabel(name);
        const running: AiSkillEvent = { name, label, status: "running" };
        skillEvents.push(running);
        onEvent?.({ type: "skill", event: running });

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }

        try {
          const result = await executeSkill(user, name, args);
          const hasError = result && typeof result === "object" && "error" in result;
          const finished: AiSkillEvent = {
            name,
            label,
            status: hasError ? "error" : "success",
            result: hasError ? undefined : result,
            error: hasError ? String((result as { error: string }).error) : undefined,
          };
          skillEvents[skillEvents.length - 1] = finished;
          onEvent?.({ type: "skill", event: finished });

          apiMessages.push({
            role: "tool",
            tool_call_id: call.id,
            name,
            content: JSON.stringify(result),
          });
        } catch (error) {
          const finished: AiSkillEvent = {
            name,
            label,
            status: "error",
            error: error instanceof Error ? error.message : "Skill failed",
          };
          skillEvents[skillEvents.length - 1] = finished;
          onEvent?.({ type: "skill", event: finished });
          apiMessages.push({
            role: "tool",
            tool_call_id: call.id,
            name,
            content: JSON.stringify({ error: finished.error }),
          });
        }
      }
      continue;
    }

    const content = message.content?.trim() ?? "";
    for (const delta of chunkText(content)) {
      if (signal?.aborted) throw new Error("Aborted");
      onEvent?.({ type: "content", delta });
      await new Promise((r) => setTimeout(r, 8));
    }

    onEvent?.({ type: "done", content, skills: skillEvents, citations: knowledge.citations });
    return { content, skills: skillEvents, citations: knowledge.citations };
  }

  throw new Error("Too many skill rounds");
}

export function createSkillChatSseStream(
  user: ChatUser,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options: {
    projectId?: string | null;
    conversationId?: string | null;
    enableTools?: boolean;
    enabledSkillNames?: string[];
    signal?: AbortSignal;
  }
) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        await runAiChatWithSkills({
          user,
          messages,
          projectId: options.projectId,
          conversationId: options.conversationId,
          enableTools: options.enableTools,
          enabledSkillNames: options.enabledSkillNames,
          signal: options.signal,
          onEvent: (event) => {
            controller.enqueue(encoder.encode(encodeSse(event)));
          },
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI request failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`)
        );
        controller.close();
      }
    },
  });
}
