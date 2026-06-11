"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
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
  moveTaskToBoard,
} from "@/server/actions/tasks";
import { updateBookmarkPreferences } from "@/server/actions/preferences";
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
import { TaskCard, TaskCardPreview, type BoardCardChild } from "./TaskCard";
import { TaskModal } from "./TaskModal";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TasksSidebar, type TasksSidebarView } from "./TasksSidebar";
import { TasksBacklogModal } from "./TasksBacklogModal";
import { TasksIssuesView } from "./TasksIssuesView";
import { TasksRoadmapView } from "./TasksRoadmapView";
import { TasksProjectSettings } from "./TasksProjectSettings";
import { TasksViewSwitcher } from "./TasksViewSwitcher";
import type { BoardTask, ProjectBoard, ProjectSummary, TaskDetails, TaskPriority } from "./types";
import {
  parseProjectTicketFieldSettings,
} from "@/lib/tasks/ticket-fields";
import { parseProjectHierarchyRules } from "@/lib/tasks/hierarchy";
import { parseProjectBoardSettings } from "@/lib/tasks/project-settings";
import {
  boardVisibleTypeMatches,
  getDefaultBoardTypeFilter,
  type BoardTypeFilter,
} from "@/lib/tasks/task-types";
import {
  DEFAULT_TASKS_WORKSPACE,
  type TasksWorkspacePrefs,
} from "@/lib/preferences/workspace";
import type { RoadmapColumnId } from "@/lib/tasks/roadmap-settings";
import { cn } from "@/lib/utils";

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

const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const activeColumnId = args.active.data.current?.columnId as string | undefined;

    const columnHit = pointerHits.find((hit) => String(hit.id).startsWith("column-"));
    if (columnHit) {
      const targetColumnId = String(columnHit.id).replace("column-", "");
      if (activeColumnId && targetColumnId !== activeColumnId) {
        return [columnHit];
      }
    }

    const taskHit = pointerHits.find((hit) => {
      const id = String(hit.id);
      if (id.startsWith("column-")) return false;
      const overColumnId = hit.data?.current?.columnId as string | undefined;
      return Boolean(activeColumnId && overColumnId && overColumnId !== activeColumnId);
    });
    if (taskHit) return [taskHit];

    return pointerHits;
  }
  return closestCorners(args);
};

function resolveDropTarget(
  overId: string | number | undefined,
  tasks: BoardTask[]
): string | null {
  if (overId == null) return null;
  const id = String(overId);
  if (id.startsWith("column-")) return id.replace("column-", "");
  return tasks.find((task) => task.id === id)?.columnId ?? null;
}

function wouldExceedWipLimit(
  tasks: BoardTask[],
  activeTaskId: string,
  targetColumnId: string,
  wipLimit: number
) {
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  if (!activeTask || activeTask.columnId === targetColumnId) return false;

  const targetCount = tasks.filter((task) => task.columnId === targetColumnId).length;
  return targetCount + 1 > wipLimit;
}

