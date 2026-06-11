"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectMembers, projects, users } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import { assertProjectEditAccess, getUserProjectAccess } from "@/lib/project-access";

export type UserProjectAccessInput = {
  projectId: string;
  canView: boolean;
  canEdit: boolean;
};

export type ProjectMemberAccessInput = {
  userId: string;
  canView: boolean;
  canEdit: boolean;
};

export async function getUserProjectMemberships(userId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "users:manage");

  const [projectRows, membershipRows] = await Promise.all([
    db.select({ id: projects.id, key: projects.key, name: projects.name }).from(projects),
    db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId)),
  ]);

  return {
    projects: projectRows,
    memberships: membershipRows,
  };
}

export async function setUserProjectMemberships(
  userId: string,
  memberships: UserProjectAccessInput[]
) {
  const session = await requireAuth();
  requireSessionPermission(session, "users:manage");

  await db.delete(projectMembers).where(eq(projectMembers.userId, userId));

  const rows = memberships.filter((row) => row.canView || row.canEdit);
  if (rows.length) {
    await db.insert(projectMembers).values(
      rows.map((row) => ({
        userId,
        projectId: row.projectId,
        canView: row.canView,
        canEdit: row.canEdit,
      }))
    );
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function getMyProjectAccess() {
  const session = await requireAuth();
  return getUserProjectAccess(session.user.id, session.user.role);
}

export async function getProjectMemberAccess(projectId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  await assertProjectEditAccess(session.user.id, session.user.role, projectId);

  const [userRows, membershipRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.disabled, false)),
    db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)),
  ]);

  return { users: userRows, memberships: membershipRows };
}

export async function setProjectMemberAccess(
  projectId: string,
  memberships: ProjectMemberAccessInput[]
) {
  const session = await requireAuth();
  requireSessionPermission(session, "tasks:edit");
  await assertProjectEditAccess(session.user.id, session.user.role, projectId);

  await db.delete(projectMembers).where(eq(projectMembers.projectId, projectId));

  const rows = memberships.filter((row) => row.canView || row.canEdit);
  if (rows.length) {
    await db.insert(projectMembers).values(
      rows.map((row) => ({
        projectId,
        userId: row.userId,
        canView: row.canView,
        canEdit: row.canEdit,
      }))
    );
  }

  revalidatePath("/tasks");
  revalidatePath("/admin");
  return { success: true };
}
