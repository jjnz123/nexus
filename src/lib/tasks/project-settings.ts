import type { TaskType } from "@/components/tasks/types";

export type BoardCardFieldKey = "parent" | "dueDate" | "stale" | "subtasks";

export type BoardCardFields = Record<BoardCardFieldKey, boolean>;

export const BOARD_CARD_FIELD_LABELS: Record<BoardCardFieldKey, string> = {
  parent: "Parent ticket",
  dueDate: "Due date",
  stale: "Stale indicator",
  subtasks: "Child subtasks",
};

export const DEFAULT_BOARD_VISIBLE_TYPES: TaskType[] = ["story", "task"];

export const DEFAULT_BOARD_CARD_FIELDS: BoardCardFields = {
  parent: false,
  dueDate: true,
  stale: false,
  subtasks: true,
};

export const DEFAULT_STALE_DAYS = 14;

export type ProjectBoardSettings = {
  visibleTypes: TaskType[];
  cardFields: BoardCardFields;
  staleDays: number;
};

const TASK_TYPES: TaskType[] = ["epic", "feature", "story", "task"];
const CARD_FIELD_KEYS: BoardCardFieldKey[] = ["parent", "dueDate", "stale", "subtasks"];

export function parseProjectBoardSettings(
  settings: Record<string, unknown> | null | undefined
): ProjectBoardSettings {
  const raw = settings?.boardSettings;
  if (!raw || typeof raw !== "object") {
    return {
      visibleTypes: [...DEFAULT_BOARD_VISIBLE_TYPES],
      cardFields: { ...DEFAULT_BOARD_CARD_FIELDS },
      staleDays: DEFAULT_STALE_DAYS,
    };
  }

  const obj = raw as Record<string, unknown>;

  const visibleTypes = Array.isArray(obj.visibleTypes)
    ? obj.visibleTypes.filter(
        (value): value is TaskType =>
          typeof value === "string" && TASK_TYPES.includes(value as TaskType)
      )
    : [...DEFAULT_BOARD_VISIBLE_TYPES];

  const cardFields = { ...DEFAULT_BOARD_CARD_FIELDS };
  if (obj.cardFields && typeof obj.cardFields === "object") {
    for (const key of CARD_FIELD_KEYS) {
      const value = (obj.cardFields as Record<string, unknown>)[key];
      if (typeof value === "boolean") cardFields[key] = value;
    }
  }

  const staleDays =
    typeof obj.staleDays === "number" && obj.staleDays > 0
      ? Math.floor(obj.staleDays)
      : DEFAULT_STALE_DAYS;

  return {
    visibleTypes: visibleTypes.length ? visibleTypes : [...DEFAULT_BOARD_VISIBLE_TYPES],
    cardFields,
    staleDays,
  };
}

export function isTaskStale(updatedAt: string | Date, staleDays: number): boolean {
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return false;
  const ageMs = Date.now() - date.getTime();
  return ageMs >= staleDays * 24 * 60 * 60 * 1000;
}
