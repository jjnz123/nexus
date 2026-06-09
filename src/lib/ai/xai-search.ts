import { getAiModel } from "@/server/settings";

type SearchTool = "web_search" | "x_search";

type XaiResponsePayload = {
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  citations?: string[];
};

function extractResponseText(payload: XaiResponsePayload): string {
  const chunks: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type === "message" || item.role === "assistant") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && part.text) chunks.push(part.text);
        if (part.type === "text" && part.text) chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

export async function runXaiSearchTool(
  tool: SearchTool,
  query: string,
  options?: { maxResults?: number }
) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { error: "AI search is not configured (XAI_API_KEY missing)" };

  const model = await getAiModel();
  const limit = Math.min(Math.max(options?.maxResults ?? 8, 1), 20);
  const prompt =
    tool === "x_search"
      ? `Search X (Twitter) for recent posts about: ${query}. Summarize key findings in under 400 words with handles or post themes when relevant. Limit to about ${limit} distinct sources.`
      : `Search the web for: ${query}. Summarize the most relevant findings in under 400 words. Limit to about ${limit} distinct sources.`;

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: prompt }],
      tools: [{ type: tool }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { error: text || `${tool} request failed` };
  }

  const payload = (await response.json()) as XaiResponsePayload;
  const summary = extractResponseText(payload);
  const citations = (payload.citations ?? []).slice(0, limit);

  return {
    query,
    summary: summary || "No summary returned.",
    citations,
    source: tool === "x_search" ? "X" : "Web",
  };
}
