"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRight,
  GripVertical,
  Inbox,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  createBacklogTask,
  moveTaskToBoard,
  reorderTasks,
} from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isTicketFieldVisible,
  type ProjectTicketFieldSettings,
} from "@/lib/tasks/ticket-fields";
import type { BoardTask, TaskColumn, TaskPriority, TaskType } from "./types";

function makeTaskKey(projectKey: string, taskNumber: number) {
  return `${projectKey}-${String(taskNumber).padStart(3, "0")}`;
}

function formatDueDate(value: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BacklogSortableRow({
  task,
  projectKey,
  columns,
  projectUsers,
  parentLabel,
  statusLabel,
  onOpenTask,
  onMoveToColumn,
  onDragStartNative,
}: {
  task: BoardTask;
  projectKey: string;
  columns: TaskColumn[];
  projectUsers: { id: string; name: string }[];
  parentLabel: string;
  statusLabel: string;
  onOpenTask: (task: BoardTask) => void;
  onMoveToColumn: (taskId: string, columnId: string) => void;
  onDragStartNative: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const assigneeName =
    projectUsers.find((user) => user.id === task.assigneeId)?.name ?? "Unassigned";

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="border-b hover:bg-accent/20"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-nexus-backlog-task", task.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStartNative(task.id);
      }}
    >
      <td className="px-2 py-2">
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-accent"
          {...attributes}
          {...listeners}
          aria-label="Reorder backlog item"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-2 py-2">
        <button
          type="button"
          className="font-mono text-xs text-primary hover:underline"
          onClick={() => onOpenTask(task)}
        >
          {makeTaskKey(projectKey, task.number)}
        </button>
      </td>
      <td className="max-w-[240px] px-2 py-2">
        <button type="button" className="truncate text-left hover:underline" onClick={() => onOpenTask(task)}>
          {task.title}
        </button>
      </td>
      <td className="px-2 py-2 capitalize">{task.type}</td>
      <td className="max-w-[160px] truncate px-2 py-2 text-muted-foreground">{parentLabel}</td>
      <td className="px-2 py-2">{assigneeName}</td>
      <td className="px-2 py-2 capitalize">{task.priority}</td>
      <td className="px-2 py-2">{formatDueDate(task.dueDate)}</td>
      <td className="px-2 py-2">{task.storyPoints ?? "—"}</td>
      <td className="px-2 py-2">{statusLabel}</td>
      <td className="px-2 py-2">
        <Select onValueChange={(columnId) => onMoveToColumn(task.id, columnId)}>
          <SelectTrigger className="h-8 w-[130px]">
            <SelectValue placeholder="To board" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
}

