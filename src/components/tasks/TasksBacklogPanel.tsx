"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Inbox, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createBacklogTask, moveTaskToBoard } from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BoardTask, TaskPriority, TaskType } from "./types";

function makeTaskKey(projectKey: string, taskNumber: number) {
  return `${projectKey}-${String(taskNumber).padStart(3, "0")}`;
}

export function TasksBacklogPanel({
  open,
  onOpenChange,
  projectId,
  projectKey,
  backlogTasks,
  onRefresh,
  onOpenTask,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectKey: string;
  backlogTasks: BoardTask[];
  onRefresh: () => Promise<void> | void;
  onOpenTask: (task: BoardTask) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [type, setType] = useState<TaskType>("task");

  if (!open) return null;

  function moveToBoard(taskId: string) {
    startTransition(async () => {
      try {
        await moveTaskToBoard(taskId);
        await onRefresh();
        toast.success("Moved to board");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to move task");
      }
    });
  }

  function createItem() {
    if (!title.trim()) return;
    startTransition(async () => {
      try {
        await createBacklogTask({
          projectId,
          title: title.trim(),
          priority,
          type,
        });
        setTitle("");
        await onRefresh();
        toast.success("Backlog item created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create backlog item");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close backlog panel"
        className="fixed inset-0 z-40 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Inbox className="h-5 w-5" />
              Backlog
            </h2>
            <p className="text-xs text-muted-foreground">
              Move items to the board when ready (defaults to To Do).
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 border-b px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="backlog-title">New backlog item</Label>
            <Input
              id="backlog-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe the work…"
              onKeyDown={(e) => {
                if (e.key === "Enter") createItem();
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="epic">Epic</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="story">Story</SelectItem>
                <SelectItem value="task">Task</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={createItem} disabled={!title.trim() || isPending}>
            <Plus className="mr-2 h-4 w-4" />
            Add to backlog
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {backlogTasks.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Backlog is empty
            </p>
          ) : (
            backlogTasks.map((task) => (
              <div key={task.id} className="rounded-lg border p-3">
                <button
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="w-full text-left"
                >
                  <p className="text-xs text-muted-foreground">
                    {makeTaskKey(projectKey, task.number)}
                  </p>
                  <p className="font-medium">{task.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {task.type}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {task.priority}
                    </Badge>
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3 w-full"
                  disabled={isPending}
                  onClick={() => moveToBoard(task.id)}
                >
                  <ArrowRight className="mr-1 h-4 w-4" />
                  Move to board
                </Button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
