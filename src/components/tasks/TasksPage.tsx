"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Settings2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  createColumn,
  createLabel,
  createProject,
  deleteColumn,
  getProjectBoard,
  getProjects,
  getTaskByKey,
  reorderTasks,
  updateColumn,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import { CreateTaskDialog } from "./CreateTaskDialog";
import type { BoardTask, ProjectBoard, ProjectSummary, TaskDetails, TaskPriority } from "./types";

type ViewMode = "kanban" | "backlog";

function makeTaskKey(projectKey: string, taskNumber: number) {
  return `${projectKey}-${String(taskNumber).padStart(3, "0")}`;
}

function splitTasksByColumn(tasks: BoardTask[]) {
  return tasks.reduce<Record<string, BoardTask[]>>((acc, task) => {
    if (!acc[task.columnId]) acc[task.columnId] = [];
    acc[task.columnId].push(task);
    return acc;
  }, {});
}

function dropIntoColumn(tasks: BoardTask[], activeTaskId: string, targetColumnId: string, overId: string) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const activeTask = taskById.get(activeTaskId);
  if (!activeTask) return tasks;

  const sourceColumnId = activeTask.columnId;
  const grouped = splitTasksByColumn(tasks);

  const sourceList = [...(grouped[sourceColumnId] ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  const targetList =
    sourceColumnId === targetColumnId
      ? sourceList
      : [...(grouped[targetColumnId] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const filteredSource = sourceList.filter((item) => item.id !== activeTaskId);

  let insertIndex = targetList.length;
  const overTaskIndex = targetList.findIndex((item) => item.id === overId);
  if (overTaskIndex >= 0) insertIndex = overTaskIndex;

  const movedTask = { ...activeTask, columnId: targetColumnId };

  const nextTarget = targetList.filter((item) => item.id !== activeTaskId);
  nextTarget.splice(insertIndex, 0, movedTask);

  const nextById = new Map<string, BoardTask>();
  for (const [columnId, list] of Object.entries(grouped)) {
    const finalList =
      columnId === sourceColumnId
        ? sourceColumnId === targetColumnId
          ? nextTarget
          : filteredSource
        : columnId === targetColumnId
          ? nextTarget
          : list.sort((a, b) => a.sortOrder - b.sortOrder);

    finalList.forEach((task, index) => {
      nextById.set(task.id, {
        ...task,
        columnId: columnId === targetColumnId ? targetColumnId : task.columnId,
        sortOrder: index,
      });
    });
  }

  return tasks.map((task) => nextById.get(task.id) ?? task);
}

function KanbanColumn({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: `column-${id}`,
    data: { type: "column", columnId: id },
  });

  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
}

export function TasksPage({
  projects: initialProjects,
  initialBoard,
  initialTask,
  initialTaskKey,
}: {
  projects: ProjectSummary[];
  initialBoard: ProjectBoard | null;
  initialTask: TaskDetails | null;
  initialTaskKey: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [projects, setProjects] = useState(initialProjects);
  const [board, setBoard] = useState<ProjectBoard | null>(initialBoard);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [newProjectKey, setNewProjectKey] = useState("");
  const [newProjectName, setNewProjectName] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnColor, setNewColumnColor] = useState("#6366f1");
  const [newColumnWip, setNewColumnWip] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#22c55e");

  const [modalOpen, setModalOpen] = useState(Boolean(initialTask));
  const [modalTaskKey, setModalTaskKey] = useState<string | null>(initialTaskKey);
  const [modalTaskDetails, setModalTaskDetails] = useState<TaskDetails | null>(initialTask);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskColumnId, setCreateTaskColumnId] = useState<string | undefined>();

  const sortedColumns = useMemo(
    () => [...(board?.columns ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [board?.columns]
  );

  const labelsById = useMemo(
    () => new Map((board?.labels ?? []).map((label) => [label.id, label])),
    [board?.labels]
  );

  const filteredTasks = useMemo(() => {
    const tasks = board?.tasks ?? [];
    const searchTerm = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesSearch =
        !searchTerm ||
        task.title.toLowerCase().includes(searchTerm) ||
        (task.description ?? "").toLowerCase().includes(searchTerm);
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [board?.tasks, search, priorityFilter]);

  const groupedFiltered = useMemo(
    () =>
      filteredTasks.reduce<Record<string, BoardTask[]>>((acc, task) => {
        if (!acc[task.columnId]) acc[task.columnId] = [];
        acc[task.columnId].push(task);
        acc[task.columnId].sort((a, b) => a.sortOrder - b.sortOrder);
        return acc;
      }, {}),
    [filteredTasks]
  );

  const refreshProjects = async () => {
    const next = await getProjects();
    setProjects(next);
  };

  const refreshBoard = async (projectId?: string) => {
    if (!projectId && !board) return;
    const id = projectId ?? board!.project.id;
    const nextBoard = await getProjectBoard(id);
    setBoard(nextBoard);
  };

  const switchProject = (projectId: string) => {
    startTransition(async () => {
      try {
        const nextBoard = await getProjectBoard(projectId);
        setBoard(nextBoard);
        setModalOpen(false);
        setModalTaskDetails(null);
        setModalTaskKey(null);
        router.replace("/tasks");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to switch project");
      }
    });
  };

  const createProjectNow = () => {
    startTransition(async () => {
      try {
        await createProject({ key: newProjectKey.trim().toUpperCase(), name: newProjectName.trim() });
        await refreshProjects();
        setNewProjectKey("");
        setNewProjectName("");
        setProjectDialogOpen(false);
        toast.success("Project created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create project");
      }
    });
  };

  const openTaskModal = (task: BoardTask) => {
    if (!board) return;
    const key = makeTaskKey(board.project.key, task.number);
    setModalTaskKey(key);
    setModalOpen(true);
    router.replace(`/tasks/${key}`);

    startTransition(async () => {
      try {
        const details = await getTaskByKey(key);
        if (!details) {
          toast.error("Task was not found");
          return;
        }
        setModalTaskDetails(details);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to open task");
      }
    });
  };

  const onModalOpenChange = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setModalTaskDetails(null);
      setModalTaskKey(null);
      if (pathname !== "/tasks") router.replace("/tasks");
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!board) return;
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setActiveDragId(null);
      return;
    }

    const overIsColumn = typeof over.id === "string" && over.id.startsWith("column-");
    const targetColumnId = overIsColumn
      ? String(over.id).replace("column-", "")
      : board.tasks.find((task) => task.id === over.id)?.columnId;
    if (!targetColumnId) {
      setActiveDragId(null);
      return;
    }

    const nextTasks = dropIntoColumn(board.tasks, String(active.id), targetColumnId, String(over.id));
    setBoard({ ...board, tasks: nextTasks });
    setActiveDragId(null);

    startTransition(async () => {
      try {
        await reorderTasks(
          nextTasks.map((task) => ({
            id: task.id,
            columnId: task.columnId,
            sortOrder: task.sortOrder,
          }))
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to reorder tasks");
      }
    });
  };

  const createColumnNow = () => {
    if (!board || !newColumnName.trim()) return;
    startTransition(async () => {
      try {
        await createColumn({
          projectId: board.project.id,
          name: newColumnName.trim(),
          color: newColumnColor,
          wipLimit: newColumnWip.trim() ? Number(newColumnWip) : null,
        });
        await refreshBoard();
        setNewColumnName("");
        setNewColumnWip("");
        toast.success("Column created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create column");
      }
    });
  };

  const createLabelNow = () => {
    if (!board || !newLabelName.trim()) return;
    startTransition(async () => {
      try {
        await createLabel({
          projectId: board.project.id,
          name: newLabelName.trim(),
          color: newLabelColor,
        });
        await refreshBoard();
        setNewLabelName("");
        toast.success("Label created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create label");
      }
    });
  };

  const saveColumn = (columnId: string, nextName: string, nextColor: string, nextWip: string) => {
    startTransition(async () => {
      try {
        await updateColumn(columnId, {
          name: nextName.trim(),
          color: nextColor,
          wipLimit: nextWip.trim() ? Number(nextWip) : null,
        });
        await refreshBoard();
        toast.success("Column updated");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update column");
      }
    });
  };

  const deleteColumnNow = (columnId: string, columnName: string) => {
    if (!window.confirm(`Delete column "${columnName}"? Tasks in this column will be removed.`)) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteColumn(columnId);
        await refreshBoard();
        toast.success("Column deleted");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to delete column");
      }
    });
  };

  const openCreateTask = (columnId?: string) => {
    setCreateTaskColumnId(columnId);
    setCreateTaskOpen(true);
  };

  const activeDragTask = board?.tasks.find((task) => task.id === activeDragId);

  if (!board) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-dashed p-10 text-center">
        <h2 className="text-2xl font-semibold">No projects yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your first project to start tracking tasks.
        </p>
        <Button className="mt-4" onClick={() => setProjectDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create project
        </Button>

        <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
              <DialogDescription>Use a short uppercase key like OPS.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="project-key-empty">Project key</Label>
                <Input
                  id="project-key-empty"
                  value={newProjectKey}
                  onChange={(event) => setNewProjectKey(event.target.value)}
                  placeholder="OPS"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="project-name-empty">Project name</Label>
                <Input
                  id="project-name-empty"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="Operations"
                />
              </div>
              <Button
                className="w-full"
                onClick={createProjectNow}
                disabled={!newProjectKey.trim() || !newProjectName.trim() || isPending}
              >
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={board.project.id} onValueChange={switchProject}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name} ({project.key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setProjectDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Project
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => openCreateTask()}>
            <Plus className="mr-2 h-4 w-4" />
            New task
          </Button>
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
            <TabsList>
              <TabsTrigger value="kanban">Kanban</TabsTrigger>
              <TabsTrigger value="backlog">Backlog</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks"
            className="pl-9"
          />
        </div>
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

      {viewMode === "kanban" ? (
        <DndContext
          sensors={sensors}
          onDragStart={(event) => setActiveDragId(String(event.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveDragId(null)}
        >
          <div className="grid gap-4 lg:grid-cols-4">
            {sortedColumns.map((column) => {
              const tasks = groupedFiltered[column.id] ?? [];
              const wipExceeded = column.wipLimit != null && tasks.length > column.wipLimit;
              return (
                <KanbanColumn
                  key={column.id}
                  id={column.id}
                  className="rounded-xl border bg-card/50 p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: column.color }}
                      />
                      <h3 className="truncate text-sm font-semibold">{column.name}</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={
                          wipExceeded
                            ? "border-rose-500/60 text-rose-400"
                            : "border-muted-foreground/40 text-muted-foreground"
                        }
                      >
                        {tasks.length}
                        {column.wipLimit != null ? `/${column.wipLimit}` : ""}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openCreateTask(column.id)}
                        aria-label={`Add task to ${column.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      <AnimatePresence>
                        {tasks.length === 0 ? (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground"
                          >
                            No tasks
                          </motion.div>
                        ) : (
                          tasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              taskKey={makeTaskKey(board.project.key, task.number)}
                              labelsById={labelsById}
                              onClick={() => openTaskModal(task)}
                            />
                          ))
                        )}
                      </AnimatePresence>
                    </div>
                  </SortableContext>
                </KanbanColumn>
              );
            })}
          </div>

          <DragOverlay>
            {activeDragTask ? (
              <TaskCard
                task={activeDragTask}
                taskKey={makeTaskKey(board.project.key, activeDragTask.number)}
                labelsById={labelsById}
                onClick={() => {}}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">
            Backlog ({(groupedFiltered[sortedColumns.find((column) => column.isBacklog)?.id ?? ""] ?? []).length})
          </h3>
          <div className="space-y-2">
            {(groupedFiltered[sortedColumns.find((column) => column.isBacklog)?.id ?? ""] ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No backlog tasks match your filters.
              </p>
            ) : (
              (groupedFiltered[sortedColumns.find((column) => column.isBacklog)?.id ?? ""] ?? []).map(
                (task) => (
                  <button
                    key={task.id}
                    onClick={() => openTaskModal(task)}
                    className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-accent/40"
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {makeTaskKey(board.project.key, task.number)}
                      </p>
                      <p className="font-medium">{task.title}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {task.priority}
                    </Badge>
                  </button>
                )
              )
            )}
          </div>
        </div>
      )}

      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>Use a short uppercase key like OPS.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="project-key">Project key</Label>
              <Input
                id="project-key"
                value={newProjectKey}
                onChange={(event) => setNewProjectKey(event.target.value)}
                placeholder="OPS"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="Operations"
              />
            </div>
            <Button
              className="w-full"
              onClick={createProjectNow}
              disabled={!newProjectKey.trim() || !newProjectName.trim() || isPending}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Board settings</DialogTitle>
            <DialogDescription>Manage columns, WIP limits, and labels.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <section className="space-y-3">
              <h4 className="text-sm font-semibold">Columns</h4>
              {sortedColumns.map((column) => (
                <EditableColumnRow
                  key={column.id}
                  column={column}
                  onSave={saveColumn}
                  onDelete={deleteColumnNow}
                />
              ))}
              <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_140px_120px_auto]">
                <Input
                  value={newColumnName}
                  onChange={(event) => setNewColumnName(event.target.value)}
                  placeholder="Column name"
                />
                <Input
                  value={newColumnColor}
                  onChange={(event) => setNewColumnColor(event.target.value)}
                  placeholder="#6366f1"
                />
                <Input
                  value={newColumnWip}
                  onChange={(event) => setNewColumnWip(event.target.value)}
                  placeholder="WIP"
                  type="number"
                />
                <Button onClick={createColumnNow} disabled={!newColumnName.trim() || isPending}>
                  Add
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold">Labels</h4>
              <div className="flex flex-wrap gap-2">
                {board.labels.map((label) => (
                  <Badge
                    key={label.id}
                    variant="outline"
                    className="border-transparent"
                    style={{ backgroundColor: `${label.color}30`, color: label.color }}
                  >
                    {label.name}
                  </Badge>
                ))}
              </div>
              <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_140px_auto]">
                <Input
                  value={newLabelName}
                  onChange={(event) => setNewLabelName(event.target.value)}
                  placeholder="Label name"
                />
                <Input
                  value={newLabelColor}
                  onChange={(event) => setNewLabelColor(event.target.value)}
                  placeholder="#22c55e"
                />
                <Button onClick={createLabelNow} disabled={!newLabelName.trim() || isPending}>
                  Add
                </Button>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        projectId={board.project.id}
        columns={sortedColumns}
        defaultColumnId={createTaskColumnId}
        onCreated={refreshBoard}
      />

      <TaskModal
        open={modalOpen}
        onOpenChange={onModalOpenChange}
        taskKey={modalTaskKey}
        taskDetails={modalTaskDetails}
        columns={sortedColumns}
        labels={board.labels}
        onTaskSaved={async () => {
          await refreshBoard();
          if (modalTaskKey) {
            const details = await getTaskByKey(modalTaskKey);
            setModalTaskDetails(details);
          }
        }}
        onTaskDeleted={() => {
          setModalOpen(false);
          setModalTaskDetails(null);
          setModalTaskKey(null);
          if (pathname !== "/tasks") router.replace("/tasks");
          void refreshBoard();
        }}
      />
    </div>
  );
}

function EditableColumnRow({
  column,
  onSave,
  onDelete,
}: {
  column: ProjectBoard["columns"][number];
  onSave: (columnId: string, name: string, color: string, wipLimit: string) => void;
  onDelete: (columnId: string, columnName: string) => void;
}) {
  const [name, setName] = useState(column.name);
  const [color, setColor] = useState(column.color);
  const [wipLimit, setWipLimit] = useState(column.wipLimit?.toString() ?? "");

  useEffect(() => {
    setName(column.name);
    setColor(column.color);
    setWipLimit(column.wipLimit?.toString() ?? "");
  }, [column]);

  return (
    <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_140px_120px_auto]">
      <Input value={name} onChange={(event) => setName(event.target.value)} />
      <Input value={color} onChange={(event) => setColor(event.target.value)} />
      <Input
        value={wipLimit}
        onChange={(event) => setWipLimit(event.target.value)}
        placeholder="WIP"
        type="number"
      />
      <Button variant="outline" onClick={() => onSave(column.id, name, color, wipLimit)}>
        Save
      </Button>
      {!column.isBacklog ? (
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => onDelete(column.id, column.name)}
        >
          Delete
        </Button>
      ) : null}
    </div>
  );
}
