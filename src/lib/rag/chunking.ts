import { createHash } from "crypto";
import type { RagChunkInput } from "@/lib/rag/types";
import { estimateTokens } from "@/lib/rag/types";

const TARGET_CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const MAX_CHUNK_SIZE = 2400;

export function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export function chunkDocumentText(text: string, strategy: "document" | "markdown" = "document"): RagChunkInput[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const sections =
    strategy === "markdown" && /^#{1,3}\s/m.test(normalized)
      ? splitMarkdownSections(normalized)
      : splitParagraphs(normalized);

  const chunks: RagChunkInput[] = [];
  let buffer = "";

  for (const section of sections) {
    if (!section.trim()) continue;

    if (section.length > MAX_CHUNK_SIZE) {
      if (buffer.trim()) {
        chunks.push(makeChunk(chunks.length, buffer.trim()));
        buffer = "";
      }
      chunks.push(...splitFixed(section, chunks.length));
      continue;
    }

    const candidate = buffer ? `${buffer}\n\n${section}` : section;
    if (candidate.length <= TARGET_CHUNK_SIZE) {
      buffer = candidate;
      continue;
    }

    if (buffer.trim()) {
      chunks.push(makeChunk(chunks.length, buffer.trim()));
    }
    buffer = section;
  }

  if (buffer.trim()) {
    chunks.push(makeChunk(chunks.length, buffer.trim()));
  }

  return mergeTinyTrailingChunk(chunks);
}

function makeChunk(index: number, content: string): RagChunkInput {
  return {
    chunkIndex: index,
    content,
    tokenEstimate: estimateTokens(content),
  };
}

function splitMarkdownSections(text: string) {
  const lines = text.split("\n");
  const sections: string[] = [];
  let current = "";

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line) && current.trim()) {
      sections.push(current.trim());
      current = line;
      continue;
    }
    current = current ? `${current}\n${line}` : line;
  }

  if (current.trim()) sections.push(current.trim());
  return sections.length ? sections : [text];
}

function splitParagraphs(text: string) {
  return text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

function splitFixed(text: string, startIndex: number): RagChunkInput[] {
  const chunks: RagChunkInput[] = [];
  let index = startIndex;
  let start = 0;

  while (start < text.length) {
    const end = Math.min(text.length, start + TARGET_CHUNK_SIZE);
    const slice = text.slice(start, end).trim();
    if (slice) {
      chunks.push(makeChunk(index, slice));
      index += 1;
    }
    if (end >= text.length) break;
    start = Math.max(start + TARGET_CHUNK_SIZE - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

function mergeTinyTrailingChunk(chunks: RagChunkInput[]) {
  if (chunks.length < 2) return chunks;
  const last = chunks[chunks.length - 1];
  if (last.content.length >= 300) return chunks;

  const prev = chunks[chunks.length - 2];
  const merged = `${prev.content}\n\n${last.content}`.trim();
  if (merged.length > MAX_CHUNK_SIZE) return chunks;

  return [
    ...chunks.slice(0, -2),
    {
      chunkIndex: prev.chunkIndex,
      content: merged,
      tokenEstimate: estimateTokens(merged),
    },
  ];
}

export function chooseChunkStrategy(filename: string, mimeType: string): "document" | "markdown" {
  if (/\.(md|markdown)$/i.test(filename) || mimeType === "text/markdown") {
    return "markdown";
  }
  return "document";
}
