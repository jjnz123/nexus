import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectMembers, projects, type UserRole } from "@/lib/db/schema";
import { hasPermission } from "@/lib/permissions";

export type ProjectAccessRow = {
  projectId: string;
  canView: boolean;
  canEdit: boolean;
};

export async function getUserProjectAccess(userId: string, role: UserRole): Promise<ProjectAccessRow[]> {
  if (role === "admin") {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .orderBy(asc(projects.name));
    return rows.map((row) => ({
      projectId: row.id,
      canView: true,
      canEdit: true,
    }));
  }

  return db
    .select({
      projectId: projectMembers.projectId,
      canView: projectMembers.canView,
      canEdit: projectMembers.canEdit,
    })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
}

export async function getAccessibleProjectIds(userId: string, role: UserRole): Promise<string[]> {
  const access = await getUserProjectAccess(userId, role);
  return access.filter((row) => row.canView).map((row) => row.projectId);
}

export async function assertProjectViewAccess(
  userId: string,
  role: UserRole,
  projectId: string
): Promise<void> {
  if (role === "admin") return;
  const [row] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.userId, userId),
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.canView, true)
      )
    )
    .limit(1);
  if (!row) throw new Error("You do not have access to this project");
}

export async function assertProjectEditAccess(
  userId: string,
  role: UserRole,
  projectId: string
): Promise<void> {
  if (role === "admin") return;
  const [row] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.userId, userId),
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.canEdit, true)
      )
    )
    .limit(1);
  if (!row) throw new Error("You do not have edit access to this project");
}

export async function listAccessibleProjects(
  userId: string,
  role: UserRole,
  options?: { requireTasksView?: boolean; permissions?: Parameters<typeof hasPermission>[2] }
) {
  if (options?.requireTasksView && !hasPermission(role, "tasks:view", options.permissions)) {
    return [];
  }

  if (role === "admin") {
    return db.select().from(projects).orderBy(asc(projects.name));
  }

  const access = await getUserProjectAccess(userId, role);
  const ids = access.filter((row) => row.canView).map((row) => row.projectId);
  if (!ids.length) return [];

  return db
    .select()
    .from(projects)
    .where(inArray(projects.id, ids))
    .orderBy(asc(projects.name));
}
