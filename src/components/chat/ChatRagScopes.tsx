"use client";

import type { RagSearchScope } from "@/lib/db/schema";
import { DEFAULT_RAG_SEARCH_SCOPES } from "@/lib/rag/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SCOPE_LABELS: Record<RagSearchScope, string> = {
  files: "Files",
  notes: "Notes",
  meetings: "Meetings",
  tasks: "Tasks",
};

export function ChatRagScopes({
  scopes,
  onChange,
}: {
  scopes: RagSearchScope[];
  onChange: (scopes: RagSearchScope[]) => void;
}) {
  function toggle(scope: RagSearchScope) {
    if (scopes.includes(scope)) {
      const next = scopes.filter((item) => item !== scope);
      onChange(next.length ? next : [...DEFAULT_RAG_SEARCH_SCOPES]);
      return;
    }
    onChange([...scopes, scope]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Search:</span>
      {(Object.keys(SCOPE_LABELS) as RagSearchScope[]).map((scope) => {
        const active = scopes.includes(scope);
        return (
          <button
            key={scope}
            type="button"
            onClick={() => toggle(scope)}
            className="focus:outline-none"
          >
            <Badge
              variant={active ? "default" : "outline"}
              className={cn("cursor-pointer", !active && "opacity-70")}
            >
              {SCOPE_LABELS[scope]}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
