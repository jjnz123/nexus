import type { RagSourceType } from "@/lib/db/schema";

export function ragStatusKey(sourceType: RagSourceType, sourceId: string) {
  return `${sourceType}:${sourceId}`;
}
