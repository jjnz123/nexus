export const ROADMAP_COLUMN_IDS = [
  "key",
  "title",
  "type",
  "parent",
  "assignee",
  "priority",
  "dueDate",
  "startDate",
  "endDate",
  "storyPoints",
  "status",
  "timeline",
  "delete",
] as const;

export type RoadmapColumnId = (typeof ROADMAP_COLUMN_IDS)[number];

export const ROADMAP_COLUMN_LABELS: Record<RoadmapColumnId, string> = {
  key: "Key",
  title: "Title",
  type: "Type",
  parent: "Parent",
  assignee: "Assignee",
  priority: "Priority",
  dueDate: "Due",
  startDate: "Start",
  endDate: "End",
  storyPoints: "Points",
  status: "Status",
  timeline: "Timeline",
  delete: "",
};

export const DEFAULT_ROADMAP_VISIBLE_COLUMNS: RoadmapColumnId[] = [
  "key",
  "title",
  "type",
  "parent",
  "assignee",
  "priority",
  "dueDate",
  "startDate",
  "endDate",
  "storyPoints",
  "status",
  "timeline",
  "delete",
];

export type RoadmapSavedView = {
  id: string;
  name: string;
  visibleColumns: RoadmapColumnId[];
};

export type ProjectRoadmapSettings = {
  visibleColumns: RoadmapColumnId[];
  savedViews: RoadmapSavedView[];
  activeViewId: string | null;
};

export function parseProjectRoadmapSettings(
  settings: Record<string, unknown> | null | undefined
): ProjectRoadmapSettings {
  const raw = settings?.roadmapSettings;
  if (!raw || typeof raw !== "object") {
    return {
      visibleColumns: [...DEFAULT_ROADMAP_VISIBLE_COLUMNS],
      savedViews: [],
      activeViewId: null,
    };
  }

  const obj = raw as Record<string, unknown>;
  const visibleColumns = Array.isArray(obj.visibleColumns)
    ? obj.visibleColumns.filter(
        (value): value is RoadmapColumnId =>
          typeof value === "string" &&
          ROADMAP_COLUMN_IDS.includes(value as RoadmapColumnId)
      )
    : [...DEFAULT_ROADMAP_VISIBLE_COLUMNS];

  const savedViews = Array.isArray(obj.savedViews)
    ? obj.savedViews
        .filter((entry): entry is RoadmapSavedView => {
          if (!entry || typeof entry !== "object") return false;
          const row = entry as Record<string, unknown>;
          return (
            typeof row.id === "string" &&
            typeof row.name === "string" &&
            Array.isArray(row.visibleColumns)
          );
        })
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          visibleColumns: entry.visibleColumns.filter(
            (value): value is RoadmapColumnId =>
              typeof value === "string" &&
              ROADMAP_COLUMN_IDS.includes(value as RoadmapColumnId)
          ),
        }))
    : [];

  return {
    visibleColumns: visibleColumns.length ? visibleColumns : [...DEFAULT_ROADMAP_VISIBLE_COLUMNS],
    savedViews,
    activeViewId: typeof obj.activeViewId === "string" ? obj.activeViewId : null,
  };
}
