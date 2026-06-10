import { z } from "zod";

export const TASK_TYPE_VALUES = ["epic", "feature", "story", "task", "bug"] as const;
export type TaskType = (typeof TASK_TYPE_VALUES)[number];

export const TASK_TYPES: TaskType[] = [...TASK_TYPE_VALUES];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  epic: "Epic",
  feature: "Feature",
  story: "Story",
  task: "Task",
  bug: "Bug",
};

export const taskTypeSchema = z.enum(TASK_TYPE_VALUES);

export type BoardTypeFilter = "all" | "bugs" | "others";

export type BugBoardMode = "show_bugs" | "hide_bugs" | "all_types";

export const BUG_BOARD_MODE_LABELS: Record<BugBoardMode, string> = {
  show_bugs: "Show bugs by default",
  hide_bugs: "Hide bugs by default",
  all_types: "Always show all ticket types",
};

export function getDefaultBoardTypeFilter(mode: BugBoardMode): BoardTypeFilter {
  if (mode === "hide_bugs") return "others";
  return "all";
}

export function boardTypeFilterMatches(taskType: TaskType, filter: BoardTypeFilter): boolean {
  if (filter === "bugs") return taskType === "bug";
  if (filter === "others") return taskType !== "bug";
  return true;
}

export function boardVisibleTypeMatches(
  taskType: TaskType,
  visibleTypes: TaskType[],
  filter: BoardTypeFilter
): boolean {
  if (filter === "bugs") return taskType === "bug";
  if (!visibleTypes.includes(taskType)) return false;
  return boardTypeFilterMatches(taskType, filter);
}
