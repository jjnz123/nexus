"use client";

import { useMemo, useState, useTransition } from "react";
import { createId } from "@/lib/create-id";
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
import { TASK_TYPES, TASK_TYPE_LABELS } from "@/lib/tasks/task-types";
import {
  getAllowedParentTypes,
  isParentTypeAllowed,
  type HierarchyRules,
} from "@/lib/tasks/hierarchy";
import { hierarchyDepth, sortRoadmapRows } from "@/lib/tasks/roadmap-order";

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
  sortOrder: number;
};

function formatRowLabel(projectKey: string, row: RoadmapRow) {
  if (row.isNew) return `Draft · ${row.title}`;
  return `${makeTaskKey(projectKey, row.number ?? 0)} – ${row.title}`;
}

function isDescendant(
  candidateId: string,
  ancestorId: string,
  rows: Pick<RoadmapRow, "id" | "parentId">[]
): boolean {
  let current = rows.find((row) => row.id === candidateId)?.parentId ?? null;
  while (current) {
    if (current === ancestorId) return true;
    current = rows.find((row) => row.id === current)?.parentId ?? null;
  }
  return false;
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
  hierarchyRules,
  onOpenTask,
  onRefresh,
}: {
  board: ProjectBoard;
  projectUsers: { id: string; name: string }[];
  hierarchyRules: HierarchyRules;
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
      sortOrder: item.sortOrder,
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
        sortOrder: patch?.sortOrder ?? task.sortOrder,
      };
    });

    return sortRoadmapRows([...existingRows, ...createRows]);
  }, [board.tasks, draftCreates, draftUpdates, draftDeletes]);

  const visibleRows = baseRows.filter((row) => !row.isDeleted);

  const sortedVisibleRows = useMemo(
    () => sortRoadmapRows(visibleRows),
    [visibleRows]
  );

  const pendingCount =
    draftCreates.length + Object.keys(draftUpdates).length + draftDeletes.size;

  function parentOptionsForRow(row: RoadmapRow) {
    return visibleRows.filter(
      (option) =>
        option.id !== row.id &&
        !isDescendant(option.id, row.id, visibleRows) &&
        isParentTypeAllowed(row.type, option.type, hierarchyRules)
    );
  }

  function nextSortOrder(parentId: string | null, afterSortOrder?: number) {
    const siblings = visibleRows.filter((row) => row.parentId === parentId);
    if (afterSortOrder != null) return afterSortOrder + 1;
    if (!siblings.length) return 0;
    return Math.max(...siblings.map((row) => row.sortOrder)) + 1;
  }

  function bumpSiblingSortOrders(parentId: string | null, fromOrder: number) {
    setDraftCreates((prev) =>
      prev.map((item) =>
        item.parentId === parentId && item.sortOrder >= fromOrder
          ? { ...item, sortOrder: item.sortOrder + 1 }
          : item
      )
    );
    setDraftUpdates((prev) => {
      const next = { ...prev };
      for (const row of visibleRows) {
        if (row.isNew || row.parentId !== parentId || row.sortOrder < fromOrder) continue;
        next[row.id] = {
          ...next[row.id],
          id: row.id,
          sortOrder: row.sortOrder + 1,
        };
      }
      return next;
    });
  }

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
                sortOrder: patch.sortOrder ?? item.sortOrder,
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
        sortOrder: patch.sortOrder ?? prev[rowId]?.sortOrder,
      },
    }));
  }

  function addRow(type: TaskType, afterRowId?: string | null) {
    const draftId = `draft-${createId()}`;
    const afterRow = afterRowId ? visibleRows.find((row) => row.id === afterRowId) : null;
    const parentId = afterRow?.parentId ?? null;
    const sortOrder = afterRow
      ? nextSortOrder(parentId, afterRow.sortOrder)
      : nextSortOrder(null);

    if (afterRow) bumpSiblingSortOrders(parentId, sortOrder);

    setDraftCreates((prev) => [
      ...prev,
      {
        draftId,
        title: `New ${type}`,
        type,
        parentId,
        assigneeId: null,
        priority: "medium",
        dueDate: null,
        storyPoints: null,
        columnId: defaultColumnId,
        sortOrder,
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
              {TASK_TYPES.map((type) => (
                <DropdownMenuItem key={type} onClick={() => addRow(type)}>
                  {TASK_TYPE_LABELS[type]}
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
            {sortedVisibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  No roadmap items yet. Add an epic, feature, story, task, or bug to get started.
                </td>
              </tr>
            ) : (
              sortedVisibleRows.flatMap((row, index) => {
                const depth = hierarchyDepth(row.id, sortedVisibleRows);
                const hasChildren = childCount(row.id) > 0;
                const isCollapsed = collapsed.has(row.id);
                const hiddenByParent = isHiddenByCollapsedAncestor(row, sortedVisibleRows, collapsed);
                const rowParents = parentOptionsForRow(row);
                const allowedParents = getAllowedParentTypes(row.type, hierarchyRules);

                if (hiddenByParent) return [];

                const insertRow = (
                  <tr key={`insert-after-${row.id}`} className="group/insert border-0">
                    <td colSpan={10} className="relative h-0 p-0">
                      <div className="absolute inset-x-0 -top-2 z-10 flex justify-center opacity-0 transition group-hover/insert:opacity-100">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 gap-1 rounded-full px-2 text-[10px] shadow-sm"
                            >
                              <Plus className="h-3 w-3" />
                              Insert below
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center">
                            {TASK_TYPES.map((type) => (
                              <DropdownMenuItem
                                key={type}
                                onClick={() => addRow(type, row.id)}
                              >
                                {TASK_TYPE_LABELS[type]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );

                const dataRow = (
                  <tr
                    key={row.id}
                    className="group/insert border-b last:border-b-0 hover:bg-accent/20"
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
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {rowParents.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {formatRowLabel(board.project.key, option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {allowedParents.length ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Allowed: {allowedParents.join(", ")}
                        </p>
                      ) : null}
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

                return index === sortedVisibleRows.length - 1
                  ? [dataRow, insertRow]
                  : [dataRow, insertRow];
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
