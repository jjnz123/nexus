import type { RetrievedRagChunk } from "@/lib/rag/types";

const RRF_K = 60;

export function reciprocalRankFusion(
  vectorResults: RetrievedRagChunk[],
  keywordResults: RetrievedRagChunk[]
): RetrievedRagChunk[] {
  const scores = new Map<string, { chunk: RetrievedRagChunk; score: number }>();

  vectorResults.forEach((chunk, index) => {
    const key = chunkKey(chunk);
    const existing = scores.get(key);
    const score = 1 / (RRF_K + index + 1);
    scores.set(key, {
      chunk: {
        ...chunk,
        vectorScore: chunk.similarity,
        keywordScore: existing?.chunk.keywordScore,
      },
      score: (existing?.score ?? 0) + score,
    });
  });

  keywordResults.forEach((chunk, index) => {
    const key = chunkKey(chunk);
    const existing = scores.get(key);
    const score = 1 / (RRF_K + index + 1);
    const keywordScore = chunk.keywordScore ?? chunk.similarity;
    scores.set(key, {
      chunk: {
        ...(existing?.chunk ?? chunk),
        keywordScore: keywordScore,
        vectorScore: existing?.chunk.vectorScore ?? chunk.vectorScore,
      },
      score: (existing?.score ?? 0) + score,
    });
  });

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ chunk, score }) => ({
      ...chunk,
      fusedScore: score,
      similarity: score,
    }));
}

function chunkKey(chunk: RetrievedRagChunk) {
  return `${chunk.sourceType}:${chunk.sourceId}:${chunk.chunkIndex}`;
}

export function rerankByScore(chunks: RetrievedRagChunk[]): RetrievedRagChunk[] {
  return [...chunks].sort((a, b) => b.similarity - a.similarity);
}
