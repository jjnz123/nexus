"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { commitRoadmapChanges } from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  BoardTask,
  ProjectBoard,
  RoadmapDraftCreate,
  RoadmapDraftUpdate,
  TaskPriority,
  TaskType,
} from "./types";

function makeTaskKey(projectKey: string, taskNumber: number) {
  return `${projectKey}-${String(taskNumber).padStart(3, "0")}`;
}

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

type RoadmapRow = {
  id: string;
  isNew: boolean;
  isDeleted: boolean;
  number: number | null;
  title: string;
  type: TaskType;
  parentId: string | null;
  assigneeId: string | null;
  priority: TaskPriority;
  dueDate: string;
  storyPoints: string;
  columnId: string;
};

const TYPE_ORDER: Record<TaskType, number> = { epic: 0, feature: 1, story: 2, task: 3 };

function hierarchyDepth(taskId: string, rows: RoadmapRow[], cache = new Map<string, number>()): number {
  if (cache.has(taskId)) return cache.get(taskId)!;
  const row = rows.find((entry) => entry.id === taskId);
  if (!row?.parentId) {
    cache.set(taskId, 0);
    return 0;
  }
  const depth = hierarchyDepth(row.parentId, rows, cache) + 1;
  cache.set(taskId, depth);
  return depth;
}

function isHiddenByCollapsedAncestor(
  row: RoadmapRow,
  rows: RoadmapRow[],
  collapsed: Set<string>
): boolean {
  let parentId = row.parentId;
  while (parentId) {
    if (collapsed.has(parentId)) return true;
    parentId = rows.find((entry) => entry.id === parentId)?.parentId ?? null;
  }
  return false;
}

