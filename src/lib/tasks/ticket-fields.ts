import { TASK_TYPES, type TaskType } from "@/lib/tasks/task-types";

export type TicketFieldKey =
  | "title"
  | "description"
  | "details"
  | "acceptanceCriteria"
  | "definitionOfDone"
  | "storyPoints"
  | "priority"
  | "dueDate"
  | "assignee"
  | "parent"
  | "type"
  | "column"
  | "labels"
  | "subtasks"
  | "comments"
  | "attachments"
  | "linkedIssues";

export type TicketFieldConfig = {
  key: TicketFieldKey;
  label: string;
  visible: boolean;
};

export type ProjectTicketFieldSettings = Record<TaskType, TicketFieldConfig[]>;

export const TICKET_FIELD_LABELS: Record<TicketFieldKey, string> = {
  title: "Title",
  description: "Description",
  details: "Details",
  acceptanceCriteria: "Acceptance criteria",
  definitionOfDone: "Definition of done",
  storyPoints: "Story points",
  priority: "Priority",
  dueDate: "Due date",
  assignee: "Assignee",
  parent: "Parent",
  type: "Type",
  column: "Status / column",
  labels: "Labels",
  subtasks: "Subtasks",
  comments: "Comments",
  attachments: "Attachments",
  linkedIssues: "Linked issues",
};

const BASE_FIELDS: TicketFieldKey[] = [
  "title",
  "description",
  "details",
  "acceptanceCriteria",
  "definitionOfDone",
  "storyPoints",
  "priority",
  "dueDate",
  "assignee",
  "parent",
  "type",
  "column",
  "labels",
  "subtasks",
  "comments",
  "attachments",
  "linkedIssues",
];

function buildDefaults(hidden: TicketFieldKey[] = []): TicketFieldConfig[] {
  return BASE_FIELDS.map((key) => ({
    key,
    label: TICKET_FIELD_LABELS[key],
    visible: !hidden.includes(key),
  }));
}

export const DEFAULT_TICKET_FIELD_SETTINGS: ProjectTicketFieldSettings = {
  epic: buildDefaults(["acceptanceCriteria", "definitionOfDone", "storyPoints", "subtasks"]),
  feature: buildDefaults(["definitionOfDone"]),
  story: buildDefaults([]),
  task: buildDefaults(["details", "acceptanceCriteria", "definitionOfDone"]),
  bug: buildDefaults(["details", "acceptanceCriteria", "definitionOfDone", "storyPoints"]),
};

export function parseProjectTicketFieldSettings(
  settings: Record<string, unknown> | null | undefined
): ProjectTicketFieldSettings {
  const raw = settings?.ticketFields;
  if (!raw || typeof raw !== "object") return DEFAULT_TICKET_FIELD_SETTINGS;

  const result = { ...DEFAULT_TICKET_FIELD_SETTINGS };
  for (const type of TASK_TYPES) {
    const saved = (raw as Record<string, unknown>)[type];
    if (!Array.isArray(saved)) continue;
    const defaults = DEFAULT_TICKET_FIELD_SETTINGS[type];
    const byKey = new Map(defaults.map((field) => [field.key, field]));
    const ordered: TicketFieldConfig[] = [];
    for (const entry of saved) {
      if (!entry || typeof entry !== "object") continue;
      const key = (entry as { key?: string }).key as TicketFieldKey | undefined;
      if (!key || !byKey.has(key)) continue;
      ordered.push({
        key,
        label: TICKET_FIELD_LABELS[key],
        visible: Boolean((entry as { visible?: boolean }).visible),
      });
      byKey.delete(key);
    }
    for (const remaining of byKey.values()) ordered.push(remaining);
    result[type] = ordered;
  }
  return result;
}

export function isTicketFieldVisible(
  settings: ProjectTicketFieldSettings,
  type: TaskType,
  key: TicketFieldKey
) {
  return settings[type]?.find((field) => field.key === key)?.visible ?? true;
}

export function visibleTicketFields(settings: ProjectTicketFieldSettings, type: TaskType) {
  return settings[type]?.filter((field) => field.visible) ?? DEFAULT_TICKET_FIELD_SETTINGS[type];
}
