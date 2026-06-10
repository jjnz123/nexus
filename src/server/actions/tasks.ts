"use server";

import { revalidatePath } from "next/cache";
import { eq, asc, and, max, or, ilike, ne, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  projects,
  taskColumns,
  tasks,
  taskLabels,
  taskLabelMap,
  taskSubtasks,
  taskComments,
  taskAttachments,
  taskLinks,
  users,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission, hasPermission } from "@/lib/permissions";
import {
  projectSchema,
  columnSchema,
  taskSchema,
  updateTaskSchema,
  subtaskSchema,
  commentSchema,
  labelSchema,
  taskLinkSchema,
  taskAttachmentSchema,
  taskUrlLinkSchema,
  taskEmailAttachmentSchema,
  createChildTaskSchema,
  updateProjectHierarchySettingsSchema,
  updateProjectFieldSettingsSchema,
  updateProjectBoardSettingsSchema,
  roadmapCommitSchema,
  bulkUpdateTasksSchema,
  bulkDeleteTasksSchema,
} from "@/lib/validators/tasks";
import { createNotification } from "./users";
import { logAudit } from "@/server/audit";
import { indexTaskById } from "@/lib/rag/indexer";
import { deleteRagSource } from "@/lib/rag/store";
import { RAG_SOURCE_TYPES } from "@/lib/rag/types";
import {
  assertValidTaskParent,
  parseProjectHierarchyRules,
  type HierarchyRules,
} from "@/lib/tasks/hierarchy";
import type { TaskType } from "@/components/tasks/types";

function mapAttachmentRow(
  row: typeof taskAttachments.$inferSelect,
  uploadedByName: string | null
) {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    displayTitle: row.displayTitle,
    path: row.path,
    url: row.url,
    mimeType: row.mimeType,
    size: row.size,
    version: row.version,
    groupId: row.groupId,
    isCurrent: row.isCurrent,
    emailSubject: row.emailSubject,
    emailFrom: row.emailFrom,
    emailSentAt: row.emailSentAt,
    uploadedByName,
    createdAt: row.createdAt,
  };
}

async function loadProjectHierarchyRules(projectId: string): Promise<HierarchyRules> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return parseProjectHierarchyRules((project?.settings ?? {}) as Record<string, unknown>);
}

