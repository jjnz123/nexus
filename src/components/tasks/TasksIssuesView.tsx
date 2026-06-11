"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { bulkDeleteTasks, bulkUpdateTasks } from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import type { BoardTask, ProjectBoard, TaskPriority, TaskType } from "./types";
import { TASK_TYPES, TASK_TYPE_LABELS } from "@/lib/tasks/task-types";

function makeTaskKey(projectKey: string, taskNumber: number) {
  return `${projectKey}-${String(taskNumber).padStart(3, "0")}`;
}

type IssueColumnId =
  | "key"
  | "type"
  | "title"
  | "status"
  | "assignee"
  | "priority"
  | "parent"
  | "dueDate"
  | "storyPoints";

type SortKey = IssueColumnId;
type SortDir = "asc" | "desc";

const COLUMN_DEFS: { id: IssueColumnId; label: string; defaultVisible: boolean }[] = [
  { id: "key", label: "Key", defaultVisible: true },
  { id: "type", label: "Type", defaultVisible: true },
  { id: "title", label: "Title", defaultVisible: true },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "assignee", label: "Assignee", defaultVisible: true },
  { id: "priority", label: "Priority", defaultVisible: true },
  { id: "parent", label: "Parent", defaultVisible: true },
  { id: "dueDate", label: "Due date", defaultVisible: false },
  { id: "storyPoints", label: "Points", defaultVisible: false },
];

