"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCheck, Copy, MessageSquarePlus, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  addComment,
  createSubtask,
  setTaskLabels,
  toggleSubtask,
  updateTask,
} from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TaskColumn, TaskDetails, TaskLabel, TaskPriority } from "./types";

function asDateInput(value: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function asIsoDate(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T12:00:00.000Z`).toISOString();
}

export function TaskModal({
  open,
  onOpenChange,
  taskKey,
  taskDetails,
  columns,
  labels,
  onTaskSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskKey: string | null;
  taskDetails: TaskDetails | null;
  columns: TaskColumn[];
  labels: TaskLabel[];
  onTaskSaved: () => Promise<void> | void;
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [columnId, setColumnId] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [localSubtasks, setLocalSubtasks] = useState<TaskDetails["subtasks"]>([]);
  const [localComments, setLocalComments] = useState<TaskDetails["comments"]>([]);

  useEffect(() => {
    if (!taskDetails) return;
    setTitle(taskDetails.task.title);
    setDescription(taskDetails.task.description ?? "");
    setPriority(taskDetails.task.priority);
    setDueDate(asDateInput(taskDetails.task.dueDate));
    setColumnId(taskDetails.task.columnId);
    setSelectedLabels(taskDetails.labelIds);
    setLocalSubtasks(taskDetails.subtasks);
    setLocalComments(taskDetails.comments);
  }, [taskDetails]);

  const completedSubtasks = useMemo(
    () => localSubtasks.filter((item) => item.completed).length,
    [localSubtasks]
  );

  const copyTaskUrl = async () => {
    if (!taskKey || typeof window === "undefined") return;
    const taskUrl = `${window.location.origin}/tasks/${taskKey}`;
    await navigator.clipboard.writeText(taskUrl);
    toast.success("Task link copied");
  };

  const saveTask = () => {
    if (!taskDetails) return;
    startTransition(async () => {
      try {
        await updateTask({
          id: taskDetails.task.id,
          title,
          description: description || null,
          priority,
          dueDate: asIsoDate(dueDate),
          columnId,
        });
        await setTaskLabels(taskDetails.task.id, selectedLabels);
        await onTaskSaved();
        toast.success("Task saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save task");
      }
    });
  };

  const addSubtaskItem = () => {
    if (!taskDetails || !subtaskDraft.trim()) return;
    startTransition(async () => {
      try {
        const subtask = await createSubtask({
          taskId: taskDetails.task.id,
          title: subtaskDraft.trim(),
        });
        setLocalSubtasks((prev) => [...prev, subtask]);
        setSubtaskDraft("");
        toast.success("Subtask added");
        await onTaskSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to add subtask");
      }
    });
  };

  const toggleSubtaskItem = (subtaskId: string, completed: boolean) => {
    startTransition(async () => {
      try {
        await toggleSubtask(subtaskId, completed);
        setLocalSubtasks((prev) =>
          prev.map((item) => (item.id === subtaskId ? { ...item, completed } : item))
        );
        await onTaskSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update subtask");
      }
    });
  };

  const submitComment = () => {
    if (!taskDetails || !commentDraft.trim()) return;
    startTransition(async () => {
      try {
        const created = await addComment({
          taskId: taskDetails.task.id,
          body: commentDraft.trim(),
        });
        setLocalComments((prev) => [
          ...prev,
          {
            ...created,
            userName: "You",
          },
        ]);
        setCommentDraft("");
        toast.success("Comment added");
        await onTaskSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to add comment");
      }
    });
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabels((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <button
              onClick={copyTaskUrl}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
              {taskKey ?? "Task"}
            </button>
          </DialogTitle>
          <DialogDescription>Edit details, subtasks, and comments.</DialogDescription>
        </DialogHeader>

        {!taskDetails ? (
          <p className="text-sm text-muted-foreground">Loading task details...</p>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-due-date">Due date</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Column</Label>
                <Select value={columnId} onValueChange={setColumnId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Labels</Label>
              <div className="grid gap-2 md:grid-cols-2">
                {labels.map((label) => {
                  const checked = selectedLabels.includes(label.id);
                  return (
                    <label
                      key={label.id}
                      className="flex items-center gap-2 rounded-md border p-2 text-sm"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleLabel(label.id)} />
                      <span
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Subtasks</h4>
                <p className="text-xs text-muted-foreground">
                  <CheckCheck className="mr-1 inline h-3 w-3" />
                  {completedSubtasks}/{localSubtasks.length}
                </p>
              </div>
              <div className="space-y-2">
                {localSubtasks.map((subtask) => (
                  <label key={subtask.id} className="flex items-center gap-2 rounded-md border p-2">
                    <Checkbox
                      checked={subtask.completed}
                      onCheckedChange={(checked) =>
                        toggleSubtaskItem(subtask.id, checked === true)
                      }
                    />
                    <span
                      className={subtask.completed ? "text-muted-foreground line-through" : ""}
                    >
                      {subtask.title}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={subtaskDraft}
                  onChange={(event) => setSubtaskDraft(event.target.value)}
                  placeholder="Add subtask"
                />
                <Button variant="outline" onClick={addSubtaskItem} disabled={isPending}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <h4 className="font-medium">Comments</h4>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {localComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                ) : (
                  localComments.map((comment) => (
                    <div key={comment.id} className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">
                        {comment.userName} • {new Date(comment.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm">{comment.body}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Write a comment"
                  rows={3}
                />
                <Button variant="outline" onClick={submitComment} disabled={isPending}>
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveTask} disabled={isPending || !title.trim()}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