async function loadParentTask(id: string) {
  const [parent] = await db
    .select({ id: tasks.id, type: tasks.type, projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  return parent ?? null;
}

async function loadDescendantTaskIds(taskId: string): Promise<string[]> {
  const all = await db
    .select({ id: tasks.id, parentId: tasks.parentId })
    .from(tasks);
  const descendants: string[] = [];
  const queue = [taskId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const row of all) {
      if (row.parentId === current && !descendants.includes(row.id)) {
        descendants.push(row.id);
        queue.push(row.id);
      }
    }
  }
  return descendants;
}

async function validateTaskParent({
  childId,
  childType,
  parentId,
  projectId,
}: {
  childId?: string;
  childType: TaskType;
  parentId: string | null | undefined;
  projectId: string;
}) {
  const rules = await loadProjectHierarchyRules(projectId);
  await assertValidTaskParent({
    childId,
    childType,
    parentId,
    projectId,
    rules,
    loadParent: loadParentTask,
    loadDescendantIds: loadDescendantTaskIds,
  });
}

export async function getProjects() {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:view");
  return db.select().from(projects).orderBy(asc(projects.name));
}

export async function createProject(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = projectSchema.parse(input);

  const [project] = await db
    .insert(projects)
    .values({ key: data.key, name: data.name })
    .returning();

  const defaultColumns = ["Backlog", "To Do", "In Progress", "Done"];
  for (let i = 0; i < defaultColumns.length; i++) {
    await db.insert(taskColumns).values({
      projectId: project.id,
      name: defaultColumns[i],
      sortOrder: i,
      isBacklog: defaultColumns[i] === "Backlog",
      color: ["#64748b", "#6366f1", "#f59e0b", "#22c55e"][i],
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/meetings");
  await logAudit({
    action: "tasks.project.create",
    resource: "project",
    resourceId: project.id,
    summary: `Created project ${project.key} — ${project.name}`,
  });
  return project;
}

export async function getProjectBoard(projectId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:view");

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");

  const columns = await db
    .select()
    .from(taskColumns)
    .where(eq(taskColumns.projectId, projectId))
    .orderBy(asc(taskColumns.sortOrder));

  const parentTasks = alias(tasks, "parent_tasks");

  const projectTasks = await db
    .select({
      task: tasks,
      assignee: users,
      parent: parentTasks,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(parentTasks, eq(tasks.parentId, parentTasks.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.sortOrder));

  const labels = await db
    .select()
    .from(taskLabels)
    .where(eq(taskLabels.projectId, projectId));

  const labelMaps = await db.select().from(taskLabelMap);
  const subtasks = await db.select().from(taskSubtasks);

  return {
    project,
    columns,
    tasks: projectTasks.map(({ task, assignee, parent }) => ({
      ...task,
      assigneeName: assignee?.name ?? null,
      parentTitle: parent?.title ?? null,
      labelIds: labelMaps.filter((m) => m.taskId === task.id).map((m) => m.labelId),
      subtasks: subtasks.filter((s) => s.taskId === task.id),
    })),
    labels,
  };
}

export async function getTaskByKey(taskKey: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:view");

  const match = taskKey.match(/^([A-Z][A-Z0-9]*)-(\d+)$/);
  if (!match) return null;

  const [, key, numStr] = match;
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.key, key))
    .limit(1);
  if (!project) return null;

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, project.id), eq(tasks.number, parseInt(numStr, 10))))
    .limit(1);

  if (!task) return null;

  const comments = await db
    .select({ comment: taskComments, user: users })
    .from(taskComments)
    .innerJoin(users, eq(taskComments.userId, users.id))
    .where(eq(taskComments.taskId, task.id))
    .orderBy(asc(taskComments.createdAt));

  const subtasks = await db
    .select()
    .from(taskSubtasks)
    .where(eq(taskSubtasks.taskId, task.id))
    .orderBy(asc(taskSubtasks.sortOrder));

  const attachmentRows = await db
    .select({ attachment: taskAttachments, user: users })
    .from(taskAttachments)
    .leftJoin(users, eq(taskAttachments.uploadedBy, users.id))
    .where(eq(taskAttachments.taskId, task.id))
    .orderBy(desc(taskAttachments.createdAt));

  const childRows = await db
    .select({ task: tasks, user: users })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.parentId, task.id))
    .orderBy(asc(tasks.sortOrder), asc(tasks.number));

  const outgoingLinks = await db
    .select({ link: taskLinks, linked: tasks, project: projects })
    .from(taskLinks)
    .innerJoin(tasks, eq(taskLinks.targetTaskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(taskLinks.sourceTaskId, task.id));

  const incomingLinks = await db
    .select({ link: taskLinks, linked: tasks, project: projects })
    .from(taskLinks)
    .innerJoin(tasks, eq(taskLinks.sourceTaskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(taskLinks.targetTaskId, task.id));

  const links = [
    ...outgoingLinks.map(({ link, linked, project }) => ({
      id: link.id,
      linkType: link.linkType,
      linkedTaskId: linked.id,
      linkedTaskKey: `${project.key}-${String(linked.number).padStart(3, "0")}`,
      linkedTaskTitle: linked.title,
      direction: "outgoing" as const,
    })),
    ...incomingLinks.map(({ link, linked, project }) => ({
      id: link.id,
      linkType: link.linkType,
      linkedTaskId: linked.id,
      linkedTaskKey: `${project.key}-${String(linked.number).padStart(3, "0")}`,
      linkedTaskTitle: linked.title,
      direction: "incoming" as const,
    })),
  ];

  const labelMaps = await db
    .select()
    .from(taskLabelMap)
    .where(eq(taskLabelMap.taskId, task.id));

  return {
    project,
    task,
    comments: comments.map(({ comment, user }) => ({
      ...comment,
      userName: user.name,
    })),
    subtasks,
    attachments: attachmentRows.map(({ attachment, user }) =>
      mapAttachmentRow(attachment, user?.name ?? null)
    ),
    childTasks: childRows.map(({ task: child, user }) => ({
      id: child.id,
      key: `${project.key}-${String(child.number).padStart(3, "0")}`,
      title: child.title,
      type: child.type,
      columnId: child.columnId,
      assigneeName: user?.name ?? null,
    })),
    links,
    labelIds: labelMaps.map((m) => m.labelId),
  };
}

export async function createTask(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = taskSchema.parse(input);

  await validateTaskParent({
    childType: data.type ?? "task",
    parentId: data.parentId,
    projectId: data.projectId,
  });

  const [maxNum] = await db
    .select({ value: max(tasks.number) })
    .from(tasks)
    .where(eq(tasks.projectId, data.projectId));

  const columnTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.columnId, data.columnId));

  const [task] = await db
    .insert(tasks)
    .values({
      projectId: data.projectId,
      columnId: data.columnId,
      number: (maxNum?.value ?? 0) + 1,
      title: data.title,
      description: data.description ?? null,
      details: data.details ?? null,
      acceptanceCriteria: data.acceptanceCriteria ?? null,
      definitionOfDone: data.definitionOfDone ?? null,
      storyPoints: data.storyPoints ?? null,
      priority: data.priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      assigneeId: data.assigneeId,
      type: data.type ?? "task",
      parentId: data.parentId ?? null,
      sortOrder: data.sortOrder ?? columnTasks.length,
    })
    .returning();

  if (data.assigneeId && data.assigneeId !== session.user.id) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .limit(1);
    await createNotification({
      userId: data.assigneeId,
      type: "task",
      title: "Task assigned",
      body: `You were assigned ${project?.key}-${task.number}: ${task.title}`,
      link: `/tasks/${project?.key}-${task.number}`,
    });
  }

  revalidatePath("/tasks");
  void indexTaskById(task.id, session.user.id).catch(() => undefined);
  await logAudit({
    action: "tasks.create",
    resource: "task",
    resourceId: task.id,
    summary: `Created task ${task.title}`,
    details: { priority: task.priority },
  });
  return task;
}

