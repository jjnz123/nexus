import { getAiModel } from "@/server/settings";

export async function rewriteRetrievalQuery(query: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 8) return trimmed;

  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) return trimmed;

  try {
    const model = await getAiModel();
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You rewrite user questions into concise search queries for an internal company knowledge base (notes, meeting transcripts, tasks, uploaded files). " +
              "Preserve key entities (people, projects, dates, product names). Expand abbreviations. Remove conversational filler. " +
              "Return only the rewritten query on one line — no quotes or explanation.",
          },
          { role: "user", content: trimmed },
        ],
      }),
    });

    if (!response.ok) return trimmed;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rewritten = payload.choices?.[0]?.message?.content?.trim();
    return rewritten || trimmed;
  } catch {
    return trimmed;
  }
}
