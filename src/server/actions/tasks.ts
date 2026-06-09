"use server";

import { revalidatePath } from "next/cache";
import { eq, asc, and, max } from "drizzle-orm";
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
} from "@/lib/validators/tasks";
import { createNotification } from "./users";
import { logAudit } from "@/server/audit";

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

  const projectTasks = await db
    .select({
      task: tasks,
      assignee: users,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
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
    tasks: projectTasks.map(({ task, assignee }) => ({
      ...task,
      assigneeName: assignee?.name ?? null,
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

  const attachments = await db
    .select()
    .from(taskAttachments)
    .where(eq(taskAttachments.taskId, task.id));

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
    attachments,
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
      description: data.description,
      priority: data.priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      assigneeId: data.assigneeId,
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
      dueDate: updates.dueDate === null ? null : updates.dueDate ? new Date(updates.dueDate) : undefined,
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
  return subtask;
}

export async function addComment(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  const data = commentSchema.parse(input);

  const [comment] = await db
    .insert(taskComments)
    .values({ taskId: data.taskId, userId: session.user.id, body: data.body })
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