export async function updateTask(input: unknown) {
  const session = await requireAuth();
  if (!hasPermission(session.user.role, "tasks:edit", session.user.permissions)) {
    throw new Error("Forbidden");
  }
  const data = updateTaskSchema.parse(input);
  const { id, ...updates } = data;

  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!existing) throw new Error("Task not found");

  const nextType = (updates.type ?? existing.type) as TaskType;
  const nextParentId =
    updates.parentId !== undefined ? updates.parentId : existing.parentId;

  const parentOrTypeChanged =
    (updates.type !== undefined && updates.type !== existing.type) ||
    (updates.parentId !== undefined && updates.parentId !== existing.parentId);

  if (parentOrTypeChanged) {
    await validateTaskParent({
      childId: id,
      childType: nextType,
      parentId: nextParentId,
      projectId: existing.projectId,
    });
  }

  const payload = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as Record<string, unknown>;

  if ("dueDate" in payload) {
    payload.dueDate =
      payload.dueDate === null
        ? null
        : payload.dueDate
          ? new Date(String(payload.dueDate))
          : undefined;
    if (payload.dueDate === undefined) delete payload.dueDate;
  }

  if ("storyPoints" in payload && payload.storyPoints === null) {
    payload.storyPoints = null;
  }

  if (
    typeof payload.columnId === "string" &&
    payload.columnId !== existing.columnId
  ) {
    const columnTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.columnId, payload.columnId));
    payload.sortOrder = columnTasks.length;
  }

  payload.updatedAt = new Date();

  const [task] = await db
    .update(tasks)
    .set(payload)
    .where(eq(tasks.id, id))
    .returning();

  if (updates.assigneeId && updates.assigneeId !== existing.assigneeId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, existing.projectId))
      .limit(1);
    if (updates.assigneeId) {
      await createNotification({
        userId: updates.assigneeId,
        type: "task",
        title: "Task assigned",
        body: `You were assigned ${project?.key}-${task.number}: ${task.title}`,
        link: `/tasks/${project?.key}-${task.number}`,
      });
    }
  }

  void indexTaskById(task.id, session.user.id).catch(() => undefined);
  await logAudit({
    action: "tasks.update",
    resource: "task",
    resourceId: task.id,
    summary: `Updated task ${task.title}`,
  });
  return task;
}

