import type { BoardTypeFilter } from "@/lib/tasks/task-types";

export type TasksWorkspacePrefs = {
  descriptionHeight?: number;
  boardFilters?: Record<string, BoardTypeFilter>;
};

export const DEFAULT_TASKS_WORKSPACE: TasksWorkspacePrefs = {
  descriptionHeight: 180,
};

export type HomeWidgetId =
  | "search"
  | "operations"
  | "suggestions"
  | "favourites"
  | "boardLinks";

export type HomeWidgetConfig = {
  visible: boolean;
  minimized: boolean;
};

export type HomeBoardLink = {
  id: string;
  projectId: string;
  label?: string | null;
};

export type HomeDashboardConfig = {
  widgetOrder: HomeWidgetId[];
  widgets: Record<HomeWidgetId, HomeWidgetConfig>;
  boardLinks: HomeBoardLink[];
};

export const DEFAULT_HOME_DASHBOARD: HomeDashboardConfig = {
  widgetOrder: ["search", "operations", "suggestions", "favourites", "boardLinks"],
  widgets: {
    search: { visible: true, minimized: false },
    operations: { visible: true, minimized: false },
    suggestions: { visible: true, minimized: false },
    favourites: { visible: true, minimized: false },
    boardLinks: { visible: true, minimized: false },
  },
  boardLinks: [],
};

export function parseTasksWorkspace(
  value: TasksWorkspacePrefs | null | undefined
): TasksWorkspacePrefs {
  if (!value || typeof value !== "object") return DEFAULT_TASKS_WORKSPACE;
  const height = value.descriptionHeight;
  const boardFilters =
    value.boardFilters && typeof value.boardFilters === "object"
      ? Object.fromEntries(
          Object.entries(value.boardFilters).filter(
            (entry): entry is [string, BoardTypeFilter] =>
              entry[1] === "all" || entry[1] === "bugs" || entry[1] === "others"
          )
        )
      : undefined;

  return {
    descriptionHeight:
      typeof height === "number" && height >= 120 && height <= 800 ? height : 180,
    boardFilters,
  };
}

export function parseHomeDashboard(
  value: HomeDashboardConfig | null | undefined
): HomeDashboardConfig {
  if (!value || typeof value !== "object") return DEFAULT_HOME_DASHBOARD;

  const widgetOrder = Array.isArray(value.widgetOrder)
    ? value.widgetOrder.filter((id): id is HomeWidgetId =>
        DEFAULT_HOME_DASHBOARD.widgetOrder.includes(id as HomeWidgetId)
      )
    : DEFAULT_HOME_DASHBOARD.widgetOrder;

  const widgets = { ...DEFAULT_HOME_DASHBOARD.widgets };
  if (value.widgets && typeof value.widgets === "object") {
    for (const id of DEFAULT_HOME_DASHBOARD.widgetOrder) {
      const saved = value.widgets[id];
      if (!saved) continue;
      widgets[id] = {
        visible: saved.visible !== false,
        minimized: saved.minimized === true,
      };
    }
  }

  const boardLinks = Array.isArray(value.boardLinks)
    ? value.boardLinks
        .filter(
          (link): link is HomeBoardLink =>
            Boolean(link) &&
            typeof link === "object" &&
            typeof link.id === "string" &&
            typeof link.projectId === "string"
        )
        .map((link) => ({
          id: link.id,
          projectId: link.projectId,
          label: typeof link.label === "string" ? link.label : null,
        }))
    : [];

  const mergedOrder = [
    ...widgetOrder,
    ...DEFAULT_HOME_DASHBOARD.widgetOrder.filter((id) => !widgetOrder.includes(id)),
  ];

  return { widgetOrder: mergedOrder, widgets, boardLinks };
}
