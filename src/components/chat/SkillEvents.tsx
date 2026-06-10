"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
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

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max = 40): string {
  const clean = stripMarkdown(text);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

function SearchSkillBody({
  result,
  source,
}: {
  result: Record<string, unknown>;
  source: "Web" | "X";
}) {
  const citations = (result.citations as string[] | undefined) ?? [];
  const query = result.query ? String(result.query) : null;

  if (!query && !citations.length) {
    return <p className="text-muted-foreground">No results.</p>;
  }

  return (
    <div className="space-y-1 text-muted-foreground">
      {query ? (
        <p className="truncate">
          Query: <span className="text-foreground">{query}</span>
        </p>
      ) : null}
      {citations.length ? (
        <ul className="space-y-0.5">
          {citations.slice(0, 6).map((url) => (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 truncate text-primary hover:underline"
                title={url}
              >
                <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
            </li>
          ))}
          {citations.length > 6 ? (
            <li className="text-[10px]">+{citations.length - 6} more</li>
          ) : null}
        </ul>
      ) : (
        <p className="text-[10px] uppercase tracking-wide">{source} search completed</p>
      )}
    </div>
  );
}

function SkillResultBody({ skill }: { skill: AiSkillEvent }) {
  if (skill.status === "running") {
    return <p className="text-muted-foreground">In progress…</p>;
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
    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

function skillSummary(skill: AiSkillEvent): string | null {
  if (skill.status === "running") return "…";
  if (skill.error) return truncate(skill.error, 48);

  const result = skill.result as Record<string, unknown> | undefined;
  if (!result) return null;

  if (skill.name === "web_search" || skill.name === "x_search") {
    const citations = (result.citations as string[] | undefined) ?? [];
    const query = result.query ? truncate(String(result.query), 32) : null;
    const sourceCount = `${citations.length} src`;
    return query ? `${query} · ${sourceCount}` : sourceCount;
  }

  if (skill.name === "create_task" || skill.name === "update_task") {
    const taskKey = String(result.taskKey ?? "");
    return taskKey ? taskKey : null;
  }

  if (skill.name === "search_bookmarks") {
    const count = ((result.results as unknown[]) ?? []).length;
    return count ? `${count} hit${count === 1 ? "" : "s"}` : "none";
  }

  if (skill.name === "check_monitor_status") {
    if (Array.isArray(result.matches)) {
      const count = result.matches.length;
      return count ? `${count} device${count === 1 ? "" : "s"}` : "none";
    }
    return `${String(result.up ?? 0)}/${String(result.total ?? 0)} up`;
  }

  return null;
}

function SkillStatusIcon({ skill }: { skill: AiSkillEvent }) {
  if (skill.status === "running") {
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />;
  }
  if (skill.status === "success") {
    return <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />;
  }
  if (skill.status === "error") {
    return <XCircle className="h-3 w-3 shrink-0 text-destructive" />;
  }
  return <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />;
}

function SkillEventCard({ skill }: { skill: AiSkillEvent }) {
  const [expanded, setExpanded] = useState(false);
  const summary = skillSummary(skill);

  return (
    <div
      className={cn(
        "rounded-md border border-border/50 bg-muted/20 text-[11px]",
        skill.status === "error" && "border-destructive/30 bg-destructive/5",
        skill.status === "running" && "border-primary/20 bg-primary/5"
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto min-h-0 w-full justify-start gap-1.5 px-2 py-1 font-normal hover:bg-transparent"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse skill details" : "Expand skill details"}
      >
        <SkillStatusIcon skill={skill} />
        <span className="shrink-0 font-medium">{skill.label}</span>
        {!expanded && summary ? (
          <span className="min-w-0 truncate text-muted-foreground">· {summary}</span>
        ) : null}
        <ChevronRight
          className={cn(
            "ml-auto h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90"
          )}
        />
      </Button>

      {expanded ? (
        <div className="border-t border-border/40 px-2 pb-1.5 pt-1">
          <SkillResultBody skill={skill} />
        </div>
      ) : null}
    </div>
  );
}

export function SkillEvents({ skills }: { skills: AiSkillEvent[] }) {
  if (!skills.length) return null;

  return (
    <div className="mb-2 space-y-1">
      {skills.map((skill, index) => (
        <SkillEventCard key={`${skill.name}-${index}`} skill={skill} />
      ))}
    </div>
  );
}