export function TasksBacklogModal({
  open,
  onOpenChange,
  projectId,
  projectKey,
  backlogTasks,
  kanbanColumns,
  columnsById,
  projectUsers,
  parentCandidates,
  fieldSettings,
  onRefresh,
  onOpenTask,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectKey: string;
  backlogTasks: BoardTask[];
  kanbanColumns: TaskColumn[];
  columnsById: Map<string, TaskColumn>;
  projectUsers: { id: string; name: string }[];
  parentCandidates: { id: string; title: string; type: TaskType; number: number }[];
  fieldSettings: ProjectTicketFieldSettings;
  onRefresh: () => Promise<void> | void;
  onOpenTask: (task: BoardTask) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TaskType>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [orderedTasks, setOrderedTasks] = useState(backlogTasks);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<TaskType>("story");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const visible = (key: Parameters<typeof isTicketFieldVisible>[2]) =>
    isTicketFieldVisible(fieldSettings, newType, key);

  useEffect(() => {
    setOrderedTasks(backlogTasks);
  }, [backlogTasks]);

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orderedTasks.filter((task) => {
      const key = makeTaskKey(projectKey, task.number).toLowerCase();
      const matchesSearch =
        !term ||
        key.includes(term) ||
        task.title.toLowerCase().includes(term) ||
        (task.parentTitle ?? "").toLowerCase().includes(term);
      const matchesType = typeFilter === "all" || task.type === typeFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      return matchesSearch && matchesType && matchesPriority;
    });
  }, [orderedTasks, search, typeFilter, priorityFilter, projectKey]);

  const parentLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const candidate of parentCandidates) {
      map.set(
        candidate.id,
        `${makeTaskKey(projectKey, candidate.number)} – ${candidate.title}`
      );
    }
    return map;
  }, [parentCandidates, projectKey]);

  function moveToColumn(taskId: string, columnId: string) {
    startTransition(async () => {
      try {
        await moveTaskToBoard(taskId, columnId);
        await onRefresh();
        toast.success("Moved to board");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to move task");
      }
    });
  }

  function createItem() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      try {
        await createBacklogTask({
          projectId,
          title: newTitle.trim(),
          type: newType,
        });
        setNewTitle("");
        await onRefresh();
        toast.success("Backlog item created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create backlog item");
      }
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedTasks.findIndex((task) => task.id === active.id);
    const newIndex = orderedTasks.findIndex((task) => task.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(orderedTasks, oldIndex, newIndex).map((task, index) => ({
      ...task,
      sortOrder: index,
    }));
    setOrderedTasks(next);

    startTransition(async () => {
      try {
        await reorderTasks(
          next.map((task) => ({
            id: task.id,
            columnId: task.columnId,
            sortOrder: task.sortOrder,
          }))
        );
      } catch (error) {
        setOrderedTasks(backlogTasks);
        toast.error(error instanceof Error ? error.message : "Unable to reorder backlog");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Backlog
            <Badge variant="secondary">{backlogTasks.length}</Badge>
          </DialogTitle>
          <DialogDescription>
            Rank, filter, and create backlog items. Drag rows to reorder, or move items onto board
            columns while this modal is open.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b px-6 py-4">
          <div className="grid gap-2 md:grid-cols-[1fr_140px_140px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search key, title, or parent…"
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as "all" | TaskType)}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="epic">Epic</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="story">Story</SelectItem>
                <SelectItem value="task">Task</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={priorityFilter}
              onValueChange={(value) => setPriorityFilter(value as "all" | TaskPriority)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {visible("type") ? (
              <Select value={newType} onValueChange={(value) => setNewType(value as TaskType)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["epic", "feature", "story", "task"] as TaskType[]).map((type) => (
                    <SelectItem key={type} value={type} className="capitalize">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Quick create backlog item…"
              className="min-w-[240px] flex-1"
              onKeyDown={(event) => {
                if (event.key === "Enter") createItem();
              }}
            />
            <Button onClick={createItem} disabled={!newTitle.trim() || isPending}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {filteredTasks.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {backlogTasks.length === 0
                ? "Backlog is empty. Create your first item above."
                : "No items match your filters."}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 w-8" />
                      <th className="px-2 py-2">Key</th>
                      <th className="px-2 py-2">Title</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Parent</th>
                      <th className="px-2 py-2">Assignee</th>
                      <th className="px-2 py-2">Priority</th>
                      <th className="px-2 py-2">Due</th>
                      <th className="px-2 py-2">Points</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Board</th>
                    </tr>
                  </thead>
                  <SortableContext
                    items={filteredTasks.map((task) => task.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tbody>
                      {filteredTasks.map((task) => (
                        <BacklogSortableRow
                          key={task.id}
                          task={task}
                          projectKey={projectKey}
                          columns={kanbanColumns}
                          projectUsers={projectUsers}
                          parentLabel={
                            task.parentId
                              ? parentLabelById.get(task.parentId) ?? task.parentTitle ?? "—"
                              : "—"
                          }
                          statusLabel={columnsById.get(task.columnId)?.name ?? "Backlog"}
                          onOpenTask={onOpenTask}
                          onMoveToColumn={moveToColumn}
                          onDragStartNative={() => undefined}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </table>
              </div>
            </DndContext>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-6 py-3 text-xs text-muted-foreground">
          <span>
            Drag the grip handle to rank items. Drag a row onto a board column, or use the Board
            dropdown.
          </span>
          <span className="inline-flex items-center gap-1">
            <ArrowRight className="h-3 w-3" />
            {filteredTasks.length} shown
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
