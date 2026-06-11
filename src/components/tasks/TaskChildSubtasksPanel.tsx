"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createChildTask, deleteTask, updateTask } from "@/server/actions/tasks";
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
import type { TaskChild, TaskColumn } from "./types";

export function TaskChildSubtasksPanel({
  parentTaskId,
  childTasks,
  columns,
  onOpenTask,
  onChange,
}: {
  parentTaskId: string;
  childTasks: TaskChild[];
  columns: TaskColumn[];
  onOpenTask: (taskKey: string) => void;
  onChange: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function addChildTask() {
    if (!draft.trim()) return;
    startTransition(async () => {
      try {
        const result = await createChildTask({ parentTaskId, title: draft.trim() });
        setDraft("");
        await onChange();
        if (result.checklistFallback) {
          toast.success(
            "Added to checklist — this project does not allow child tickets under this ticket type."
          );
        } else {
          toast.success("Subtask created");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create subtask");
      }
    });
  }

  function updateChildStatus(childId: string, columnId: string) {
    startTransition(async () => {
      try {
        await updateTask({ id: childId, columnId });
        await onChange();
        toast.success("Subtask status updated");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update subtask");
      }
    });
  }

  function saveChildTitle(childId: string) {
    const title = editTitle.trim();
    if (!title) return;
    startTransition(async () => {
      try {
        await updateTask({ id: childId, title });
        setEditingId(null);
        await onChange();
        toast.success("Subtask updated");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update subtask");
      }
    });
  }

  function removeChild(child: TaskChild) {
    if (!window.confirm(`Delete subtask ${child.key}?`)) return;
    startTransition(async () => {
      try {
        await deleteTask(child.id);
        await onChange();
        toast.success("Subtask deleted");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to delete subtask");
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
            <div
              key={child.id}
              className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-2"
            >
              <button
                type="button"
                onClick={() => onOpenTask(child.key)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium">{child.key}</p>
                {editingId === child.id ? (
                  <Input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveChildTitle(child.id);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    className="mt-1 h-8"
                    autoFocus
                  />
                ) : (
                  <p className="truncate text-xs text-muted-foreground">{child.title}</p>
                )}
              </button>
              <Select
                value={child.columnId}
                onValueChange={(value) => updateChildStatus(child.id, value)}
                disabled={isPending}
              >
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {column.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline" className="text-[10px] capitalize">
                {child.type}
              </Badge>
              <div className="flex items-center gap-1">
                {editingId === child.id ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => saveChildTitle(child.id)}
                  >
                    Save
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => {
                      setEditingId(child.id);
                      setEditTitle(child.title);
                    }}
                  >
                    Edit
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  disabled={isPending}
                  onClick={() => removeChild(child)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onOpenTask(child.key)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
