import { auth } from "@/lib/auth";
import { createSkillChatSseStream } from "@/lib/ai/chat-with-skills";
import { hasPermission } from "@/lib/permissions";
import { getAiModel } from "@/server/settings";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (
    !session?.user ||
    !hasPermission(session.user.role, "ai:use", session.user.permissions)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response("AI not configured", { status: 503 });
  }

  const body = (await req.json()) as {
    messages: { role: string; content: string }[];
    projectId?: string | null;
    conversationId?: string | null;
    enableTools?: boolean;
    enabledSkillNames?: string[];
    legacyStream?: boolean;
  };

  const messages = body.messages ?? [];
  const enableTools = body.enableTools !== false;
  const useLegacy = body.legacyStream === true;

  if (useLegacy || !enableTools) {
    const model = await getAiModel();
    const systemMessage = {
      role: "system",
      content:
        "You are Grok, a helpful AI assistant embedded in Nexus, an internal operations portal. " +
        "You help staff with bookmarks, tasks, network monitoring, and day-to-day operational questions. " +
        "Be concise, practical, and friendly. Use markdown when it improves clarity (lists, headings, code blocks). " +
        "If you lack live data about the user's portal, say so and suggest where in Nexus they can check.",
    };

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [systemMessage, ...messages],
        stream: true,
        temperature: 0.6,
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      return new Response(text || "AI request failed", { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const stream = createSkillChatSseStream(
    {
      id: session.user.id,
      role: session.user.role,
      permissions: session.user.permissions ?? null,
    },
    messages.filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    ),
    {
      projectId: body.projectId ?? null,
      conversationId: body.conversationId ?? null,
      enableTools: true,
      enabledSkillNames: body.enabledSkillNames,
    }
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
