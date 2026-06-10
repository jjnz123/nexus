"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, FileText } from "lucide-react";
import type { RagCitation } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryLabel } from "@/lib/rag/referenced-files";
import { cn } from "@/lib/utils";

export function RagCitations({ citations }: { citations: RagCitation[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!citations.length) return null;

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Sources ({citations.length})
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-muted-foreground"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide" : "Show"}
          <ChevronDown
            className={cn("ml-1 h-3 w-3 transition", expanded && "rotate-180")}
          />
        </Button>
      </div>
      {expanded ? (
        <ul className="mt-2 space-y-2">
          {citations.map((citation, index) => (
            <CitationItem key={citation.chunkId} citation={citation} index={index} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CitationItem({ citation, index }: { citation: RagCitation; index: number }) {
  const isInternal = citation.href.startsWith("/");
  const label = citation.filename ?? citation.title;

  return (
    <li className="text-xs">
      {isInternal ? (
        <Link
          href={citation.href}
          className="inline-flex items-start gap-1.5 font-medium text-primary hover:underline"
        >
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span>
              [{index + 1}] {label}
            </span>
            {citation.sourceCategory ? (
              <Badge variant="outline" className="text-[10px] font-normal">
                {categoryLabel(citation.sourceCategory)}
              </Badge>
            ) : null}
            {citation.pageLabel ? (
              <span className="font-normal text-muted-foreground">{citation.pageLabel}</span>
            ) : null}
          </span>
        </Link>
      ) : (
        <a
          href={citation.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-start gap-1.5 font-medium text-primary hover:underline"
        >
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span>
              [{index + 1}] {label}
            </span>
            {citation.sourceCategory ? (
              <Badge variant="outline" className="text-[10px] font-normal">
                {categoryLabel(citation.sourceCategory)}
              </Badge>
            ) : null}
          </span>
          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
        </a>
      )}
    </li>
  );
}