export async function deleteTask(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  await deleteRagSource(RAG_SOURCE_TYPES.TASK, id);
  await db.delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/tasks");
  await logAudit({
    action: "tasks.delete",
    resource: "task",
    resourceId: id,
    summary: `Deleted task ${id}`,
  });
  return { success: true };
}

export async function reorderTasks(
  items: { id: string; columnId: string; sortOrder: number }[]
) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");

  if (!items.length) return { success: true };

  for (const item of items) {
    await db
      .update(tasks)
      .set({ columnId: item.columnId, sortOrder: item.sortOrder, updatedAt: new Date() })
      .where(eq(tasks.id, item.id));
  }

  return { success: true };
}

export async function createColumn(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = columnSchema.parse(input);
  const cols = await db
    .select()
    .from(taskColumns)
    .where(eq(taskColumns.projectId, data.projectId));
  const [column] = await db
    .insert(taskColumns)
    .values({ ...data, sortOrder: cols.length })
    .returning();
  revalidatePath("/tasks");
  return column;
}

export async function updateColumn(
  id: string,
  input: Partial<{ name: string; color: string; wipLimit: number | null; sortOrder: number }>
) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const [column] = await db
    .update(taskColumns)
    .set(input)
    .where(eq(taskColumns.id, id))
    .returning();
  revalidatePath("/tasks");
  return column;
}

export async function deleteColumn(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  await db.delete(taskColumns).where(eq(taskColumns.id, id));
  revalidatePath("/tasks");
  return { success: true };
}

export async function createLabel(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = labelSchema.parse(input);
  const [label] = await db.insert(taskLabels).values(data).returning();
  revalidatePath("/tasks");
  return label;
}

export async function setTaskLabels(taskId: string, labelIds: string[]) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  await db.delete(taskLabelMap).where(eq(taskLabelMap.taskId, taskId));
  if (labelIds.length > 0) {
    await db.insert(taskLabelMap).values(
      labelIds.map((labelId) => ({ taskId, labelId }))
    );
  }
  return { success: true };
}

export async function createSubtask(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = subtaskSchema.parse(input);
  const existing = await db
    .select()
    .from(taskSubtasks)
    .where(eq(taskSubtasks.taskId, data.taskId));
  const [subtask] = await db
    .insert(taskSubtasks)
    .values({ ...data, sortOrder: existing.length })
    .returning();
  revalidatePath("/tasks");
  void indexTaskById(data.taskId, session.user.id).catch(() => undefined);
  return subtask;
}

export async function toggleSubtask(id: string, completed: boolean) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const [subtask] = await db
    .update(taskSubtasks)
    .set({ completed })
    .where(eq(taskSubtasks.id, id))
    .returning();
  revalidatePath("/tasks");
  if (subtask) void indexTaskById(subtask.taskId, session.user.id).catch(() => undefined);
  return subtask;
}

