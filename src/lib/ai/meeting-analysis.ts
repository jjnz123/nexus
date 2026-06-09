import { getAiModel } from "@/server/settings";

export type MeetingAnalysis = {
  summary: string;
  actionItems: {
    title: string;
    description?: string;
    assigneeHint?: string;
    priority?: "low" | "medium" | "high" | "urgent";
  }[];
};

export async function analyzeMeetingTranscript(transcript: string): Promise<MeetingAnalysis> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not configured");

  const model = await getAiModel();
  const prompt = `Analyze this meeting transcript. Respond with ONLY valid JSON:
{
  "summary": "Concise meeting summary in markdown",
  "actionItems": [
    {
      "title": "Action title",
      "description": "Optional details",
      "assigneeHint": "Optional person name",
      "priority": "low|medium|high|urgent"
    }
  ]
}

Transcript:
${transcript.slice(0, 120000)}`;

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`Grok analysis failed (${response.status})`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Unable to parse meeting analysis");

  return JSON.parse(jsonMatch[0]) as MeetingAnalysis;
}

export async function answerMeetingQuestion(
  transcript: string,
  question: string,
  history: { role: string; content: string }[],
  ragContext?: string
) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not configured");

  const model = await getAiModel();
  const messages = [
    {
      role: "system" as const,
      content: ragContext
        ? `You answer questions about a meeting using ONLY the retrieved excerpts below. Cite them as [1], [2] when used. If unknown, say so.\n\n${ragContext}`
        : `You answer questions about a meeting using ONLY the transcript below. If unknown, say so.\n\nTranscript:\n${transcript.slice(0, 100000)}`,
    },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: question },
  ];

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
  });

  if (!response.ok) throw new Error(`Grok chat failed (${response.status})`);

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "No response.";
}
