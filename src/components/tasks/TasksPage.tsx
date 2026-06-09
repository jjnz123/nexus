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
import { Plus, Search, Inbox } from "lucide-react";
import { toast } from "sonner";
import {
  createProject,
  getProjectBoard,
  getProjectUsers,
  getProjects,
  getTaskByKey,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskCard } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TasksSidebar, type TasksSidebarView } from "./TasksSidebar";
import { TasksBacklogPanel } from "./TasksBacklogPanel";
import { TasksIssuesView } from "./TasksIssuesView";
import { TasksRoadmapView } from "./TasksRoadmapView";
import { TasksProjectSettings } from "./TasksProjectSettings";
import type { BoardTask, ProjectBoard, ProjectSummary, TaskDetails, TaskPriority } from "./types";

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
  const [sidebarView, setSidebarView] = useState<TasksSidebarView>("board");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [backlogPanelOpen, setBacklogPanelOpen] = useState(false);
  const [projectUsers, setProjectUsers] = useState<{ id: string; name: string; email: string }[]>(
    []
  );
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [newProjectKey, setNewProjectKey] = useState("");
  const [newProjectName, setNewProjectName] = useState("");

  const [modalOpen, setModalOpen] = useState(Boolean(initialTask));
  const [modalTaskKey, setModalTaskKey] = useState<string | null>(initialTaskKey);
  const [modalTaskDetails, setModalTaskDetails] = useState<TaskDetails | null>(initialTask);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskColumnId, setCreateTaskColumnId] = useState<string | undefined>();

  const sortedColumns = useMemo(
    () => [...(board?.columns ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [board?.columns]
  );

  const kanbanColumns = useMemo(
    () => sortedColumns.filter((column) => !column.isBacklog),
    [sortedColumns]
  );

  const backlogColumn = useMemo(
    () => sortedColumns.find((column) => column.isBacklog) ?? null,
    [sortedColumns]
  );

  const backlogTasks = useMemo(() => {
    if (!board || !backlogColumn) return [];
    return (board.tasks ?? [])
      .filter((task) => task.columnId === backlogColumn.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [board, backlogColumn]);

  const parentCandidates = useMemo(
    () =>
      (board?.tasks ?? []).map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
        number: task.number,
      })),
    [board?.tasks]
  );

  useEffect(() => {
    void getProjectUsers()
      .then(setProjectUsers)
      .catch(() => setProjectUsers([]));
  }, []);

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
      const matchesAssignee =
        assigneeFilter === "all" ||
        (assigneeFilter === "unassigned" ? !task.assigneeId : task.assigneeId === assigneeFilter);
      return matchesSearch && matchesPriority && matchesAssignee;
    });
  }, [board?.tasks, search, priorityFilter, assigneeFilter]);

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
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] min-h-[520px] md:-m-6">
      <TasksSidebar
        activeView={sidebarView}
        onViewChange={setSidebarView}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
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
            <Button onClick={() => openCreateTask(kanbanColumns[0]?.id)}>
              <Plus className="mr-2 h-4 w-4" />
              New task
            </Button>
            <Button variant="outline" onClick={() => setBacklogPanelOpen(true)}>
              <Inbox className="mr-2 h-4 w-4" />
              Backlog
              {backlogTasks.length ? (
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-xs">{backlogTasks.length}</span>
              ) : null}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          {sidebarView === "board" ? (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-[1fr_180px_180px]">
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
                <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assignees</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {projectUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DndContext
                sensors={sensors}
                onDragStart={(event) => setActiveDragId(String(event.active.id))}
                onDragEnd={onDragEnd}
                onDragCancel={() => setActiveDragId(null)}
              >
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {kanbanColumns.map((column) => {
                    const tasks = groupedFiltered[column.id] ?? [];
                    const wipExceeded = column.wipLimit != null && tasks.length > column.wipLimit;
                    return (
                      <KanbanColumn
                        key={column.id}
                        id={column.id}
                        className="w-[280px] shrink-0 rounded-xl border bg-card/50 p-3"
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

                        <SortableContext
                          items={tasks.map((task) => task.id)}
                          strategy={verticalListSortingStrategy}
                        >
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
            </div>
          ) : null}

          {sidebarView === "issues" ? (
            <TasksIssuesView
              board={board}
              search={search}
              onSearchChange={setSearch}
              priorityFilter={priorityFilter}
              onPriorityFilterChange={setPriorityFilter}
              assigneeFilter={assigneeFilter}
              onAssigneeFilterChange={setAssigneeFilter}
              projectUsers={projectUsers}
              onOpenTask={openTaskModal}
            />
          ) : null}

          {sidebarView === "roadmap" ? (
            <TasksRoadmapView board={board} onOpenTask={openTaskModal} />
          ) : null}

          {sidebarView === "settings" ? (
            <TasksProjectSettings board={board} onRefresh={refreshBoard} />
          ) : null}
        </div>
      </div>

      <TasksBacklogPanel
        open={backlogPanelOpen}
        onOpenChange={setBacklogPanelOpen}
        projectId={board.project.id}
        projectKey={board.project.key}
        backlogTasks={backlogTasks}
        onRefresh={refreshBoard}
        onOpenTask={openTaskModal}
      />

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

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        projectId={board.project.id}
        columns={sortedColumns}
        projectUsers={projectUsers}
        parentCandidates={parentCandidates}
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
        projectUsers={projectUsers}
        parentCandidates={parentCandidates}
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