export async function addComment(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = commentSchema.parse(input);

  const [comment] = await db
    .insert(taskComments)
    .values({
      taskId: data.taskId,
      userId: session.user.id,
      body: data.body,
      parentId: data.parentId ?? null,
    })
    .returning();

  const [task] = await db.select().from(tasks).where(eq(tasks.id, data.taskId)).limit(1);
  if (task?.assigneeId && task.assigneeId !== session.user.id) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, task.projectId))
      .limit(1);
    await createNotification({
      userId: task.assigneeId,
      type: "task",
      title: "New comment",
      body: `Comment on ${project?.key}-${task.number}`,
      link: `/tasks/${project?.key}-${task.number}`,
    });
  }

  revalidatePath("/tasks");
  void indexTaskById(data.taskId, session.user.id).catch(() => undefined);
  return comment;
}

export async function getProjectUsers() {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:view");
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.disabled, false));
}

export async function exportProject(projectId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:view");
  const board = await getProjectBoard(projectId);
  return board;
}

export async function reorderColumns(items: { id: string; sortOrder: number }[]) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");

  for (const item of items) {
    await db
      .update(taskColumns)
      .set({ sortOrder: item.sortOrder })
      .where(eq(taskColumns.id, item.id));
  }

  revalidatePath("/tasks");
  return { success: true };
}

