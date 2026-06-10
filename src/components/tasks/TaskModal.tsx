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
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  isTicketFieldVisible,
  type ProjectTicketFieldSettings,
  type TicketFieldKey,
} from "@/lib/tasks/ticket-fields";
import {
  getAllowedParentTypes,
  isParentTypeAllowed,
  type HierarchyRules,
} from "@/lib/tasks/hierarchy";
import { TaskChildSubtasksPanel } from "./TaskChildSubtasksPanel";
import { TaskCommentsPanel } from "./TaskCommentsPanel";
import { TaskLinkedIssuesPanel } from "./TaskLinkedIssuesPanel";
import { TaskLinksAndFilesPanel } from "./TaskLinksAndFilesPanel";
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

function MetadataField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
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
  hierarchyRules,
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
  hierarchyRules: HierarchyRules;
  onOpenLinkedTask: (taskKey: string) => void;
  onTaskSaved: () => Promise<void> | void;
  onTaskDeleted?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState("overview");
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
  const [localChildTasks, setLocalChildTasks] = useState<TaskDetails["childTasks"]>([]);
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
    setLocalChildTasks(taskDetails.childTasks);
    setLocalLinks(taskDetails.links);
    setActiveTab("overview");
  }, [taskDetails]);

  const visible = (key: TicketFieldKey) => isTicketFieldVisible(fieldSettings, taskType, key);

  const completedSubtasks = useMemo(
    () => localSubtasks.filter((item) => item.completed).length,
    [localSubtasks]
  );

  const statusColumn = columns.find((column) => column.id === columnId);

  const filteredParentCandidates = useMemo(() => {
    if (!taskDetails) return [];
    return parentCandidates.filter((candidate) => {
      if (candidate.id === taskDetails.task.id) return false;
      return isParentTypeAllowed(taskType, candidate.type, hierarchyRules);
    });
  }, [hierarchyRules, parentCandidates, taskDetails, taskType]);

  const allowedParentLabels = useMemo(
    () => getAllowedParentTypes(taskType, hierarchyRules),
    [hierarchyRules, taskType]
  );

  const copyTaskUrl = async () => {
    if (!taskKey || typeof window === "undefined") return;
    await navigator.clipboard.writeText(`${window.location.origin}/tasks/${taskKey}`);
    toast.success("Ticket link copied");
  };

  const refreshDetails = async () => {
    await onTaskSaved();
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
        await refreshDetails();
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
        await refreshDetails();
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
        await refreshDetails();
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

  const metadataSidebar = (
    <aside className="space-y-4 lg:border-l lg:pl-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
      <div className="space-y-4">
        {visible("type") ? (
          <MetadataField label="Type">
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
          </MetadataField>
        ) : null}
        {visible("column") ? (
          <MetadataField label="Status">
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
          </MetadataField>
        ) : null}
        {visible("assignee") ? (
          <MetadataField label="Assignee">
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
          </MetadataField>
        ) : null}
        {visible("priority") ? (
          <MetadataField label="Priority">
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
          </MetadataField>
        ) : null}
        {visible("dueDate") ? (
          <MetadataField label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </MetadataField>
        ) : null}
        {visible("storyPoints") ? (
          <MetadataField label="Story points">
            <Input
              type="number"
              min={0}
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value)}
            />
          </MetadataField>
        ) : null}
        {visible("parent") ? (
        <MetadataField label="Parent">
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {filteredParentCandidates.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.type} · {candidate.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {allowedParentLabels.length ? (
            <p className="text-[10px] text-muted-foreground">
              Allowed parent types: {allowedParentLabels.join(", ")}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">This type cannot have a parent.</p>
          )}
        </MetadataField>
        ) : null}
      </div>

      {visible("labels") ? (
        <div className="space-y-2 border-t pt-4">
          <Label>Labels</Label>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => {
              const checked = selectedLabels.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => toggleLabel(label.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                    checked ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                  }`}
                >
                  <span
                    className="inline-flex h-2 w-2 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {visible("subtasks") ? (
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Checklist</h4>
            <p className="text-xs text-muted-foreground">
              <CheckCheck className="mr-1 inline h-3 w-3" />
              {completedSubtasks}/{localSubtasks.length}
            </p>
          </div>
          <div className="space-y-2">
            {localSubtasks.map((subtask) => (
              <label
                key={subtask.id}
                className="flex items-center gap-2 rounded-md border px-2 py-2"
              >
                <Checkbox
                  checked={subtask.completed}
                  onCheckedChange={(checked) =>
                    toggleSubtaskItem(subtask.id, checked === true)
                  }
                />
                <span
                  className={
                    subtask.completed ? "text-muted-foreground line-through" : ""
                  }
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
              onKeyDown={(e) => {
                if (e.key === "Enter") addSubtaskItem();
              }}
            />
            <Button variant="outline" onClick={addSubtaskItem} disabled={isPending}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {taskDetails ? (
        <TaskChildSubtasksPanel
          parentTaskId={taskDetails.task.id}
          childTasks={localChildTasks}
          onOpenTask={onOpenLinkedTask}
          onChange={refreshDetails}
        />
      ) : null}
    </aside>
  );

  const discussionPanel =
    taskDetails && visible("comments") ? (
      <TaskCommentsPanel
        taskId={taskDetails.task.id}
        comments={localComments}
        onChange={setLocalComments}
        embedded={activeTab === "overview"}
      />
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[4vh] flex h-[min(92vh,calc(100vh-2.5rem))] max-h-[92vh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 space-y-3 border-b px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-left">
                <button
                  type="button"
                  onClick={() => void copyTaskUrl()}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {taskKey ?? "Ticket"}
                </button>
                {taskDetails ? (
                  <>
                    <Badge variant="outline" className="capitalize">
                      {taskType}
                    </Badge>
                    {statusColumn ? (
                      <Badge
                        variant="secondary"
                        style={{ borderColor: statusColumn.color }}
                      >
                        {statusColumn.name}
                      </Badge>
                    ) : null}
                  </>
                ) : null}
              </DialogTitle>
              <DialogDescription className="text-left">
                Organized ticket editor with specification, links, files, and discussion.
              </DialogDescription>
            </div>
          </div>
          {!taskDetails ? null : visible("title") ? (
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="text-base font-medium"
              placeholder="Ticket title"
            />
          ) : null}
        </DialogHeader>

        {!taskDetails ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">Loading ticket details…</p>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
                <TabsList className="mb-0 shrink-0 self-start">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="spec">Specification</TabsTrigger>
                  <TabsTrigger value="links">Links & files</TabsTrigger>
                  <TabsTrigger value="discussion">
                    Discussion
                    {localComments.length ? (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        ({localComments.length})
                      </span>
                    ) : null}
                  </TabsTrigger>
                </TabsList>

                <div className="min-h-0 flex-1 overflow-y-auto pt-4">
                  <TabsContent value="overview" className="mt-0">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                      <div className="min-w-0 space-y-6">
                        {visible("description") ? (
                          <div className="space-y-2">
                            <Label htmlFor="task-description" className="text-sm font-semibold">
                              Description
                            </Label>
                            <Textarea
                              id="task-description"
                              value={description}
                              onChange={(event) => setDescription(event.target.value)}
                              rows={8}
                              className="min-h-[180px] resize-y"
                              placeholder="Summary of the work…"
                            />
                          </div>
                        ) : null}
                        {discussionPanel}
                      </div>
                      {metadataSidebar}
                    </div>
                  </TabsContent>

                  <TabsContent value="spec" className="mt-0 space-y-4">
                  {visible("details") ? (
                    <div className="space-y-2">
                      <Label htmlFor="task-details">Details</Label>
                      <Textarea
                        id="task-details"
                        value={details}
                        onChange={(event) => setDetails(event.target.value)}
                        rows={8}
                        placeholder="Extended context, technical notes, implementation guidance…"
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
                        rows={6}
                        placeholder="What must be true for this ticket to be accepted?"
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
                        rows={4}
                        placeholder="Checklist or criteria for completion…"
                      />
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="links" className="mt-0 space-y-4">
                  {visible("attachments") ? (
                    <TaskLinksAndFilesPanel
                      taskId={taskDetails.task.id}
                      attachments={localAttachments}
                      onChange={refreshDetails}
                    />
                  ) : null}
                  {visible("linkedIssues") ? (
                    <TaskLinkedIssuesPanel
                      taskId={taskDetails.task.id}
                      projectId={taskDetails.project.id}
                      links={localLinks}
                      onOpenLinkedTask={onOpenLinkedTask}
                      onChange={refreshDetails}
                    />
                  ) : null}
                </TabsContent>

                <TabsContent value="discussion" className="mt-0">
                  {discussionPanel ?? (
                    <p className="text-sm text-muted-foreground">Comments are hidden for this ticket type.</p>
                  )}
                </TabsContent>
                </div>
              </Tabs>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-background px-6 py-4">
              <Button type="button" variant="destructive" onClick={deleteTaskNow} disabled={isPending}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button onClick={saveTask} disabled={isPending || !title.trim()}>
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