export function TasksRoadmapView({
  board,
  projectUsers,
  onOpenTask,
  onRefresh,
}: {
  board: ProjectBoard;
  projectUsers: { id: string; name: string }[];
  onOpenTask: (task: BoardTask) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [isPending, startTransition] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draftCreates, setDraftCreates] = useState<RoadmapDraftCreate[]>([]);
  const [draftUpdates, setDraftUpdates] = useState<Record<string, RoadmapDraftUpdate>>({});
  const [draftDeletes, setDraftDeletes] = useState<Set<string>>(new Set());

  const defaultColumnId =
    board.columns.find((column) => column.isBacklog)?.id ??
    board.columns.find((column) => !column.isBacklog)?.id ??
    board.columns[0]?.id ??
    "";

  const baseRows = useMemo<RoadmapRow[]>(() => {
    const createRows: RoadmapRow[] = draftCreates.map((item) => ({
      id: item.draftId,
      isNew: true,
      isDeleted: false,
      number: null,
      title: item.title,
      type: item.type,
      parentId: item.parentId,
      assigneeId: item.assigneeId,
      priority: item.priority,
      dueDate: item.dueDate ? asDateInput(item.dueDate) : "",
      storyPoints: item.storyPoints?.toString() ?? "",
      columnId: item.columnId,
    }));

    const existingRows: RoadmapRow[] = board.tasks.map((task) => {
      const patch = draftUpdates[task.id];
      return {
        id: task.id,
        isNew: false,
        isDeleted: draftDeletes.has(task.id),
        number: task.number,
        title: patch?.title ?? task.title,
        type: patch?.type ?? task.type,
        parentId: patch?.parentId !== undefined ? patch.parentId : task.parentId,
        assigneeId: patch?.assigneeId !== undefined ? patch.assigneeId : task.assigneeId,
        priority: patch?.priority ?? task.priority,
        dueDate: asDateInput(patch?.dueDate !== undefined ? patch.dueDate : task.dueDate),
        storyPoints:
          patch?.storyPoints !== undefined
            ? patch.storyPoints?.toString() ?? ""
            : task.storyPoints?.toString() ?? "",
        columnId: patch?.columnId ?? task.columnId,
      };
    });

    return [...existingRows, ...createRows].sort((a, b) => {
      const depthDiff = hierarchyDepth(a.id, [...existingRows, ...createRows]) -
        hierarchyDepth(b.id, [...existingRows, ...createRows]);
      if (depthDiff !== 0) return depthDiff;
      return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    });
  }, [board.tasks, draftCreates, draftUpdates, draftDeletes]);

  const visibleRows = baseRows.filter((row) => !row.isDeleted);

  const pendingCount =
    draftCreates.length + Object.keys(draftUpdates).length + draftDeletes.size;

  const parentOptions = visibleRows.filter((row) => row.id !== undefined);

  function patchRow(rowId: string, patch: Partial<RoadmapRow>) {
    const isDraft = draftCreates.some((item) => item.draftId === rowId);
    if (isDraft) {
      setDraftCreates((prev) =>
        prev.map((item) =>
          item.draftId === rowId
            ? {
                ...item,
                title: patch.title ?? item.title,
                type: patch.type ?? item.type,
                parentId: patch.parentId !== undefined ? patch.parentId : item.parentId,
                assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : item.assigneeId,
                priority: patch.priority ?? item.priority,
                dueDate:
                  patch.dueDate !== undefined ? asIsoDate(patch.dueDate) : item.dueDate,
                storyPoints:
                  patch.storyPoints !== undefined
                    ? patch.storyPoints.trim()
                      ? Number(patch.storyPoints)
                      : null
                    : item.storyPoints,
                columnId: patch.columnId ?? item.columnId,
              }
            : item
        )
      );
      return;
    }

    setDraftUpdates((prev) => ({
      ...prev,
      [rowId]: {
        ...prev[rowId],
        id: rowId,
        title: patch.title ?? prev[rowId]?.title,
        type: patch.type ?? prev[rowId]?.type,
        parentId: patch.parentId !== undefined ? patch.parentId : prev[rowId]?.parentId,
        assigneeId:
          patch.assigneeId !== undefined ? patch.assigneeId : prev[rowId]?.assigneeId,
        priority: patch.priority ?? prev[rowId]?.priority,
        dueDate:
          patch.dueDate !== undefined ? asIsoDate(patch.dueDate) : prev[rowId]?.dueDate,
        storyPoints:
          patch.storyPoints !== undefined
            ? patch.storyPoints.trim()
              ? Number(patch.storyPoints)
              : null
            : prev[rowId]?.storyPoints,
        columnId: patch.columnId ?? prev[rowId]?.columnId,
      },
    }));
  }

  function addRow(type: TaskType) {
    const draftId = `draft-${crypto.randomUUID()}`;
    setDraftCreates((prev) => [
      ...prev,
      {
        draftId,
        title: `New ${type}`,
        type,
        parentId: null,
        assigneeId: null,
        priority: "medium",
        dueDate: null,
        storyPoints: null,
        columnId: defaultColumnId,
      },
    ]);
  }

  function markDeleted(rowId: string) {
    if (rowId.startsWith("draft-")) {
      setDraftCreates((prev) => prev.filter((item) => item.draftId !== rowId));
      return;
    }
    setDraftDeletes((prev) => new Set(prev).add(rowId));
  }

  function discardDraft() {
    setDraftCreates([]);
    setDraftUpdates({});
    setDraftDeletes(new Set());
    toast.message("Roadmap draft discarded");
  }

  function commitDraft() {
    startTransition(async () => {
      try {
        await commitRoadmapChanges({
          projectId: board.project.id,
          creates: draftCreates,
          updates: Object.values(draftUpdates),
          deletes: Array.from(draftDeletes),
        });
        setDraftCreates([]);
        setDraftUpdates({});
        setDraftDeletes(new Set());
        await onRefresh();
        toast.success("Roadmap changes committed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to commit roadmap");
      }
    });
  }

  function toggleCollapse(rowId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  const childCount = (parentId: string) =>
    visibleRows.filter((row) => row.parentId === parentId).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/40 p-4">
        <div>
          <h3 className="text-lg font-semibold">Roadmap</h3>
          <p className="text-sm text-muted-foreground">
            Plan hierarchy, dates, and ownership. Changes stay in draft until you commit.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add item
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["epic", "feature", "story", "task"] as TaskType[]).map((type) => (
                <DropdownMenuItem key={type} onClick={() => addRow(type)} className="capitalize">
                  {type}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" disabled={!pendingCount || isPending} onClick={discardDraft}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Discard
          </Button>
          <Button disabled={!pendingCount || isPending} onClick={commitDraft}>
            <GitCommitHorizontal className="mr-2 h-4 w-4" />
            {isPending ? "Committing…" : `Commit changes${pendingCount ? ` (${pendingCount})` : ""}`}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2 min-w-[220px]">Title</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Parent</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Points</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  No roadmap items yet. Add an epic, feature, story, or task to get started.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const depth = hierarchyDepth(row.id, visibleRows);
                const hasChildren = childCount(row.id) > 0;
                const isCollapsed = collapsed.has(row.id);
                const hiddenByParent = isHiddenByCollapsedAncestor(row, visibleRows, collapsed);

                if (hiddenByParent) return null;

                return (
                  <tr
                    key={row.id}
                    className="border-b last:border-b-0 hover:bg-accent/20"
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1" style={{ paddingLeft: depth * 12 }}>
                        {hasChildren ? (
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                            onClick={() => toggleCollapse(row.id)}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <span className="inline-block w-5" />
                        )}
                        {row.isNew ? (
                          <Badge variant="secondary">Draft</Badge>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => {
                              const task = board.tasks.find((entry) => entry.id === row.id);
                              if (task) onOpenTask(task);
                            }}
                          >
                            {makeTaskKey(board.project.key, row.number ?? 0)}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        value={row.title}
                        onChange={(e) => patchRow(row.id, { title: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select
                        value={row.type}
                        onValueChange={(value) => patchRow(row.id, { type: value as TaskType })}
                      >
                        <SelectTrigger className="w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="epic">Epic</SelectItem>
                          <SelectItem value="feature">Feature</SelectItem>
                          <SelectItem value="story">Story</SelectItem>
                          <SelectItem value="task">Task</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select
                        value={row.parentId ?? "none"}
                        onValueChange={(value) =>
                          patchRow(row.id, { parentId: value === "none" ? null : value })
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {parentOptions
                            .filter((option) => option.id !== row.id)
                            .map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.isNew
                                  ? `Draft · ${option.title}`
                                  : makeTaskKey(board.project.key, option.number ?? 0)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select
                        value={row.assigneeId ?? "none"}
                        onValueChange={(value) =>
                          patchRow(row.id, {
                            assigneeId: value === "none" ? null : value,
                          })
                        }
                      >
                        <SelectTrigger className="w-[130px]">
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
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select
                        value={row.priority}
                        onValueChange={(value) =>
                          patchRow(row.id, { priority: value as TaskPriority })
                        }
                      >
                        <SelectTrigger className="w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => patchRow(row.id, { dueDate: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={row.storyPoints}
                        onChange={(e) => patchRow(row.id, { storyPoints: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select
                        value={row.columnId}
                        onValueChange={(value) => patchRow(row.id, { columnId: value })}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {board.columns.map((column) => (
                            <SelectItem key={column.id} value={column.id}>
                              {column.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => markDeleted(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
