"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCheck, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSubtask,
  deleteTask,
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
import {
  isTicketFieldVisible,
  type ProjectTicketFieldSettings,
  type TicketFieldKey,
} from "@/lib/tasks/ticket-fields";
import { TaskAttachmentsPanel } from "./TaskAttachmentsPanel";
import { TaskCommentsPanel } from "./TaskCommentsPanel";
import { TaskLinkedIssuesPanel } from "./TaskLinkedIssuesPanel";
import type { TaskColumn, TaskComment, TaskDetails, TaskLabel, TaskPriority, TaskType } from "./types";

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
  projectUsers,
  parentCandidates,
  fieldSettings,
  onOpenLinkedTask,
  onTaskSaved,
  onTaskDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskKey: string | null;
  taskDetails: TaskDetails | null;
  columns: TaskColumn[];
  labels: TaskLabel[];
  projectUsers: { id: string; name: string }[];
  parentCandidates: { id: string; title: string; type: TaskType; number: number }[];
  fieldSettings: ProjectTicketFieldSettings;
  onOpenLinkedTask: (taskKey: string) => void;
  onTaskSaved: () => Promise<void> | void;
  onTaskDeleted?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [definitionOfDone, setDefinitionOfDone] = useState("");
  const [storyPoints, setStoryPoints] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [columnId, setColumnId] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("none");
  const [taskType, setTaskType] = useState<TaskType>("task");
  const [parentId, setParentId] = useState<string>("none");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [localSubtasks, setLocalSubtasks] = useState<TaskDetails["subtasks"]>([]);
  const [localComments, setLocalComments] = useState<TaskComment[]>([]);
  const [localAttachments, setLocalAttachments] = useState<TaskDetails["attachments"]>([]);
  const [localLinks, setLocalLinks] = useState<TaskDetails["links"]>([]);

  useEffect(() => {
    if (!taskDetails) return;
    setTitle(taskDetails.task.title);
    setDescription(taskDetails.task.description ?? "");
    setDetails(taskDetails.task.details ?? "");
    setAcceptanceCriteria(taskDetails.task.acceptanceCriteria ?? "");
    setDefinitionOfDone(taskDetails.task.definitionOfDone ?? "");
    setStoryPoints(taskDetails.task.storyPoints?.toString() ?? "");
    setPriority(taskDetails.task.priority);
    setDueDate(asDateInput(taskDetails.task.dueDate));
    setColumnId(taskDetails.task.columnId);
    setAssigneeId(taskDetails.task.assigneeId ?? "none");
    setTaskType(taskDetails.task.type ?? "task");
    setParentId(taskDetails.task.parentId ?? "none");
    setSelectedLabels(taskDetails.labelIds);
    setLocalSubtasks(taskDetails.subtasks);
    setLocalComments(taskDetails.comments);
    setLocalAttachments(taskDetails.attachments);
    setLocalLinks(taskDetails.links);
  }, [taskDetails]);

  const visible = (key: TicketFieldKey) => isTicketFieldVisible(fieldSettings, taskType, key);

  const completedSubtasks = useMemo(
    () => localSubtasks.filter((item) => item.completed).length,
    [localSubtasks]
  );

  const copyTaskUrl = async () => {
    if (!taskKey || typeof window === "undefined") return;
    await navigator.clipboard.writeText(`${window.location.origin}/tasks/${taskKey}`);
    toast.success("Ticket link copied");
  };

  const saveTask = () => {
    if (!taskDetails) return;
    startTransition(async () => {
      try {
        await updateTask({
          id: taskDetails.task.id,
          title,
          description: description || null,
          details: details || null,
          acceptanceCriteria: acceptanceCriteria || null,
          definitionOfDone: definitionOfDone || null,
          storyPoints: storyPoints.trim() ? Number(storyPoints) : null,
          priority,
          dueDate: asIsoDate(dueDate),
          columnId,
          assigneeId: assigneeId === "none" ? null : assigneeId,
          type: taskType,
          parentId: parentId === "none" ? null : parentId,
        });
        await setTaskLabels(taskDetails.task.id, selectedLabels);
        await onTaskSaved();
        toast.success("Ticket saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save ticket");
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

  const toggleLabel = (labelId: string) => {
    setSelectedLabels((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    );
  };

  const deleteTaskNow = () => {
    if (!taskDetails) return;
    if (!window.confirm(`Delete ticket "${taskDetails.task.title}" permanently?`)) return;
    startTransition(async () => {
      try {
        await deleteTask(taskDetails.task.id);
        toast.success("Ticket deleted");
        onTaskDeleted?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to delete ticket");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void copyTaskUrl()}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
              {taskKey ?? "Ticket"}
            </button>
          </DialogTitle>
          <DialogDescription>
            Edit ticket details, links, attachments, and discussion.
          </DialogDescription>
        </DialogHeader>

        {!taskDetails ? (
          <p className="text-sm text-muted-foreground">Loading ticket details…</p>
        ) : (
          <div className="space-y-6">
            {visible("title") ? (
              <div className="space-y-2">
                <Label htmlFor="task-title">Title</Label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
            ) : null}

            {visible("description") ? (
              <div className="space-y-2">
                <Label htmlFor="task-description">Description</Label>
                <Textarea
                  id="task-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                />
              </div>
            ) : null}

            {visible("details") ? (
              <div className="space-y-2">
                <Label htmlFor="task-details">Details</Label>
                <Textarea
                  id="task-details"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={6}
                  placeholder="Extended context, notes, or technical detail…"
                />
              </div>
            ) : null}

            {visible("acceptanceCriteria") ? (
              <div className="space-y-2">
                <Label htmlFor="task-ac">Acceptance criteria</Label>
                <Textarea
                  id="task-ac"
                  value={acceptanceCriteria}
                  onChange={(event) => setAcceptanceCriteria(event.target.value)}
                  rows={4}
                />
              </div>
            ) : null}

            {visible("definitionOfDone") ? (
              <div className="space-y-2">
                <Label htmlFor="task-dod">Definition of done</Label>
                <Textarea
                  id="task-dod"
                  value={definitionOfDone}
                  onChange={(event) => setDefinitionOfDone(event.target.value)}
                  rows={3}
                />
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              {visible("priority") ? (
                <div className="space-y-2">
                  <Label>Priority</Label>
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
              ) : null}
              {visible("dueDate") ? (
                <div className="space-y-2">
                  <Label htmlFor="task-due-date">Due date</Label>
                  <Input
                    id="task-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
              ) : null}
              {visible("storyPoints") ? (
                <div className="space-y-2">
                  <Label htmlFor="task-points">Story points</Label>
                  <Input
                    id="task-points"
                    type="number"
                    min={0}
                    value={storyPoints}
                    onChange={(event) => setStoryPoints(event.target.value)}
                  />
                </div>
              ) : null}
              {visible("column") ? (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={columnId} onValueChange={setColumnId}>
                    <SelectTrigger>
                      <SelectValue />
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
              ) : null}
              {visible("type") ? (
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
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
                </div>
              ) : null}
              {visible("assignee") ? (
                <div className="space-y-2">
                  <Label>Assignee</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {projectUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {visible("parent") ? (
                <div className="space-y-2">
                  <Label>Parent</Label>
                  <Select value={parentId} onValueChange={setParentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {parentCandidates
                        .filter((candidate) => candidate.id !== taskDetails.task.id)
                        .map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.type} · {candidate.title}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {visible("labels") ? (
              <div className="space-y-2">
                <Label>Labels</Label>
                <div className="grid gap-2 md:grid-cols-2">
                  {labels.map((label) => (
                    <label
                      key={label.id}
                      className="flex items-center gap-2 rounded-md border p-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedLabels.includes(label.id)}
                        onCheckedChange={() => toggleLabel(label.id)}
                      />
                      <span
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {visible("linkedIssues") ? (
              <TaskLinkedIssuesPanel
                taskId={taskDetails.task.id}
                projectId={taskDetails.project.id}
                links={localLinks}
                onOpenLinkedTask={onOpenLinkedTask}
                onChange={onTaskSaved}
              />
            ) : null}

            {visible("attachments") ? (
              <TaskAttachmentsPanel
                taskId={taskDetails.task.id}
                attachments={localAttachments}
                onChange={async () => {
                  await onTaskSaved();
                  if (taskKey) {
                    // attachments refreshed via parent
                  }
                }}
              />
            ) : null}

            {visible("subtasks") ? (
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
                      <span className={subtask.completed ? "text-muted-foreground line-through" : ""}>
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
            ) : null}

            {visible("comments") ? (
              <TaskCommentsPanel
                taskId={taskDetails.task.id}
                comments={localComments}
                onChange={setLocalComments}
              />
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="destructive" onClick={deleteTaskNow} disabled={isPending}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete ticket
              </Button>
              <Button onClick={saveTask} disabled={isPending || !title.trim()}>
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
