"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { eq, and, isNull, isNotNull, desc, count, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, notifications } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import {
  createUserSchema,
  updateUserSchema,
  updateProfileSchema,
} from "@/lib/validators/auth";

export async function getUsers() {
  const session = await requireAuth();
  requirePermission(session.user.role, "users:manage");
  return db.select().from(users).orderBy(users.name);
}

export async function createUser(input: unknown) {
  const session = await requireAuth();
  requirePermission(session.user.role, "users:manage");
  const data = createUserSchema.parse(input);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const [user] = await db
    .insert(users)
    .values({
      email: data.email.toLowerCase(),
      name: data.name,
      passwordHash,
      role: data.role,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      disabled: users.disabled,
      avatarPath: users.avatarPath,
      createdAt: users.createdAt,
    });
  revalidatePath("/admin");
  return user;
}

export async function updateUser(input: unknown) {
  const session = await requireAuth();
  requirePermission(session.user.role, "users:manage");
  const data = updateUserSchema.parse(input);
  const updates: Partial<typeof users.$inferInsert> = {};
  if (data.email) updates.email = data.email.toLowerCase();
  if (data.name) updates.name = data.name;
  if (data.role) updates.role = data.role;
  if (data.disabled !== undefined) updates.disabled = data.disabled;
  if (data.password) updates.passwordHash = await bcrypt.hash(data.password, 12);
  updates.updatedAt = new Date();

  const [user] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, data.id))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      disabled: users.disabled,
      avatarPath: users.avatarPath,
    });
  revalidatePath("/admin");
  return user;
}

export async function updateProfile(input: unknown) {
  const session = await requireAuth();
  const data = updateProfileSchema.parse(input);
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!existing) throw new Error("User not found");

  if (data.newPassword) {
    if (!data.currentPassword) throw new Error("Current password required");
    const valid = await bcrypt.compare(data.currentPassword, existing.passwordHash);
    if (!valid) throw new Error("Invalid current password");
  }

  const [user] = await db
    .update(users)
    .set({
      name: data.name,
      passwordHash: data.newPassword
        ? await bcrypt.hash(data.newPassword, 12)
        : existing.passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      avatarPath: users.avatarPath,
    });

  revalidatePath("/settings");
  return user;
}

export async function getNotifications() {
  const session = await requireAuth();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function getUnreadNotificationCount() {
  const session = await requireAuth();
  const [result] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, session.user.id),
        isNull(notifications.readAt)
      )
    );
  return result?.value ?? 0;
}

export async function markNotificationRead(id: string) {
  const session = await requireAuth();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, session.user.id))
    );
  revalidatePath("/");
  return { success: true };
}

export async function markAllNotificationsRead() {
  const session = await requireAuth();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, session.user.id),
        isNull(notifications.readAt)
      )
    );
  revalidatePath("/");
  return { success: true };
}

export async function createNotification(input: {
  userId: string;
  type: "task" | "monitor" | "system";
  title: string;
  body: string;
  link?: string;
}) {
  await db.insert(notifications).values(input);
}

export async function getDashboardStats() {
  const session = await requireAuth();
  const { monitorDevices, tasks } = await import("@/lib/db/schema");

  const [downDevices] = await db
    .select({ value: count() })
    .from(monitorDevices)
    .where(eq(monitorDevices.lastStatus, "down"));

  const [overdueTasks] = await db
    .select({ value: count() })
    .from(tasks)
    .where(and(lt(tasks.dueDate, new Date()), isNotNull(tasks.dueDate)));

  const [unread] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, session.user.id),
        isNull(notifications.readAt)
      )
    );

  return {
    downDevices: downDevices?.value ?? 0,
    overdueTasks: overdueTasks?.value ?? 0,
    unreadNotifications: unread?.value ?? 0,
  };
}
