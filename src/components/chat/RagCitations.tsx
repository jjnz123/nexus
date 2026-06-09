"use client";

import { ExternalLink, FileText } from "lucide-react";
import type { RagCitation } from "@/lib/db/schema";

export function RagCitations({ citations }: { citations: RagCitation[] }) {
  if (!citations.length) return null;

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Sources</p>
      <ul className="space-y-2">
        {citations.map((citation, index) => (
          <li key={citation.chunkId} className="text-xs">
            <a
              href={citation.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1.5 font-medium text-primary hover:underline"
            >
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                [{index + 1}] {citation.title}
              </span>
              <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
            </a>
            <p className="mt-1 pl-5 text-muted-foreground">{citation.excerpt}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
