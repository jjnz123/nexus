"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import type { RagCitation } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { categoryLabel } from "@/lib/rag/referenced-files";
import { cn } from "@/lib/utils";

export function RagCitations({ citations }: { citations: RagCitation[] }) {
  if (!citations.length) return null;

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Sources</p>
      <ul className="space-y-2">
        {citations.map((citation, index) => (
          <CitationItem key={citation.chunkId} citation={citation} index={index} />
        ))}
      </ul>
    </div>
  );
}

function CitationItem({ citation, index }: { citation: RagCitation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isInternal = citation.href.startsWith("/");
  const label = citation.filename ?? citation.title;

  return (
    <li className="text-xs">
      <div className="group relative">
        {isInternal ? (
          <Link
            href={citation.href}
            className="inline-flex items-start gap-1.5 font-medium text-primary hover:underline"
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            onFocus={() => setExpanded(true)}
            onBlur={() => setExpanded(false)}
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
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            onFocus={() => setExpanded(true)}
            onBlur={() => setExpanded(false)}
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

        <button
          type="button"
          className="ml-2 text-[10px] text-muted-foreground underline-offset-2 hover:underline sm:hidden"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide" : "Excerpt"}
        </button>

        <div
          className={cn(
            "mt-1 pl-5 text-muted-foreground sm:group-hover:block",
            expanded ? "block" : "hidden sm:block sm:opacity-70"
          )}
        >
          <p className="rounded border border-transparent bg-background/60 p-2 leading-relaxed sm:absolute sm:left-0 sm:top-full sm:z-10 sm:mt-1 sm:max-w-md sm:border-border sm:shadow-md sm:group-hover:block">
            {citation.excerpt}
          </p>
        </div>
      </div>
    </li>
  );
}
