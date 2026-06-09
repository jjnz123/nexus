"use client";

import { useEffect, useState, useTransition } from "react";
import { Link2, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { addTaskLink, removeTaskLink, searchProjectTasks } from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskLink, TaskLinkType } from "./types";

const LINK_LABELS: Record<TaskLinkType, string> = {
  relates_to: "Relates to",
  blocks: "Blocks",
  duplicates: "Duplicates",
};

export function TaskLinkedIssuesPanel({
  taskId,
  projectId,
  links,
  onChange,
  onOpenLinkedTask,
}: {
  taskId: string;
  projectId: string;
  links: TaskLink[];
  onChange: () => Promise<void> | void;
  onOpenLinkedTask: (taskKey: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [linkType, setLinkType] = useState<TaskLinkType>("relates_to");
  const [results, setResults] = useState<
    { id: string; key: string; title: string; type: string }[]
  >([]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void searchProjectTasks(projectId, query, taskId).then((rows) => {
      if (!cancelled) setResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, query, projectId, taskId]);

  function linkTask(targetTaskId: string) {
    startTransition(async () => {
      try {
        await addTaskLink({ sourceTaskId: taskId, targetTaskId, linkType });
        setOpen(false);
        setQuery("");
        await onChange();
        toast.success("Issue linked");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to link issue");
      }
    });
  }

  function unlink(linkId: string) {
    startTransition(async () => {
      try {
        await removeTaskLink(linkId);
        await onChange();
        toast.success("Link removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to remove link");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium">Linked issues</h4>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Link2 className="mr-1 h-4 w-4" />
          Link issue
        </Button>
      </div>

      {open ? (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <div className="grid gap-2 md:grid-cols-[160px_1fr]">
            <Select value={linkType} onValueChange={(v) => setLinkType(v as TaskLinkType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relates_to">Relates to</SelectItem>
                <SelectItem value="blocks">Blocks</SelectItem>
                <SelectItem value="duplicates">Duplicates</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or key…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {results.map((row) => (
              <button
                key={row.id}
                type="button"
                disabled={isPending}
                onClick={() => linkTask(row.id)}
                className="flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm hover:bg-accent/40"
              >
                <span>
                  <span className="text-muted-foreground">{row.key}</span> · {row.title}
                </span>
                <Badge variant="outline" className="capitalize">
                  {row.type}
                </Badge>
              </button>
            ))}
            {query.trim().length >= 2 && results.length === 0 ? (
              <p className="text-xs text-muted-foreground">No matching issues.</p>
            ) : null}
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
        </div>
      ) : null}

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked issues.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left text-sm"
                onClick={() => onOpenLinkedTask(link.linkedTaskKey)}
              >
                <Badge variant="secondary" className="mr-2 capitalize">
                  {link.direction === "incoming" ? "Incoming" : LINK_LABELS[link.linkType]}
                </Badge>
                <span className="text-muted-foreground">{link.linkedTaskKey}</span> ·{" "}
                {link.linkedTaskTitle}
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0 text-destructive"
                disabled={isPending}
                onClick={() => unlink(link.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
