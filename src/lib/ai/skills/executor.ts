import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookmarkCards,
  bookmarkGroups,
  monitorDevices,
  projects,
  taskColumns,
  tasks,
} from "@/lib/db/schema";
import { hasPermission, type UserPermissionOverrides } from "@/lib/permissions";
import type { UserRole } from "@/lib/db/schema";
import { getSkillLabel } from "./definitions";
import { runXaiSearchTool } from "@/lib/ai/xai-search";

type SkillUser = {
  id: string;
  role: UserRole;
  permissions: UserPermissionOverrides | null;
};

function forbidden(skill: string) {
  return { error: `You do not have permission to use skill: ${getSkillLabel(skill)}` };
}

async function resolveProjectColumn(projectKey: string, columnName?: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.key, projectKey.toUpperCase()))
    .limit(1);
  if (!project) return { error: `Project ${projectKey} not found` };

  const columns = await db
    .select()
    .from(taskColumns)
    .where(eq(taskColumns.projectId, project.id))
    .orderBy(asc(taskColumns.sortOrder));

  const targetName = (columnName ?? "To Do").trim().toLowerCase();
  const column =
    columns.find((c) => c.name.toLowerCase() === targetName) ??
    columns.find((c) => !c.isBacklog) ??
    columns[0];

  if (!column) return { error: "No columns found for project" };
  return { project, column };
}

async function executeCreateTask(user: SkillUser, args: Record<string, unknown>) {
  if (!hasPermission(user.role, "tasks:edit", user.permissions)) {
    return forbidden("create_task");
  }

  const projectKey = String(args.projectKey ?? "").trim();
  const title = String(args.title ?? "").trim();
  if (!projectKey || !title) return { error: "projectKey and title are required" };

  const resolved = await resolveProjectColumn(projectKey, args.columnName as string | undefined);
  if ("error" in resolved) return resolved;

  const { project, column } = resolved;
  const existing = await db
    .select()
    .from(tasks)
    .where(eq(tasks.columnId, column.id));

  const maxNumber = await db
    .select({ number: tasks.number })
    .from(tasks)
    .where(eq(tasks.projectId, project.id));

  const nextNumber =
    maxNumber.reduce((max, row) => Math.max(max, row.number), 0) + 1;

  const priority = args.priority as string | undefined;
  const validPriority =
    priority === "low" || priority === "medium" || priority === "high" || priority === "urgent"
      ? priority
      : "medium";

  const [task] = await db
    .insert(tasks)
    .values({
      projectId: project.id,
      columnId: column.id,
      number: nextNumber,
      title,
      description: args.description ? String(args.description) : null,
      priority: validPriority,
      sortOrder: existing.length,
    })
    .returning();

  return {
    taskKey: `${project.key}-${task.number}`,
    title: task.title,
    column: column.name,
    priority: task.priority,
    link: `/tasks/${project.key}-${task.number}`,
  };
}

async function executeUpdateTask(user: SkillUser, args: Record<string, unknown>) {
  if (!hasPermission(user.role, "tasks:edit", user.permissions)) {
    return forbidden("update_task");
  }

  const taskKey = String(args.taskKey ?? "").trim().toUpperCase();
  const match = taskKey.match(/^([A-Z][A-Z0-9]*)-(\d+)$/);
  if (!match) return { error: "Invalid task key format. Use e.g. OPS-12" };

  const [, key, numStr] = match;
  const [project] = await db.select().from(projects).where(eq(projects.key, key)).limit(1);
  if (!project) return { error: `Project ${key} not found` };

  const [existing] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, project.id), eq(tasks.number, Number(numStr))))
    .limit(1);
  if (!existing) return { error: `Task ${taskKey} not found` };

  let columnId = existing.columnId;
  if (args.columnName) {
    const resolved = await resolveProjectColumn(key, String(args.columnName));
    if ("error" in resolved) return resolved;
    columnId = resolved.column.id;
  }

  const priority = args.priority as string | undefined;
  const validPriority =
    priority === "low" || priority === "medium" || priority === "high" || priority === "urgent"
      ? priority
      : undefined;

  const [task] = await db
    .update(tasks)
    .set({
      title: args.title ? String(args.title) : existing.title,
      description:
        args.description !== undefined ? String(args.description) : existing.description,
      priority: validPriority ?? existing.priority,
      columnId,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, existing.id))
    .returning();

  return {
    taskKey: `${project.key}-${task.number}`,
    title: task.title,
    priority: task.priority,
    link: `/tasks/${project.key}-${task.number}`,
  };
}

