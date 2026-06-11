"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Calendar, ChevronDown, ChevronRight, Clock, Flag, GitBranch, ListTree } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BOARD_CARD_FIELDS,
  DEFAULT_STALE_DAYS,
  isTaskStale,
  type BoardCardFields,
} from "@/lib/tasks/project-settings";
import type { BoardTask, TaskLabel, TaskType } from "./types";

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

export type BoardCardChild = {
  id: string;
  key: string;
  title: string;
  type: TaskType;
};

type TaskCardPreviewProps = {
  task: BoardTask;
  taskKey: string;
  labelsById: Map<string, TaskLabel>;
  cardFields?: BoardCardFields;
  staleDays?: number;
  childTasks?: BoardCardChild[];
  childTaskCount?: number;
  subtasksExpanded?: boolean;
  onToggleSubtasks?: () => void;
  onOpenChild?: (taskKey: string) => void;
  parentKey?: string | null;
  onClick?: () => void;
  className?: string;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
};

export function TaskCardPreview({
  task,
  taskKey,
  labelsById,
  cardFields = DEFAULT_BOARD_CARD_FIELDS,
  staleDays = DEFAULT_STALE_DAYS,
  childTasks = [],
  childTaskCount = 0,
  subtasksExpanded = false,
  onToggleSubtasks,
  onOpenChild,
  parentKey,
  onClick,
  className,
  dragHandleProps,
}: TaskCardPreviewProps) {
  const showDueDate = cardFields.dueDate;
  const dueLabel = showDueDate ? formatDueDate(task.dueDate) : null;
  const labels = task.labelIds.map((id) => labelsById.get(id)).filter(Boolean) as TaskLabel[];
  const stale = cardFields.stale && isTaskStale(task.updatedAt, staleDays);
  const subtaskCount = childTaskCount || childTasks.length;

  return (
    <article
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm transition hover:border-primary/50 hover:shadow-md",
        stale && "border-amber-500/40",
        className
      )}
      {...dragHandleProps}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            onPointerDown={(event) => event.stopPropagation()}
            className="text-left"
          >
            <p className="text-xs text-muted-foreground">{taskKey}</p>
            <h4 className="line-clamp-2 text-sm font-medium">{task.title}</h4>
          </button>
        ) : (
          <div className="text-left">
            <p className="text-xs text-muted-foreground">{taskKey}</p>
            <h4 className="line-clamp-2 text-sm font-medium">{task.title}</h4>
          </div>
        )}
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
        {cardFields.subtasks && subtaskCount > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSubtasks?.();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="inline-flex"
          >
            <Badge
              variant="outline"
              className="cursor-pointer text-[10px] hover:border-primary/60 hover:bg-primary/5"
            >
              {subtasksExpanded ? (
                <ChevronDown className="mr-1 h-3 w-3" />
              ) : (
                <ChevronRight className="mr-1 h-3 w-3" />
              )}
              <ListTree className="mr-1 h-3 w-3" />
              {subtaskCount} subtasks
            </Badge>
          </button>
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

      {cardFields.subtasks && subtasksExpanded && childTasks.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t pt-2">
          {childTasks.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenChild?.(child.key);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent"
              >
                <span className="shrink-0 text-muted-foreground">{child.key}</span>
                <span className="min-w-0 truncate">{child.title}</span>
                <Badge variant="outline" className="ml-auto shrink-0 text-[9px] capitalize">
                  {child.type}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function TaskCard({
  task,
  taskKey,
  labelsById,
  cardFields = DEFAULT_BOARD_CARD_FIELDS,
  staleDays = DEFAULT_STALE_DAYS,
  childTasks = [],
  childTaskCount = 0,
  subtasksExpanded = false,
  onToggleSubtasks,
  onOpenChild,
  parentKey,
  onClick,
}: {
  task: BoardTask;
  taskKey: string;
  labelsById: Map<string, TaskLabel>;
  cardFields?: BoardCardFields;
  staleDays?: number;
  childTasks?: BoardCardChild[];
  childTaskCount?: number;
  subtasksExpanded?: boolean;
  onToggleSubtasks?: () => void;
  onOpenChild?: (taskKey: string) => void;
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

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-40")}>
      <TaskCardPreview
        task={task}
        taskKey={taskKey}
        labelsById={labelsById}
        cardFields={cardFields}
        staleDays={staleDays}
        childTasks={childTasks}
        childTaskCount={childTaskCount}
        subtasksExpanded={subtasksExpanded}
        onToggleSubtasks={onToggleSubtasks}
        onOpenChild={onOpenChild}
        parentKey={parentKey}
        onClick={onClick}
        className="cursor-grab touch-none active:cursor-grabbing"
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
