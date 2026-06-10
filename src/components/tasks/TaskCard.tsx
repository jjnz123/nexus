"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Calendar, Clock, Flag, GitBranch, GripVertical, ListTree } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BOARD_CARD_FIELDS,
  DEFAULT_STALE_DAYS,
  isTaskStale,
  type BoardCardFields,
} from "@/lib/tasks/project-settings";
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
  cardFields = DEFAULT_BOARD_CARD_FIELDS,
  staleDays = DEFAULT_STALE_DAYS,
  childTaskCount = 0,
  parentKey,
  onClick,
}: {
  task: BoardTask;
  taskKey: string;
  labelsById: Map<string, TaskLabel>;
  cardFields?: BoardCardFields;
  staleDays?: number;
  childTaskCount?: number;
  parentKey?: string | null;
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

  const showDueDate = cardFields.dueDate;
  const dueLabel = showDueDate ? formatDueDate(task.dueDate) : null;
  const labels = task.labelIds.map((id) => labelsById.get(id)).filter(Boolean) as TaskLabel[];
  const stale = cardFields.stale && isTaskStale(task.updatedAt, staleDays);

  return (
    <motion.article
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm transition hover:border-primary/50 hover:shadow-md",
        isDragging && "opacity-60",
        stale && "border-amber-500/40"
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

      {cardFields.parent && parentKey ? (
        <p className="mb-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <GitBranch className="h-3 w-3" />
          {parentKey}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px] capitalize">
          {task.type}
        </Badge>
        <Badge variant="outline" className={cn("capitalize", priorityTone[task.priority])}>
          <Flag className="mr-1 h-3 w-3" />
          {task.priority}
        </Badge>
        {task.assigneeName ? (
          <Badge variant="secondary" className="text-[10px]">
            {task.assigneeName}
          </Badge>
        ) : null}
        {dueLabel ? (
          <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
            <Calendar className="mr-1 h-3 w-3" />
            {dueLabel}
          </Badge>
        ) : null}
        {stale ? (
          <Badge variant="outline" className="border-amber-500/50 text-amber-500">
            <Clock className="mr-1 h-3 w-3" />
            Stale
          </Badge>
        ) : null}
        {cardFields.subtasks && childTaskCount > 0 ? (
          <Badge variant="outline" className="text-[10px]">
            <ListTree className="mr-1 h-3 w-3" />
            {childTaskCount} subtasks
          </Badge>
        ) : null}
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
