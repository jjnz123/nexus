"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type { BoardTask, ProjectBoard } from "./types";

function makeTaskKey(projectKey: string, taskNumber: number) {
  return `${projectKey}-${String(taskNumber).padStart(3, "0")}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function TasksRoadmapView({
  board,
  onOpenTask,
}: {
  board: ProjectBoard;
  onOpenTask: (task: BoardTask) => void;
}) {
  const lanes = useMemo(() => {
    const epics = board.tasks.filter((t) => t.type === "epic");
    const byMonth = new Map<string, BoardTask[]>();

    for (const task of board.tasks) {
      if (!task.dueDate) continue;
      const date = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
      if (Number.isNaN(date.getTime())) continue;
      const key = monthLabel(date);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(task);
    }

    return { epics, months: Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)) };
  }, [board.tasks]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Epics
        </h3>
        {lanes.epics.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No epics yet — create tasks with type Epic in the backlog or task modal.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lanes.epics.map((epic) => {
              const children = board.tasks.filter((t) => t.parentId === epic.id);
              return (
                <button
                  key={epic.id}
                  type="button"
                  onClick={() => onOpenTask(epic)}
                  className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/40"
                >
                  <p className="text-xs text-muted-foreground">
                    {makeTaskKey(board.project.key, epic.number)}
                  </p>
                  <p className="font-semibold">{epic.title}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {children.length} linked item{children.length === 1 ? "" : "s"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Timeline by due date
        </h3>
        {lanes.months.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Add due dates to tasks to populate the roadmap timeline.
          </p>
        ) : (
          lanes.months.map(([month, tasks]) => (
            <div key={month} className="rounded-xl border p-4">
              <h4 className="mb-3 text-sm font-medium">{month}</h4>
              <div className="space-y-2">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-accent/40"
                  >
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {makeTaskKey(board.project.key, task.number)}
                      </p>
                      <p className="text-sm font-medium">{task.title}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {task.type}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
