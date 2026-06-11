/** Chunk size for resumable meeting audio uploads (keeps each request under proxy timeouts). */
export const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;

export type ChunkedUploadResult = {
  path: string;
  size: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadFileChunked(
  blob: Blob,
  filename: string,
  options?: {
    onProgress?: (percent: number) => void;
    maxAttemptsPerChunk?: number;
  }
): Promise<ChunkedUploadResult> {
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(blob.size / UPLOAD_CHUNK_BYTES));
  const maxAttempts = options?.maxAttemptsPerChunk ?? 3;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * UPLOAD_CHUNK_BYTES;
    const chunk = blob.slice(start, Math.min(start + UPLOAD_CHUNK_BYTES, blob.size));

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const form = new FormData();
        form.append("uploadId", uploadId);
        form.append("chunkIndex", String(chunkIndex));
        form.append("totalChunks", String(totalChunks));
        form.append("filename", filename);
        form.append("file", chunk, `chunk-${chunkIndex}`);

        const res = await fetch("/api/uploads/chunk", { method: "POST", body: form });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Upload failed (${res.status})`);
        }

        const data = (await res.json()) as ChunkedUploadResult & { complete?: boolean };
        options?.onProgress?.(((chunkIndex + 1) / totalChunks) * 100);

        if (data.complete) {
          return { path: data.path, size: data.size };
        }

        lastError = null;
        break;
      } catch (error) {
        lastError =
          error instanceof TypeError && error.message === "Failed to fetch"
            ? new Error(
                "Upload connection lost — check your network and try again. Your recording is still saved in the browser."
              )
            : error instanceof Error
              ? error
              : new Error("Upload failed");
        if (attempt < maxAttempts - 1) {
          await sleep(1000 * (attempt + 1));
        }
      }
    }

    if (lastError) throw lastError;
  }

  throw new Error("Upload incomplete — please retry.");
}