async function executeCheckMonitor(user: SkillUser, args: Record<string, unknown>) {
  if (!hasPermission(user.role, "monitoring:view", user.permissions)) {
    return forbidden("check_monitor_status");
  }

  const query = String(args.query ?? "").trim();
  const devices = await db.select().from(monitorDevices).orderBy(monitorDevices.name);

  if (!query) {
    return {
      total: devices.length,
      up: devices.filter((d) => d.lastStatus === "up").length,
      down: devices.filter((d) => d.lastStatus === "down").length,
      unknown: devices.filter((d) => d.lastStatus !== "up" && d.lastStatus !== "down").length,
    };
  }

  const matches = devices.filter(
    (d) =>
      d.name.toLowerCase().includes(query.toLowerCase()) ||
      d.target.toLowerCase().includes(query.toLowerCase())
  );

  return {
    matches: matches.slice(0, 10).map((d) => ({
      name: d.name,
      target: d.target,
      status: d.lastStatus ?? "unknown",
      link: `/monitoring/${d.id}`,
    })),
  };
}

async function executeSearchBookmarks(user: SkillUser, args: Record<string, unknown>) {
  if (!hasPermission(user.role, "bookmarks:view", user.permissions)) {
    return forbidden("search_bookmarks");
  }

  const query = String(args.query ?? "").trim();
  if (!query) return { error: "query is required" };

  const limit = Math.min(Number(args.limit ?? 10) || 10, 20);
  const pattern = `%${query}%`;

  const rows = await db
    .select({
      card: bookmarkCards,
      group: bookmarkGroups,
    })
    .from(bookmarkCards)
    .innerJoin(bookmarkGroups, eq(bookmarkCards.groupId, bookmarkGroups.id))
    .where(
      and(
        isNull(bookmarkCards.archivedAt),
        or(
          ilike(bookmarkCards.title, pattern),
          ilike(bookmarkCards.description, pattern),
          ilike(bookmarkCards.url, pattern)
        )
      )
    )
    .limit(limit);

  return {
    results: rows.map(({ card, group }) => ({
      title: card.title,
      url: card.url,
      group: group.name,
      tags: card.tags ?? [],
      enabled: card.enabled,
    })),
  };
}

async function executeWebSearch(user: SkillUser, args: Record<string, unknown>) {
  if (!hasPermission(user.role, "ai:use", user.permissions)) {
    return forbidden("web_search");
  }

  const query = String(args.query ?? "").trim();
  if (!query) return { error: "query is required" };

  const maxResults = Math.min(Number(args.maxResults ?? 8) || 8, 20);
  return runXaiSearchTool("web_search", query, { maxResults });
}

async function executeXSearch(user: SkillUser, args: Record<string, unknown>) {
  if (!hasPermission(user.role, "ai:use", user.permissions)) {
    return forbidden("x_search");
  }

  const query = String(args.query ?? "").trim();
  if (!query) return { error: "query is required" };

  const maxResults = Math.min(Number(args.maxResults ?? 8) || 8, 20);
  return runXaiSearchTool("x_search", query, { maxResults });
}

export async function executeSkill(
  user: SkillUser,
  name: string,
  args: Record<string, unknown>
) {
  switch (name) {
    case "create_task":
      return executeCreateTask(user, args);
    case "update_task":
      return executeUpdateTask(user, args);
    case "check_monitor_status":
      return executeCheckMonitor(user, args);
    case "search_bookmarks":
      return executeSearchBookmarks(user, args);
    case "web_search":
      return executeWebSearch(user, args);
    case "x_search":
      return executeXSearch(user, args);
    default:
      return { error: `Unknown skill: ${name}` };
  }
}
