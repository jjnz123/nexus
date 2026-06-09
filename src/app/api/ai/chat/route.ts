import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { NextRequest } from "next/server";
import { getAiModel } from "@/server/settings";

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

  const { messages } = (await req.json()) as {
    messages: { role: string; content: string }[];
  };

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
