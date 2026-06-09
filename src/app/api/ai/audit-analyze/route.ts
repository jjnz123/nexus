import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, "admin:access")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response("AI not configured", { status: 503 });
  }

  const { logs, question } = (await req.json()) as {
    logs: Array<{
      createdAt: string;
      userName: string | null;
      userEmail: string | null;
      action: string;
      summary: string;
      details?: Record<string, unknown>;
    }>;
    question?: string;
  };

  const logText = logs
    .map(
      (log) =>
        `[${log.createdAt}] ${log.userName ?? "system"} (${log.userEmail ?? "n/a"}) — ${log.action}: ${log.summary}`
    )
    .join("\n");

  const messages = [
    {
      role: "system",
      content:
        "You are a security and operations auditor analyzing Nexus portal audit logs. Summarize patterns, anomalies, risky activity, and useful follow-ups. Be concise and actionable.",
    },
    {
      role: "user",
      content: `${question ?? "Analyze these audit log entries and highlight anything noteworthy."}\n\nAudit logs:\n${logText}`,
    },
  ];

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
