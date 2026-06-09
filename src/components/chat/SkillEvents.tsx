"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, Loader2, Wrench, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AiSkillEvent } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

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

  return (
    <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

export function SkillEvents({ skills }: { skills: AiSkillEvent[] }) {
  if (!skills.length) return null;

  return (
    <div className="mb-3 space-y-2">
      {skills.map((skill, index) => (
        <div
          key={`${skill.name}-${index}`}
          className={cn(
            "rounded-xl border px-3 py-2.5 text-xs shadow-sm",
            skill.status === "error" && "border-destructive/30 bg-destructive/5",
            skill.status === "success" && "border-emerald-500/20 bg-emerald-500/5",
            skill.status === "running" && "border-primary/20 bg-primary/5"
          )}
        >
          <div className="mb-1.5 flex items-center gap-2">
            {skill.status === "running" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : skill.status === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : skill.status === "error" ? (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <Wrench className="h-3.5 w-3.5 text-primary" />
            )}
            <span className="font-medium">{skill.label}</span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
              {skill.status}
            </Badge>
          </div>
          <SkillResultBody skill={skill} />
        </div>
      ))}
    </div>
  );
}
