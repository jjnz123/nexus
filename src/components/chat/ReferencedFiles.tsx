"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReferencedFile } from "@/lib/db/schema";
import { getFileTypeIcon } from "@/lib/files/file-type-icon";
import { categoryLabel } from "@/lib/rag/referenced-files";
import { cn } from "@/lib/utils";

function ReferencedFileRow({ file }: { file: ReferencedFile }) {
  const Icon = getFileTypeIcon(file.filename, file.mimeType);
  const isInternal = file.href.startsWith("/");
  const fileHref =
    file.sourceCategory === "ticket_attachment" && file.taskKey
      ? `/tasks/${file.taskKey}`
      : file.href;

  const content = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-foreground">{file.filename}</span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {categoryLabel(file.sourceCategory)}
          </Badge>
        </span>
        {file.pageLabel || file.preview ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {[file.pageLabel, file.preview].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>
      {!isInternal ? <ExternalLink className="h-3 w-3 shrink-0 opacity-60" /> : null}
    </>
  );

  return (
    <li>
      {isInternal ? (
        <Link
          href={fileHref}
          className="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-border hover:bg-background/70"
        >
          {content}
        </Link>
      ) : (
        <a
          href={fileHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-border hover:bg-background/70"
        >
          {content}
        </a>
      )}
    </li>
  );
}

export function ReferencedFiles({ files }: { files: ReferencedFile[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!files.length) return null;

  const previewCount = 3;
  const visibleFiles = expanded ? files : files.slice(0, previewCount);
  const hiddenCount = files.length - previewCount;

  return (
    <div className="mt-3 rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Referenced files ({files.length})
        </p>
        {files.length > previewCount ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : `Show all (${files.length})`}
            <ChevronDown
              className={cn("ml-1 h-3 w-3 transition", expanded && "rotate-180")}
            />
          </Button>
        ) : null}
      </div>
      <ul className="space-y-1">
        {visibleFiles.map((file) => (
          <ReferencedFileRow key={`${file.sourceCategory}:${file.id}`} file={file} />
        ))}
      </ul>
      {!expanded && hiddenCount > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          +{hiddenCount} more file{hiddenCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