export async function moveTaskToBoard(taskId: string, targetColumnId?: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error("Task not found");

  const columns = await db
    .select()
    .from(taskColumns)
    .where(eq(taskColumns.projectId, task.projectId))
    .orderBy(asc(taskColumns.sortOrder));

  const targetColumn = targetColumnId
    ? columns.find((c) => c.id === targetColumnId && !c.isBacklog)
    : columns.find((c) => !c.isBacklog);
  if (!targetColumn) throw new Error("No board column available");

  const columnTasks = await db.select().from(tasks).where(eq(tasks.columnId, targetColumn.id));

  await db
    .update(tasks)
    .set({
      columnId: targetColumn.id,
      sortOrder: columnTasks.length,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  revalidatePath("/tasks");
  return { success: true, columnId: targetColumn.id };
}

export async function createBacklogTask(input: {
  projectId: string;
  title: string;
  description?: string | null;
  details?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  type?: TaskType;
  assigneeId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  storyPoints?: number | null;
}) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");

  const backlogColumn = await db
    .select()
    .from(taskColumns)
    .where(and(eq(taskColumns.projectId, input.projectId), eq(taskColumns.isBacklog, true)))
    .limit(1);

  const column = backlogColumn[0];
  if (!column) throw new Error("Backlog column not found");

  return createTask({
    projectId: input.projectId,
    columnId: column.id,
    title: input.title,
    description: input.description ?? undefined,
    details: input.details ?? undefined,
    priority: input.priority,
    type: input.type,
    assigneeId: input.assigneeId,
    parentId: input.parentId,
    dueDate: input.dueDate ?? undefined,
    storyPoints: input.storyPoints ?? undefined,
  });
}

export async function searchProjectTasks(projectId: string, query: string, excludeTaskId?: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:view");
  const term = query.trim();
  if (!term) return [];

  const conditions = [
    eq(tasks.projectId, projectId),
    or(ilike(tasks.title, `%${term}%`), ilike(tasks.description, `%${term}%`)),
  ];
  if (excludeTaskId) conditions.push(ne(tasks.id, excludeTaskId));

  const rows = await db
    .select({ task: tasks, project: projects })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(asc(tasks.number))
    .limit(20);

  return rows.map(({ task, project }) => ({
    id: task.id,
    key: `${project.key}-${String(task.number).padStart(3, "0")}`,
    title: task.title,
    type: task.type,
  }));
}

export async function addTaskLink(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = taskLinkSchema.parse(input);
  if (data.sourceTaskId === data.targetTaskId) throw new Error("Cannot link a task to itself");

  const [link] = await db
    .insert(taskLinks)
    .values(data)
    .onConflictDoNothing()
    .returning();

  revalidatePath("/tasks");
  return link;
}

export async function removeTaskLink(linkId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  await db.delete(taskLinks).where(eq(taskLinks.id, linkId));
  revalidatePath("/tasks");
  return { success: true };
}

export async function addTaskAttachment(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = taskAttachmentSchema.parse(input);

  const [task] = await db.select().from(tasks).where(eq(tasks.id, data.taskId)).limit(1);
  if (!task) throw new Error("Task not found");

  const normalizedName = data.filename.toLowerCase();
  const existingVersions = await db
    .select()
    .from(taskAttachments)
    .where(
      and(
        eq(taskAttachments.taskId, data.taskId),
        eq(taskAttachments.kind, "file"),
        sql`lower(${taskAttachments.filename}) = ${normalizedName}`
      )
    )
    .orderBy(desc(taskAttachments.version));

  let groupId = crypto.randomUUID();
  let version = 1;

  if (existingVersions.length > 0) {
    const latest = existingVersions[0];
    groupId = latest.groupId ?? latest.id;
    version = latest.version + 1;
    await db
      .update(taskAttachments)
      .set({ isCurrent: false })
      .where(
        or(
          eq(taskAttachments.groupId, groupId),
          eq(taskAttachments.id, groupId)
        )
      );
  }

  const [attachment] = await db
    .insert(taskAttachments)
    .values({
      taskId: data.taskId,
      kind: "file",
      filename: data.filename,
      path: data.path,
      mimeType: data.mimeType ?? "application/octet-stream",
      size: data.size,
      version,
      groupId,
      isCurrent: true,
      uploadedBy: session.user.id,
    })
    .returning();

  revalidatePath("/tasks");
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return mapAttachmentRow(attachment, user?.name ?? null);
}

export async function addTaskUrlLink(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = taskUrlLinkSchema.parse(input);

  const [attachment] = await db
    .insert(taskAttachments)
    .values({
      taskId: data.taskId,
      kind: "url",
      filename: data.title,
      displayTitle: data.title,
      url: data.url,
      path: null,
      mimeType: "text/uri-list",
      size: 0,
      version: 1,
      groupId: crypto.randomUUID(),
      isCurrent: true,
      uploadedBy: session.user.id,
    })
    .returning();

  revalidatePath("/tasks");
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return mapAttachmentRow(attachment, user?.name ?? null);
}

export async function addTaskEmailAttachment(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = taskEmailAttachmentSchema.parse(input);

  const [attachment] = await db
    .insert(taskAttachments)
    .values({
      taskId: data.taskId,
      kind: "email",
      filename: data.filename,
      displayTitle: data.emailSubject ?? data.filename,
      path: data.path,
      mimeType: "message/rfc822",
      size: data.size,
      version: 1,
      groupId: crypto.randomUUID(),
      isCurrent: true,
      emailSubject: data.emailSubject ?? null,
      emailFrom: data.emailFrom ?? null,
      emailSentAt: data.emailSentAt ? new Date(data.emailSentAt) : null,
      uploadedBy: session.user.id,
    })
    .returning();

  revalidatePath("/tasks");
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return mapAttachmentRow(attachment, user?.name ?? null);
}

export async function createChildTask(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = createChildTaskSchema.parse(input);

  const [parent] = await db.select().from(tasks).where(eq(tasks.id, data.parentTaskId)).limit(1);
  if (!parent) throw new Error("Parent task not found");

  await validateTaskParent({
    childType: "task",
    parentId: parent.id,
    projectId: parent.projectId,
  });

  const child = await createTask({
    projectId: parent.projectId,
    columnId: parent.columnId,
    title: data.title,
    type: "task",
    parentId: parent.id,
    priority: parent.priority,
  });

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, parent.projectId))
    .limit(1);

  revalidatePath("/tasks");
  return {
    id: child.id,
    key: `${project?.key ?? "TASK"}-${String(child.number).padStart(3, "0")}`,
    title: child.title,
    type: child.type,
    columnId: child.columnId,
    assigneeName: null,
  };
}

