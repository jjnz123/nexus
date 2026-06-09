import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "ai:use")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response("AI not configured", { status: 503 });
  }

  const { messages } = (await req.json()) as {
    messages: { role: string; content: string }[];
  };

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-2-latest",
      messages,
      stream: true,
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