const typeOrder: Record<TaskType, number> = {
  epic: 0,
  feature: 1,
  story: 2,
  task: 3,
  subtask: 4,
  bug: 5,
};
const priorityOrder: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function TasksIssuesView({
  board,
  search,
  onSearchChange,
  priorityFilter,
  onPriorityFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  projectUsers,
  onOpenTask,
  onRefresh,
}: {
  board: ProjectBoard;
  search: string;
  onSearchChange: (value: string) => void;
  priorityFilter: "all" | TaskPriority;
  onPriorityFilterChange: (value: "all" | TaskPriority) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  projectUsers: { id: string; name: string }[];
  onOpenTask: (task: BoardTask) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [isPending, startTransition] = useTransition();
  const [typeFilter, setTypeFilter] = useState<"all" | TaskType>("all");
  const [columnFilter, setColumnFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("key");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [visibleColumns, setVisibleColumns] = useState<Record<IssueColumnId, boolean>>(() =>
    Object.fromEntries(COLUMN_DEFS.map((col) => [col.id, col.defaultVisible])) as Record<
      IssueColumnId,
      boolean
    >
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState("none");
  const [bulkColumn, setBulkColumn] = useState("");
  const [bulkPriority, setBulkPriority] = useState<TaskPriority>("medium");

  const columnsById = useMemo(
    () => new Map(board.columns.map((column) => [column.id, column])),
    [board.columns]
  );

  const searchTerm = search.trim().toLowerCase();

  const filteredTasks = useMemo(() => {
    return board.tasks.filter((task) => {
      const key = makeTaskKey(board.project.key, task.number).toLowerCase();
      const matchesSearch =
        !searchTerm ||
        task.title.toLowerCase().includes(searchTerm) ||
        (task.description ?? "").toLowerCase().includes(searchTerm) ||
        key.includes(searchTerm);
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesAssignee =
        assigneeFilter === "all" ||
        (assigneeFilter === "unassigned" ? !task.assigneeId : task.assigneeId === assigneeFilter);
      const matchesType = typeFilter === "all" || task.type === typeFilter;
      const matchesColumn = columnFilter === "all" || task.columnId === columnFilter;
      return matchesSearch && matchesPriority && matchesAssignee && matchesType && matchesColumn;
    });
  }, [
    board.tasks,
    board.project.key,
    searchTerm,
    priorityFilter,
    assigneeFilter,
    typeFilter,
    columnFilter,
  ]);

  const sortedTasks = useMemo(() => {
    const list = [...filteredTasks];
    const dir = sortDir === "asc" ? 1 : -1;

    list.sort((a, b) => {
      switch (sortKey) {
        case "key":
          return (a.number - b.number) * dir;
        case "type":
          return (typeOrder[a.type] - typeOrder[b.type]) * dir;
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "status": {
          const aCol = columnsById.get(a.columnId)?.sortOrder ?? 0;
          const bCol = columnsById.get(b.columnId)?.sortOrder ?? 0;
          return (aCol - bCol) * dir;
        }
        case "assignee":
          return (a.assigneeName ?? "").localeCompare(b.assigneeName ?? "") * dir;
        case "priority":
          return (priorityOrder[a.priority] - priorityOrder[b.priority]) * dir;
        case "parent":
          return (a.parentTitle ?? "").localeCompare(b.parentTitle ?? "") * dir;
        case "dueDate": {
          const aTime = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          const bTime = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          return (aTime - bTime) * dir;
        }
        case "storyPoints":
          return ((a.storyPoints ?? -1) - (b.storyPoints ?? -1)) * dir;
        default:
          return 0;
      }
    });

    return list;
  }, [filteredTasks, sortKey, sortDir, columnsById]);

  const visibleColumnDefs = COLUMN_DEFS.filter((col) => visibleColumns[col.id]);
  const allSelected =
    sortedTasks.length > 0 && sortedTasks.every((task) => selectedIds.has(task.id));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) setSelectedIds(new Set(sortedTasks.map((task) => task.id)));
    else setSelectedIds(new Set());
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function runBulk(action: "assign" | "column" | "priority" | "delete") {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    if (action === "delete") {
      if (!window.confirm(`Delete ${ids.length} selected issue(s)?`)) return;
      startTransition(async () => {
        try {
          await bulkDeleteTasks({ taskIds: ids });
          setSelectedIds(new Set());
          await onRefresh();
          toast.success("Issues deleted");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Bulk delete failed");
        }
      });
      return;
    }

    startTransition(async () => {
      try {
        if (action === "assign") {
          await bulkUpdateTasks({
            taskIds: ids,
            updates: { assigneeId: bulkAssignee === "none" ? null : bulkAssignee },
          });
        } else if (action === "column" && bulkColumn) {
          await bulkUpdateTasks({ taskIds: ids, updates: { columnId: bulkColumn } });
        } else if (action === "priority") {
          await bulkUpdateTasks({ taskIds: ids, updates: { priority: bulkPriority } });
        }
        setSelectedIds(new Set());
        await onRefresh();
        toast.success("Bulk update applied");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Bulk update failed");
      }
    });
  }

  function SortHeader({ column, label }: { column: SortKey; label: string }) {
    const active = sortKey === column;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => toggleSort(column)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search issues by key, title, or description…"
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | TaskType)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TASK_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {TASK_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={columnFilter} onValueChange={setColumnFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {board.columns.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={priorityFilter}
          onValueChange={(v) => onPriorityFilterChange(v as "all" | TaskPriority)}
        >
          <SelectTrigger className="w-[140px]">
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
        <Select value={assigneeFilter} onValueChange={onAssigneeFilterChange}>
          <SelectTrigger className="w-[150px]">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="mr-2 h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {COLUMN_DEFS.map((col) => (
              <DropdownMenuItem
                key={col.id}
                onSelect={(e) => e.preventDefault()}
                onClick={() =>
                  setVisibleColumns((prev) => ({ ...prev, [col.id]: !prev[col.id] }))
                }
              >
                <span className="mr-2">{visibleColumns[col.id] ? "✓" : ""}</span>
                {col.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-muted-foreground">
        {sortedTasks.length} issue{sortedTasks.length === 1 ? "" : "s"}
        {selectedIds.size ? ` · ${selectedIds.size} selected` : ""}
      </p>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Select value={bulkAssignee} onValueChange={setBulkAssignee}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder="Assignee" />
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
          <Button size="sm" variant="secondary" disabled={isPending} onClick={() => runBulk("assign")}>
            Assign
          </Button>
          <Select value={bulkColumn} onValueChange={setBulkColumn}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder="Move to…" />
            </SelectTrigger>
            <SelectContent>
              {board.columns.map((column) => (
                <SelectItem key={column.id} value={column.id}>
                  {column.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="secondary" disabled={isPending || !bulkColumn} onClick={() => runBulk("column")}>
            Move
          </Button>
          <Select value={bulkPriority} onValueChange={(v) => setBulkPriority(v as TaskPriority)}>
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="secondary" disabled={isPending} onClick={() => runBulk("priority")}>
            Set priority
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => runBulk("delete")}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                  aria-label="Select all issues"
                />
              </th>
              {visibleColumnDefs.map((col) => (
                <th key={col.id} className="px-3 py-3">
                  <SortHeader column={col.id} label={col.label} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTasks.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnDefs.length + 1}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No issues match your filters.
                </td>
              </tr>
            ) : (
              sortedTasks.map((task) => (
                <tr
                  key={task.id}
                  className="border-b last:border-b-0 hover:bg-accent/30"
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selectedIds.has(task.id)}
                      onCheckedChange={(checked) => toggleRow(task.id, checked === true)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${makeTaskKey(board.project.key, task.number)}`}
                    />
                  </td>
                  {visibleColumnDefs.map((col) => (
                    <td
                      key={col.id}
                      className="px-3 py-2"
                      onClick={() => onOpenTask(task)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") onOpenTask(task);
                      }}
                    >
                      {col.id === "key" ? (
                        <span className="font-mono text-xs text-primary">
                          {makeTaskKey(board.project.key, task.number)}
                        </span>
                      ) : col.id === "type" ? (
                        <Badge variant="outline" className="capitalize">
                          {task.type}
                        </Badge>
                      ) : col.id === "title" ? (
                        <span className="font-medium">{task.title}</span>
                      ) : col.id === "status" ? (
                        <Badge
                          variant="secondary"
                          style={{
                            borderColor: columnsById.get(task.columnId)?.color,
                          }}
                        >
                          {columnsById.get(task.columnId)?.name ?? "—"}
                        </Badge>
                      ) : col.id === "assignee" ? (
                        task.assigneeName ?? "—"
                      ) : col.id === "priority" ? (
                        <Badge variant="outline" className="capitalize">
                          {task.priority}
                        </Badge>
                      ) : col.id === "parent" ? (
                        <span className="text-muted-foreground">{task.parentTitle ?? "—"}</span>
                      ) : col.id === "dueDate" ? (
                        task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString()
                          : "—"
                      ) : col.id === "storyPoints" ? (
                        task.storyPoints ?? "—"
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
