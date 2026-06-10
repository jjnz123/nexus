"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { createChildTask } from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TaskChild } from "./types";

export function TaskChildSubtasksPanel({
  parentTaskId,
  childTasks,
  onOpenTask,
  onChange,
}: {
  parentTaskId: string;
  childTasks: TaskChild[];
  onOpenTask: (taskKey: string) => void;
  onChange: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  function addChildTask() {
    if (!draft.trim()) return;
    startTransition(async () => {
      try {
        await createChildTask({ parentTaskId, title: draft.trim() });
        setDraft("");
        await onChange();
        toast.success("Subtask created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create subtask");
      }
    });
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Subtasks</h4>
        <Badge variant="outline" className="text-[10px]">
          {childTasks.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {childTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No linked subtasks yet.</p>
        ) : (
          childTasks.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => onOpenTask(child.key)}
              className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{child.title}</p>
                <p className="text-xs text-muted-foreground">
                  {child.key} · {child.type}
                  {child.assigneeName ? ` · ${child.assigneeName}` : ""}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Quick add subtask…"
          onKeyDown={(event) => {
            if (event.key === "Enter") addChildTask();
          }}
        />
        <Button type="button" variant="outline" disabled={isPending} onClick={addChildTask}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
