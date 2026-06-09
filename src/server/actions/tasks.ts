"use server";

import { revalidatePath } from "next/cache";
import { eq, asc, and, max, or, ilike, ne } from "drizzle-orm";
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
  updateProjectFieldSettingsSchema,
  roadmapCommitSchema,
  bulkUpdateTasksSchema,
  bulkDeleteTasksSchema,
} from "@/lib/validators/tasks";
import { createNotification } from "./users";
import { logAudit } from "@/server/audit";
import { indexTaskById } from "@/lib/rag/indexer";
import { deleteRagSource } from "@/lib/rag/store";
import { RAG_SOURCE_TYPES } from "@/lib/rag/types";

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
    .select()
    .from(taskAttachments)
    .where(eq(taskAttachments.taskId, task.id));

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
    attachments: attachmentRows.map((row) => ({
      id: row.id,
      filename: row.filename,
      path: row.path,
      mimeType: row.mimeType,
      size: row.size,
    })),
    links,
    labelIds: labelMaps.map((m) => m.labelId),
  };
}

export async function createTask(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = taskSchema.parse(input);

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
      sortOrder: columnTasks.length,
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

  const [task] = await db
    .update(tasks)
    .set({
      ...updates,
      dueDate:
        updates.dueDate === null
          ? null
          : updates.dueDate
            ? new Date(updates.dueDate)
            : undefined,
      storyPoints: updates.storyPoints === null ? null : updates.storyPoints,
      updatedAt: new Date(),
    })
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

  revalidatePath("/tasks");
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

  for (const item of items) {
    await db
      .update(tasks)
      .set({ columnId: item.columnId, sortOrder: item.sortOrder, updatedAt: new Date() })
      .where(eq(tasks.id, item.id));
  }

  revalidatePath("/tasks");
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
  revalidatePath("/tasks");
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

export async function moveTaskToBoard(taskId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error("Task not found");

  const columns = await db
    .select()
    .from(taskColumns)
    .where(eq(taskColumns.projectId, task.projectId))
    .orderBy(asc(taskColumns.sortOrder));

  const targetColumn = columns.find((c) => !c.isBacklog);
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
  return { success: true };
}

export async function createBacklogTask(input: {
  projectId: string;
  title: string;
  description?: string | null;
  details?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  type?: "epic" | "feature" | "story" | "task";
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
  const [attachment] = await db
    .insert(taskAttachments)
    .values({
      taskId: data.taskId,
      filename: data.filename,
      path: data.path,
      mimeType: data.mimeType ?? "application/octet-stream",
      size: data.size,
      uploadedBy: session.user.id,
    })
    .returning();
  revalidatePath("/tasks");
  return attachment;
}

export async function deleteTaskAttachment(attachmentId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
  revalidatePath("/tasks");
  return { success: true };
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
  const typeOrder = { epic: 0, feature: 1, story: 2, task: 3 };
  const sortedCreates = [...data.creates].sort(
    (a, b) => typeOrder[a.type] - typeOrder[b.type]
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