function dropIntoColumn(tasks: BoardTask[], activeTaskId: string, targetColumnId: string, overId: string) {
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  if (!activeTask) return tasks;

  const sourceColumnId = activeTask.columnId;
  const grouped = splitTasksByColumn(tasks);

  if (sourceColumnId === targetColumnId) {
    const columnTasks = [...(grouped[sourceColumnId] ?? [])]
      .filter((task) => task.id !== activeTaskId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    let insertIndex = columnTasks.length;
    if (!overId.startsWith("column-")) {
      const overTaskIndex = columnTasks.findIndex((task) => task.id === overId);
      if (overTaskIndex >= 0) insertIndex = overTaskIndex;
    }

    columnTasks.splice(insertIndex, 0, activeTask);
    const reindexed = columnTasks.map((task, index) => ({
      ...task,
      columnId: targetColumnId,
      sortOrder: index,
    }));
    const nextById = new Map(reindexed.map((task) => [task.id, task]));
    return tasks.map((task) => nextById.get(task.id) ?? task);
  }

  const sourceList = [...(grouped[sourceColumnId] ?? [])]
    .filter((task) => task.id !== activeTaskId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const targetList = [...(grouped[targetColumnId] ?? [])]
    .filter((task) => task.id !== activeTaskId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  let insertIndex = targetList.length;
  if (!overId.startsWith("column-")) {
    const overTaskIndex = targetList.findIndex((task) => task.id === overId);
    if (overTaskIndex >= 0) insertIndex = overTaskIndex;
  }

  const movedTask = { ...activeTask, columnId: targetColumnId };
  targetList.splice(insertIndex, 0, movedTask);

  const nextSource = sourceList.map((task, index) => ({ ...task, sortOrder: index }));
  const nextTarget = targetList.map((task, index) => ({ ...task, sortOrder: index, columnId: targetColumnId }));

  const nextById = new Map<string, BoardTask>();
  for (const task of tasks) {
    if (task.id === activeTaskId) continue;
    if (task.columnId === sourceColumnId) {
      const updated = nextSource.find((entry) => entry.id === task.id);
      if (updated) nextById.set(task.id, updated);
      continue;
    }
    if (task.columnId === targetColumnId) {
      const updated = nextTarget.find((entry) => entry.id === task.id);
      if (updated) nextById.set(task.id, updated);
      continue;
    }
    nextById.set(task.id, task);
  }

  nextById.set(activeTaskId, nextTarget.find((task) => task.id === activeTaskId) ?? movedTask);

  return tasks.map((task) => nextById.get(task.id) ?? task);
}

function KanbanColumn({
  id,
  className,
  children,
  isDragTarget,
  onBacklogDrop,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
  isDragTarget?: boolean;
  onBacklogDrop?: (taskId: string, columnId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${id}`,
    data: { type: "column", columnId: id },
  });

  const highlighted = isOver || isDragTarget;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        highlighted && "border-primary bg-primary/5 ring-2 ring-primary/30"
      )}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-nexus-backlog-task")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => {
        const taskId = event.dataTransfer.getData("application/x-nexus-backlog-task");
        if (taskId && onBacklogDrop) {
          event.preventDefault();
          onBacklogDrop(taskId, id);
        }
      }}
      data-over={isOver ? "true" : undefined}
    >
      {children}
    </div>
  );
}

export function TasksPage({
  projects: initialProjects,
  initialBoard,
  initialTask,
  initialTaskKey,
  tasksWorkspace = DEFAULT_TASKS_WORKSPACE,
}: {
  projects: ProjectSummary[];
  initialBoard: ProjectBoard | null;
  initialTask: TaskDetails | null;
  initialTaskKey: string | null;
  tasksWorkspace?: TasksWorkspacePrefs;
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
  const [boardTypeFilter, setBoardTypeFilter] = useState<BoardTypeFilter>("all");
  const boardFilterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());

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

  const ticketFieldSettings = useMemo(
    () => parseProjectTicketFieldSettings(board?.project.settings),
    [board?.project.settings]
  );

  const hierarchyRules = useMemo(
    () => parseProjectHierarchyRules(board?.project.settings),
    [board?.project.settings]
  );

  const boardSettings = useMemo(
    () => parseProjectBoardSettings(board?.project.settings),
    [board?.project.settings]
  );

  useEffect(() => {
    if (!board) return;
    const saved = tasksWorkspace.boardFilters?.[board.project.id];
    setBoardTypeFilter(saved ?? getDefaultBoardTypeFilter(boardSettings.bugBoardMode));
  }, [board, boardSettings.bugBoardMode, tasksWorkspace.boardFilters]);

  const persistBoardTypeFilter = useCallback(
    (filter: BoardTypeFilter) => {
      if (!board) return;
      if (boardFilterTimerRef.current) clearTimeout(boardFilterTimerRef.current);
      boardFilterTimerRef.current = setTimeout(() => {
        void updateBookmarkPreferences({
          tasksWorkspace: {
            descriptionHeight: tasksWorkspace.descriptionHeight,
            boardFilters: {
              ...tasksWorkspace.boardFilters,
              [board.project.id]: filter,
            },
            roadmapColumnWidths: tasksWorkspace.roadmapColumnWidths,
          },
        });
      }, 300);
    },
    [
      board,
      tasksWorkspace.boardFilters,
      tasksWorkspace.descriptionHeight,
      tasksWorkspace.roadmapColumnWidths,
    ]
  );

  const persistRoadmapColumnWidths = useCallback(
    (widths: Partial<Record<RoadmapColumnId, number>>) => {
      if (!board) return;
      void updateBookmarkPreferences({
        tasksWorkspace: {
          descriptionHeight: tasksWorkspace.descriptionHeight,
          boardFilters: tasksWorkspace.boardFilters,
          roadmapColumnWidths: {
            ...tasksWorkspace.roadmapColumnWidths,
            [board.project.id]: widths,
          },
        },
      });
    },
    [
      board,
      tasksWorkspace.boardFilters,
      tasksWorkspace.descriptionHeight,
      tasksWorkspace.roadmapColumnWidths,
    ]
  );

  const handleBoardTypeFilterChange = (filter: BoardTypeFilter) => {
    setBoardTypeFilter(filter);
    persistBoardTypeFilter(filter);
  };

  useEffect(() => {
    return () => {
      if (boardFilterTimerRef.current) clearTimeout(boardFilterTimerRef.current);
    };
  }, []);

  const columnsById = useMemo(
    () => new Map((board?.columns ?? []).map((column) => [column.id, column])),
    [board?.columns]
  );

  const childCountByParentId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of board?.tasks ?? []) {
      if (!task.parentId) continue;
      counts.set(task.parentId, (counts.get(task.parentId) ?? 0) + 1);
    }
    return counts;
  }, [board?.tasks]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, BoardCardChild[]>();
    if (!board) return map;
    for (const task of board.tasks) {
      if (!task.parentId) continue;
      const list = map.get(task.parentId) ?? [];
      list.push({
        id: task.id,
        key: makeTaskKey(board.project.key, task.number),
        title: task.title,
        type: task.type,
        sortOrder: task.sortOrder,
      } as BoardCardChild & { sortOrder: number });
      map.set(task.parentId, list);
    }
    for (const [parentId, list] of map) {
      map.set(
        parentId,
        (list as Array<BoardCardChild & { sortOrder: number }>)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(({ id, key, title, type }) => ({ id, key, title, type }))
      );
    }
    return map;
  }, [board]);

  const parentKeyById = useMemo(() => {
    const map = new Map<string, string>();
    if (!board) return map;
    for (const task of board.tasks) {
      map.set(task.id, makeTaskKey(board.project.key, task.number));
    }
    return map;
  }, [board]);

  const columnWipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of board?.tasks ?? []) {
      if (backlogColumn && task.columnId === backlogColumn.id) continue;
      counts[task.columnId] = (counts[task.columnId] ?? 0) + 1;
    }
    return counts;
  }, [board?.tasks, backlogColumn]);

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

  const boardDisplayTasks = useMemo(() => {
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
      const matchesType = boardVisibleTypeMatches(
        task.type,
        boardSettings.visibleTypes,
        boardTypeFilter
      );
      return matchesSearch && matchesPriority && matchesAssignee && matchesType;
    });
  }, [
    board?.tasks,
    search,
    priorityFilter,
    assigneeFilter,
    boardSettings.visibleTypes,
    boardTypeFilter,
  ]);

  const boardRootTasks = useMemo(
    () => boardDisplayTasks.filter((task) => !task.parentId),
    [boardDisplayTasks]
  );

  const groupedFiltered = useMemo(
    () =>
      boardRootTasks.reduce<Record<string, BoardTask[]>>((acc, task) => {
        if (!acc[task.columnId]) acc[task.columnId] = [];
        acc[task.columnId].push(task);
        acc[task.columnId].sort((a, b) => a.sortOrder - b.sortOrder);
        return acc;
      }, {}),
    [boardRootTasks]
  );

  const toggleCardSubtasks = (taskId: string) => {
    setExpandedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

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
        await updateBookmarkPreferences({ activeKanbanProjectId: projectId });
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

  const onDragOver = (event: DragOverEvent) => {
    if (!board) return;
    const { over } = event;
    if (!over) {
      setDragOverColumnId(null);
      return;
    }
    setDragOverColumnId(resolveDropTarget(over.id, board.tasks));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const lastHighlightedColumn = dragOverColumnId;
    setDragOverColumnId(null);
    if (!board) return;
    const { active, over, collisions } = event;
    const overId = over?.id ?? collisions?.[0]?.id;
    if (!overId && !lastHighlightedColumn) {
      setActiveDragId(null);
      return;
    }

    const activeId = String(active.id);
    if (overId && active.id === overId) {
      setActiveDragId(null);
      return;
    }

    const targetColumnId =
      resolveDropTarget(overId, board.tasks) ?? lastHighlightedColumn;
    if (!targetColumnId) {
      setActiveDragId(null);
      return;
    }

    const effectiveOverId =
      overId != null ? String(overId) : `column-${targetColumnId}`;

    const activeTask = board.tasks.find((task) => task.id === activeId);
    const targetColumn = board.columns.find((column) => column.id === targetColumnId);
    const previousTasks = board.tasks;

    if (
      activeTask &&
      targetColumn?.wipLimit != null &&
      wouldExceedWipLimit(previousTasks, activeId, targetColumnId, targetColumn.wipLimit)
    ) {
      toast.warning(
        `WIP limit reached for ${targetColumn.name} (${targetColumn.wipLimit}). Remove or move a ticket first.`
      );
      setActiveDragId(null);
      return;
    }

    const nextTasks = dropIntoColumn(board.tasks, activeId, targetColumnId, effectiveOverId);
    setBoard({ ...board, tasks: nextTasks });
    setActiveDragId(null);

    startTransition(async () => {
      try {
        const previousById = new Map(previousTasks.map((task) => [task.id, task]));
        const changedTasks = nextTasks.filter((task) => {
          const before = previousById.get(task.id);
          return (
            !before ||
            before.columnId !== task.columnId ||
            before.sortOrder !== task.sortOrder
          );
        });

        if (changedTasks.length === 0) return;

        await reorderTasks(
          changedTasks.map((task) => ({
            id: task.id,
            columnId: task.columnId,
            sortOrder: task.sortOrder,
          }))
        );
        await refreshBoard();
      } catch (error) {
        setBoard({ ...board, tasks: previousTasks });
        toast.error(error instanceof Error ? error.message : "Unable to reorder tasks");
      }
    });
  };

  const onBacklogDropToColumn = (taskId: string, columnId: string) => {
    const targetColumn = board?.columns.find((column) => column.id === columnId);
    if (
      targetColumn?.wipLimit != null &&
      wouldExceedWipLimit(board?.tasks ?? [], taskId, columnId, targetColumn.wipLimit)
    ) {
      toast.warning(
        `WIP limit reached for ${targetColumn.name} (${targetColumn.wipLimit}). Remove or move a ticket first.`
      );
      return;
    }

    startTransition(async () => {
      try {
        await moveTaskToBoard(taskId, columnId);
        await refreshBoard();
        toast.success("Moved to board");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to move task");
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
          <div className="flex flex-wrap items-center gap-3">
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
            {sidebarView !== "settings" ? (
              <TasksViewSwitcher activeView={sidebarView} onViewChange={setSidebarView} />
            ) : null}
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

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Show
                </span>
                {(
                  [
                    { value: "all", label: "All" },
                    { value: "others", label: "Other tickets" },
                    { value: "bugs", label: "Bugs only" },
                  ] as const
                ).map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={boardTypeFilter === option.value ? "secondary" : "outline"}
                    onClick={() => handleBoardTypeFilterChange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={boardCollisionDetection}
                onDragStart={(event) => setActiveDragId(String(event.active.id))}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
                onDragCancel={() => {
                  setActiveDragId(null);
                  setDragOverColumnId(null);
                }}
              >
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {kanbanColumns.map((column) => {
                    const tasks = groupedFiltered[column.id] ?? [];
                    const wipCount = columnWipCounts[column.id] ?? 0;
                    const wipExceeded = column.wipLimit != null && wipCount > column.wipLimit;
                    return (
                      <KanbanColumn
                        key={column.id}
                        id={column.id}
                        isDragTarget={dragOverColumnId === column.id && activeDragId != null}
                        onBacklogDrop={backlogPanelOpen ? onBacklogDropToColumn : undefined}
                        className="w-[280px] shrink-0 rounded-xl border bg-card/50 p-3 transition-colors"
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
                              {wipCount}
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
                          <div className="min-h-[120px] space-y-2">
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
                                    cardFields={boardSettings.cardFields}
                                    staleDays={boardSettings.staleDays}
                                    childTasks={childrenByParentId.get(task.id) ?? []}
                                    childTaskCount={childCountByParentId.get(task.id) ?? 0}
                                    subtasksExpanded={expandedCardIds.has(task.id)}
                                    onToggleSubtasks={() => toggleCardSubtasks(task.id)}
                                    onOpenChild={(key) => {
                                      const match = board.tasks.find(
                                        (entry) =>
                                          makeTaskKey(board.project.key, entry.number) === key
                                      );
                                      if (match) openTaskModal(match);
                                    }}
                                    parentKey={
                                      task.parentId ? parentKeyById.get(task.parentId) ?? null : null
                                    }
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

                <DragOverlay dropAnimation={null}>
                  {activeDragTask ? (
                    <TaskCardPreview
                      task={activeDragTask}
                      taskKey={makeTaskKey(board.project.key, activeDragTask.number)}
                      labelsById={labelsById}
                      cardFields={boardSettings.cardFields}
                      staleDays={boardSettings.staleDays}
                      childTasks={childrenByParentId.get(activeDragTask.id) ?? []}
                      childTaskCount={childCountByParentId.get(activeDragTask.id) ?? 0}
                      subtasksExpanded={expandedCardIds.has(activeDragTask.id)}
                      parentKey={
                        activeDragTask.parentId
                          ? parentKeyById.get(activeDragTask.parentId) ?? null
                          : null
                      }
                      className="rotate-2 shadow-lg ring-2 ring-primary/40"
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
              onRefresh={refreshBoard}
            />
          ) : null}

          {sidebarView === "roadmap" ? (
            <TasksRoadmapView
              board={board}
              projectUsers={projectUsers}
              hierarchyRules={hierarchyRules}
              onOpenTask={openTaskModal}
              onRefresh={refreshBoard}
              initialColumnWidths={tasksWorkspace.roadmapColumnWidths?.[board.project.id]}
              onColumnWidthsChange={persistRoadmapColumnWidths}
            />
          ) : null}

          {sidebarView === "settings" ? (
            <TasksProjectSettings board={board} onRefresh={refreshBoard} />
          ) : null}
        </div>
      </div>

      <TasksBacklogModal
        open={backlogPanelOpen}
        onOpenChange={setBacklogPanelOpen}
        projectId={board.project.id}
        projectKey={board.project.key}
        backlogTasks={backlogTasks}
        kanbanColumns={kanbanColumns}
        columnsById={columnsById}
        projectUsers={projectUsers}
        parentCandidates={parentCandidates}
        fieldSettings={ticketFieldSettings}
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
        fieldSettings={ticketFieldSettings}
        hierarchyRules={hierarchyRules}
        onOpenLinkedTask={(key) => {
          const match = board.tasks.find(
            (task) => makeTaskKey(board.project.key, task.number) === key
          );
          if (match) openTaskModal(match);
          else {
            setModalTaskKey(key);
            setModalOpen(true);
            router.replace(`/tasks/${key}`);
            startTransition(async () => {
              const details = await getTaskByKey(key);
              setModalTaskDetails(details);
            });
          }
        }}
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
