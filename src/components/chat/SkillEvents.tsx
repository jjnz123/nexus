"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AiSkillEvent } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

function SearchSkillBody({
  result,
  source,
}: {
  result: Record<string, unknown>;
  source: "Web" | "X";
}) {
  const summary = String(result.summary ?? "");
  const citations = (result.citations as string[] | undefined) ?? [];
  const query = result.query ? String(result.query) : null;

  return (
    <div className="space-y-2 text-muted-foreground">
      {query ? (
        <p>
          Query: <span className="text-foreground">{query}</span>
        </p>
      ) : null}
      {summary ? <p className="whitespace-pre-wrap leading-relaxed">{summary}</p> : null}
      {citations.length ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {source} sources
          </p>
          <ul className="space-y-1">
            {citations.slice(0, 8).map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 break-all text-primary hover:underline"
                >
                  {url}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SkillResultBody({ skill }: { skill: AiSkillEvent }) {
  if (skill.status === "running") {
    return <p className="text-muted-foreground">Running…</p>;
  }

  if (skill.error) {
    return <p className="text-destructive">{skill.error}</p>;
  }

  const result = skill.result as Record<string, unknown> | undefined;
  if (!result) return null;

  if (skill.name === "create_task" || skill.name === "update_task") {
    const taskKey = String(result.taskKey ?? "");
    const link = String(result.link ?? "");
    return (
      <div className="space-y-1 text-muted-foreground">
        <p>
          Task <span className="font-medium text-foreground">{taskKey}</span>
          {result.title ? `: ${String(result.title)}` : ""}
        </p>
        {link ? (
          <Link href={link} className="inline-flex items-center gap-1 text-primary hover:underline">
            Open task <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    );
  }

  if (skill.name === "search_bookmarks") {
    const results = (result.results as Array<{ title: string; url: string; group: string }>) ?? [];
    if (!results.length) return <p className="text-muted-foreground">No bookmarks matched.</p>;
    return (
      <ul className="space-y-1 text-muted-foreground">
        {results.slice(0, 5).map((row) => (
          <li key={`${row.url}-${row.title}`}>
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {row.title}
            </a>
            <span className="text-muted-foreground"> · {row.group}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (skill.name === "check_monitor_status") {
    if (Array.isArray(result.matches)) {
      const matches = result.matches as Array<{ name: string; status: string; link?: string }>;
      if (!matches.length) return <p className="text-muted-foreground">No devices matched.</p>;
      return (
        <ul className="space-y-1">
          {matches.map((row) => (
            <li key={row.name} className="flex items-center gap-2 text-muted-foreground">
              <Badge variant="outline" className="h-5 text-[10px]">
                {row.status}
              </Badge>
              {row.link ? (
                <Link href={row.link} className="text-primary hover:underline">
                  {row.name}
                </Link>
              ) : (
                row.name
              )}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p className="text-muted-foreground">
        {String(result.up ?? 0)} up · {String(result.down ?? 0)} down · {String(result.unknown ?? 0)}{" "}
        unknown ({String(result.total ?? 0)} total)
      </p>
    );
  }

  if (skill.name === "web_search") {
    return <SearchSkillBody result={result} source="Web" />;
  }

  if (skill.name === "x_search") {
    return <SearchSkillBody result={result} source="X" />;
  }

  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

function skillSummary(skill: AiSkillEvent): string | null {
  if (skill.status === "running") return "Running…";
  if (skill.error) return skill.error;
  const result = skill.result as Record<string, unknown> | undefined;
  if (!result) return null;

  if (skill.name === "web_search" || skill.name === "x_search") {
    const summary = String(result.summary ?? "").trim();
    if (summary) return summary.split("\n")[0]?.slice(0, 120) ?? null;
  }

  if (skill.name === "create_task" || skill.name === "update_task") {
    const taskKey = String(result.taskKey ?? "");
    return taskKey ? `Task ${taskKey}` : null;
  }

  if (skill.name === "search_bookmarks") {
    const count = ((result.results as unknown[]) ?? []).length;
    return count ? `${count} bookmark${count === 1 ? "" : "s"} found` : "No bookmarks matched";
  }

  return null;
}

function SkillEventCard({
  skill,
  defaultCollapsed,
}: {
  skill: AiSkillEvent;
  defaultCollapsed: boolean;
}) {
  const isRunning = skill.status === "running";
  const [expanded, setExpanded] = useState(!defaultCollapsed || isRunning);

  useEffect(() => {
    if (defaultCollapsed && !isRunning) {
      setExpanded(false);
    }
  }, [defaultCollapsed, isRunning]);

  const summary = skillSummary(skill);
  const canCollapse = !isRunning && defaultCollapsed;

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 text-xs shadow-sm",
        skill.status === "error" && "border-destructive/30 bg-destructive/5",
        skill.status === "success" && "border-emerald-500/20 bg-emerald-500/5",
        skill.status === "running" && "border-primary/20 bg-primary/5"
      )}
    >
      <div className="flex items-start gap-2">
        {canCollapse ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-0.5 h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse skill details" : "Expand skill details"}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : (
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center">
            {skill.status === "running" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : skill.status === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : skill.status === "error" ? (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Wrench className="h-3.5 w-3.5 text-primary" />
            )}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {canCollapse ? (
              <>
                {skill.status === "success" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : skill.status === "error" ? (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <Wrench className="h-3.5 w-3.5 text-primary" />
                )}
              </>
            ) : null}
            <span className="font-medium">{skill.label}</span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
              {skill.status}
            </Badge>
          </div>

          {!expanded && summary ? (
            <p className="truncate text-muted-foreground">{summary}</p>
          ) : null}

          {expanded || isRunning ? (
            <div className={cn(canCollapse && "mt-1.5")}>
              <SkillResultBody skill={skill} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SkillEvents({
  skills,
  defaultCollapsed = false,
}: {
  skills: AiSkillEvent[];
  defaultCollapsed?: boolean;
}) {
  if (!skills.length) return null;

  return (
    <div className="mb-3 space-y-2">
      {skills.map((skill, index) => (
        <SkillEventCard
          key={`${skill.name}-${index}`}
          skill={skill}
          defaultCollapsed={defaultCollapsed}
        />
      ))}
    </div>
  );
}
