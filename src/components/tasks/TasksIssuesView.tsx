"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BoardTask, ProjectBoard, TaskPriority } from "./types";

function makeTaskKey(projectKey: string, taskNumber: number) {
  return `${projectKey}-${String(taskNumber).padStart(3, "0")}`;
}

const typeOrder = { epic: 0, feature: 1, story: 2, task: 3 };

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
}) {
  const searchTerm = search.trim().toLowerCase();
  const tasks = [...board.tasks]
    .filter((task) => {
      const matchesSearch =
        !searchTerm ||
        task.title.toLowerCase().includes(searchTerm) ||
        (task.description ?? "").toLowerCase().includes(searchTerm) ||
        makeTaskKey(board.project.key, task.number).toLowerCase().includes(searchTerm);
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesAssignee =
        assigneeFilter === "all" ||
        (assigneeFilter === "unassigned" ? !task.assigneeId : task.assigneeId === assigneeFilter);
      return matchesSearch && matchesPriority && matchesAssignee;
    })
    .sort((a, b) => {
      const typeDiff = (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3);
      if (typeDiff !== 0) return typeDiff;
      return a.number - b.number;
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-3">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search issues…"
        />
        <Select
          value={priorityFilter}
          onValueChange={(v) => onPriorityFilterChange(v as "all" | TaskPriority)}
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
        <Select value={assigneeFilter} onValueChange={onAssigneeFilterChange}>
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

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Parent</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No issues match your filters.
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr
                  key={task.id}
                  className="cursor-pointer border-b last:border-b-0 hover:bg-accent/30"
                  onClick={() => onOpenTask(task)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {makeTaskKey(board.project.key, task.number)}
                  </td>
                  <td className="px-4 py-3 capitalize">{task.type}</td>
                  <td className="px-4 py-3 font-medium">{task.title}</td>
                  <td className="px-4 py-3">{task.assigneeName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">
                      {task.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{task.parentTitle ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
