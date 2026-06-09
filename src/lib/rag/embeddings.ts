import {
  RAG_EMBEDDING_DIMENSIONS,
  RAG_EMBEDDING_MODEL,
  isRagEnabled,
} from "@/lib/rag/types";

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  if (!isRagEnabled()) {
    throw new Error("RAG embeddings require OPENAI_API_KEY");
  }

  const apiKey = process.env.OPENAI_API_KEY!.trim();
  const sanitized = texts.map((text) => text.replace(/\0/g, "").trim()).filter(Boolean);
  if (!sanitized.length) return [];

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: RAG_EMBEDDING_MODEL,
      input: sanitized,
      dimensions: RAG_EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Embedding request failed");
  }

  const payload = (await response.json()) as EmbeddingResponse;
  const embeddings = payload.data?.map((row) => row.embedding ?? []) ?? [];
  if (embeddings.length !== sanitized.length) {
    throw new Error("Embedding response count mismatch");
  }

  return embeddings;
}

export async function embedQuery(text: string) {
  const [embedding] = await embedTexts([text]);
  return embedding ?? [];
}

export function embeddingToVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}
