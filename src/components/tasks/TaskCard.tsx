"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Calendar, Flag, GripVertical } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BoardTask, TaskLabel } from "./types";

const priorityTone: Record<BoardTask["priority"], string> = {
  low: "text-emerald-400 border-emerald-500/50",
  medium: "text-sky-400 border-sky-500/50",
  high: "text-orange-400 border-orange-500/50",
  urgent: "text-rose-400 border-rose-500/50",
};

function formatDueDate(value: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TaskCard({
  task,
  taskKey,
  labelsById,
  onClick,
}: {
  task: BoardTask;
  taskKey: string;
  labelsById: Map<string, TaskLabel>;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: {
      type: "task",
      taskId: task.id,
      columnId: task.columnId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dueLabel = formatDueDate(task.dueDate);
  const labels = task.labelIds.map((id) => labelsById.get(id)).filter(Boolean) as TaskLabel[];

  return (
    <motion.article
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm transition hover:border-primary/50 hover:shadow-md",
        isDragging && "opacity-60"
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <button onClick={onClick} className="text-left">
          <p className="text-xs text-muted-foreground">{taskKey}</p>
          <h4 className="line-clamp-2 text-sm font-medium">{task.title}</h4>
        </button>
        <button
          {...attributes}
          {...listeners}
          className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-accent group-hover:opacity-100"
          aria-label="Drag task"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={cn("capitalize", priorityTone[task.priority])}>
          <Flag className="mr-1 h-3 w-3" />
          {task.priority}
        </Badge>
        {dueLabel && (
          <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
            <Calendar className="mr-1 h-3 w-3" />
            {dueLabel}
          </Badge>
        )}
      </div>

      {labels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {labels.map((label) => (
            <Badge
              key={label.id}
              variant="outline"
              className="border-transparent text-xs"
              style={{ backgroundColor: `${label.color}33`, color: label.color }}
            >
              {label.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </motion.article>
  );
}
