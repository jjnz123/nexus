"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createId } from "@/lib/create-id";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  Columns3,
  GitCommitHorizontal,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { addDays, startOfDay } from "date-fns";
import { toast } from "sonner";
import { commitRoadmapChanges, updateProjectRoadmapSettings } from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DEFAULT_ROADMAP_VISIBLE_COLUMNS,
  ROADMAP_COLUMN_LABELS,
  type RoadmapColumnId,
  type RoadmapSavedView,
  parseProjectRoadmapSettings,
} from "@/lib/tasks/roadmap-settings";
import { RoadmapTimelineBar, RoadmapTimelineHeader } from "./RoadmapTimelineBar";

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
  startDate: string;
  endDate: string;
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
  const roadmapSettings = useMemo(
    () => parseProjectRoadmapSettings(board.project.settings),
    [board.project.settings]
  );
  const [visibleColumns, setVisibleColumns] = useState<RoadmapColumnId[]>(
    roadmapSettings.visibleColumns
  );
  const [savedViews, setSavedViews] = useState<RoadmapSavedView[]>(roadmapSettings.savedViews);
  const [viewNameDraft, setViewNameDraft] = useState("");

  useEffect(() => {
    setVisibleColumns(roadmapSettings.visibleColumns);
    setSavedViews(roadmapSettings.savedViews);
  }, [roadmapSettings]);

  const showColumn = (column: RoadmapColumnId) => visibleColumns.includes(column);
  const columnCount = visibleColumns.length;

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
      startDate: item.startDate ? asDateInput(item.startDate) : "",
      endDate: item.endDate ? asDateInput(item.endDate) : "",
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
        startDate: asDateInput(
          patch?.startDate !== undefined ? patch.startDate : task.startDate
        ),
        endDate: asDateInput(patch?.endDate !== undefined ? patch.endDate : task.endDate),
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
                startDate:
                  patch.startDate !== undefined ? asIsoDate(patch.startDate) : item.startDate,
                endDate:
                  patch.endDate !== undefined ? asIsoDate(patch.endDate) : item.endDate,
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
        startDate:
          patch.startDate !== undefined ? asIsoDate(patch.startDate) : prev[rowId]?.startDate,
        endDate:
          patch.endDate !== undefined ? asIsoDate(patch.endDate) : prev[rowId]?.endDate,
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
        startDate: null,
        endDate: null,
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

  const timelineRange = useMemo(() => {
    const dates: Date[] = [];
    for (const row of visibleRows) {
      if (row.startDate) dates.push(parseInputDate(row.startDate));
      if (row.endDate) dates.push(parseInputDate(row.endDate));
    }
    const today = startOfDay(new Date());
    if (!dates.length) {
      return { start: addDays(today, -7), end: addDays(today, 56) };
    }
    const min = startOfDay(new Date(Math.min(...dates.map((date) => date.getTime()))));
    const max = startOfDay(new Date(Math.max(...dates.map((date) => date.getTime()))));
    return { start: addDays(min, -7), end: addDays(max, 21) };
  }, [visibleRows]);

  function parseInputDate(value: string) {
    return startOfDay(new Date(`${value}T12:00:00.000Z`));
  }

  function persistRoadmapSettings(
    nextVisibleColumns: RoadmapColumnId[],
    nextSavedViews: RoadmapSavedView[],
    activeViewId: string | null = roadmapSettings.activeViewId
  ) {
    startTransition(async () => {
      try {
        await updateProjectRoadmapSettings({
          projectId: board.project.id,
          roadmapSettings: {
            visibleColumns: nextVisibleColumns,
            savedViews: nextSavedViews,
            activeViewId,
          },
        });
        setVisibleColumns(nextVisibleColumns);
        setSavedViews(nextSavedViews);
        await onRefresh();
        toast.success("Roadmap view saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save roadmap view");
      }
    });
  }

  function saveCurrentView() {
    const name = viewNameDraft.trim() || `View ${savedViews.length + 1}`;
    const view: RoadmapSavedView = {
      id: createId(),
      name,
      visibleColumns: [...visibleColumns],
    };
    persistRoadmapSettings(visibleColumns, [...savedViews, view], view.id);
    setViewNameDraft("");
  }

  function applySavedView(viewId: string) {
    const view = savedViews.find((entry) => entry.id === viewId);
    if (!view) return;
    persistRoadmapSettings(view.visibleColumns, savedViews, viewId);
  }

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
              <Button variant="outline" size="sm">
                <Columns3 className="mr-2 h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {DEFAULT_ROADMAP_VISIBLE_COLUMNS.filter((column) => column !== "delete").map(
                (column) => (
                  <label
                    key={column}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={visibleColumns.includes(column)}
                      onCheckedChange={(checked) => {
                        setVisibleColumns((prev) => {
                          if (checked === true) {
                            return prev.includes(column) ? prev : [...prev, column];
                          }
                          const next = prev.filter((entry) => entry !== column);
                          return next.length ? next : prev;
                        });
                      }}
                    />
                    {ROADMAP_COLUMN_LABELS[column]}
                  </label>
                )
              )}
              <div className="border-t p-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => persistRoadmapSettings(visibleColumns, savedViews)}
                >
                  Save columns
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Bookmark className="mr-2 h-4 w-4" />
                Views
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {savedViews.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet.</p>
              ) : (
                savedViews.map((view) => (
                  <DropdownMenuItem key={view.id} onClick={() => applySavedView(view.id)}>
                    {view.name}
                  </DropdownMenuItem>
                ))
              )}
              <div className="space-y-2 border-t p-2">
                <Input
                  value={viewNameDraft}
                  onChange={(event) => setViewNameDraft(event.target.value)}
                  placeholder="View name"
                  className="h-8"
                />
                <Button size="sm" className="w-full" onClick={saveCurrentView}>
                  <Save className="mr-2 h-3.5 w-3.5" />
                  Save current view
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
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
              {showColumn("key") ? <th className="px-3 py-2">Key</th> : null}
              {showColumn("title") ? <th className="min-w-[220px] px-3 py-2">Title</th> : null}
              {showColumn("type") ? <th className="px-3 py-2">Type</th> : null}
              {showColumn("parent") ? <th className="px-3 py-2">Parent</th> : null}
              {showColumn("assignee") ? <th className="px-3 py-2">Assignee</th> : null}
              {showColumn("priority") ? <th className="px-3 py-2">Priority</th> : null}
              {showColumn("dueDate") ? <th className="px-3 py-2">Due</th> : null}
              {showColumn("startDate") ? <th className="px-3 py-2">Start</th> : null}
              {showColumn("endDate") ? <th className="px-3 py-2">End</th> : null}
              {showColumn("storyPoints") ? <th className="px-3 py-2">Points</th> : null}
              {showColumn("status") ? <th className="px-3 py-2">Status</th> : null}
              {showColumn("timeline") ? (
                <th className="min-w-[320px] px-3 py-2">
                  <RoadmapTimelineHeader
                    rangeStart={timelineRange.start}
                    rangeEnd={timelineRange.end}
                  />
                </th>
              ) : null}
              {showColumn("delete") ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {sortedVisibleRows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-8 text-center text-muted-foreground">
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
                    <td colSpan={columnCount} className="relative h-0 p-0">
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
                    {showColumn("key") ? (
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
                    ) : null}
                    {showColumn("title") ? (
                      <td className="px-3 py-2 align-top">
                        <Input
                          value={row.title}
                          onChange={(e) => patchRow(row.id, { title: e.target.value })}
                        />
                      </td>
                    ) : null}
                    {showColumn("type") ? (
                      <td className="px-3 py-2 align-top">
                        <Select
                          value={row.type}
                          onValueChange={(value) => patchRow(row.id, { type: value as TaskType })}
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {TASK_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    ) : null}
                    {showColumn("parent") ? (
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
                    ) : null}
                    {showColumn("assignee") ? (
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
                    ) : null}
                    {showColumn("priority") ? (
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
                    ) : null}
                    {showColumn("dueDate") ? (
                      <td className="px-3 py-2 align-top">
                        <Input
                          type="date"
                          value={row.dueDate}
                          onChange={(e) => patchRow(row.id, { dueDate: e.target.value })}
                        />
                      </td>
                    ) : null}
                    {showColumn("startDate") ? (
                      <td className="px-3 py-2 align-top">
                        <Input
                          type="date"
                          value={row.startDate}
                          onChange={(e) => patchRow(row.id, { startDate: e.target.value })}
                        />
                      </td>
                    ) : null}
                    {showColumn("endDate") ? (
                      <td className="px-3 py-2 align-top">
                        <Input
                          type="date"
                          value={row.endDate}
                          onChange={(e) => patchRow(row.id, { endDate: e.target.value })}
                        />
                      </td>
                    ) : null}
                    {showColumn("storyPoints") ? (
                      <td className="px-3 py-2 align-top">
                        <Input
                          type="number"
                          min={0}
                          className="w-20"
                          value={row.storyPoints}
                          onChange={(e) => patchRow(row.id, { storyPoints: e.target.value })}
                        />
                      </td>
                    ) : null}
                    {showColumn("status") ? (
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
                    ) : null}
                    {showColumn("timeline") ? (
                      <td className="px-3 py-2 align-top">
                        <RoadmapTimelineBar
                          startDate={row.startDate}
                          endDate={row.endDate}
                          rangeStart={timelineRange.start}
                          rangeEnd={timelineRange.end}
                          onChange={(startDate, endDate) =>
                            patchRow(row.id, { startDate, endDate })
                          }
                        />
                      </td>
                    ) : null}
                    {showColumn("delete") ? (
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
                    ) : null}
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