export async function deleteTaskAttachment(attachmentId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
  revalidatePath("/tasks");
  return { success: true };
}

export async function updateProjectHierarchySettings(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = updateProjectHierarchySettingsSchema.parse(input);

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");

  const nextSettings = {
    ...(project.settings ?? {}),
    hierarchyRules: data.hierarchyRules,
  };

  const [updated] = await db
    .update(projects)
    .set({ settings: nextSettings })
    .where(eq(projects.id, data.projectId))
    .returning();

  revalidatePath("/tasks");
  return updated;
}

export async function updateProjectFieldSettings(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = updateProjectFieldSettingsSchema.parse(input);

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");

  const nextSettings = {
    ...(project.settings ?? {}),
    ticketFields: data.ticketFields,
  };

  const [updated] = await db
    .update(projects)
    .set({ settings: nextSettings })
    .where(eq(projects.id, data.projectId))
    .returning();

  revalidatePath("/tasks");
  return updated;
}

export async function updateProjectBoardSettings(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = updateProjectBoardSettingsSchema.parse(input);

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, data.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");

  const nextSettings = {
    ...(project.settings ?? {}),
    boardSettings: data.boardSettings,
  };

  const [updated] = await db
    .update(projects)
    .set({ settings: nextSettings })
    .where(eq(projects.id, data.projectId))
    .returning();

  revalidatePath("/tasks");
  return updated;
}

export async function commitRoadmapChanges(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = roadmapCommitSchema.parse(input);

  for (const taskId of data.deletes) {
    await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, data.projectId)));
  }

  for (const update of data.updates) {
    const { id, ...rest } = update;
    const payload = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined)
    );
    if (Object.keys(payload).length === 0) continue;
    await updateTask({ id, ...payload });
  }

  const createdMap: Record<string, string> = {};
  const sortedCreates = [...data.creates].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );

  for (const item of sortedCreates) {
    let parentId = item.parentId ?? null;
    if (parentId && createdMap[parentId]) {
      parentId = createdMap[parentId];
    }

    const created = await createTask({
      projectId: data.projectId,
      columnId: item.columnId,
      title: item.title,
      description: item.description ?? undefined,
      priority: item.priority,
      type: item.type,
      assigneeId: item.assigneeId,
      parentId,
      dueDate: item.dueDate ?? undefined,
      storyPoints: item.storyPoints ?? undefined,
      sortOrder: item.sortOrder,
    });
    createdMap[item.draftId] = created.id;
  }

  revalidatePath("/tasks");
  await logAudit({
    action: "tasks.roadmap.commit",
    resource: "project",
    resourceId: data.projectId,
    summary: `Committed roadmap: ${data.creates.length} created, ${data.updates.length} updated, ${data.deletes.length} deleted`,
  });
  return { success: true, createdMap };
}

export async function bulkUpdateTasks(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const { taskIds, updates } = bulkUpdateTasksSchema.parse(input);

  for (const id of taskIds) {
    await updateTask({ id, ...updates });
  }

  revalidatePath("/tasks");
  await logAudit({
    action: "tasks.bulk.update",
    summary: `Bulk updated ${taskIds.length} tasks`,
    details: { count: taskIds.length, updates },
  });
  return { success: true };
}

export async function bulkDeleteTasks(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const { taskIds } = bulkDeleteTasksSchema.parse(input);

  for (const id of taskIds) {
    await deleteTask(id);
  }

  revalidatePath("/tasks");
  await logAudit({
    action: "tasks.bulk.delete",
    summary: `Bulk deleted ${taskIds.length} tasks`,
    details: { count: taskIds.length },
  });
  return { success: true };
}
