"use server";

import { revalidatePath } from "next/cache";
import { eq, asc, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookmarkTabs,
  bookmarkGroups,
  bookmarkCards,
  bookmarkShares,
  users,
  type BookmarkShareResource,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { z } from "zod";

const shareUpdateSchema = z.object({
  resourceType: z.enum(["tab", "group", "card"]),
  resourceId: z.string().uuid(),
  visibility: z.enum(["everyone", "restricted"]).optional(),
  userIds: z.array(z.string().uuid()),
});

function requireAdmin(session: Awaited<ReturnType<typeof requireAuth>>) {
  if (
    session.user.role !== "admin" &&
    !hasPermission(session.user.role, "admin:access", session.user.permissions)
  ) {
    throw new Error("Forbidden");
  }
}

async function resolveTabIdsForShares(userId: string) {
  const shares = await db
    .select()
    .from(bookmarkShares)
    .where(eq(bookmarkShares.userId, userId));

  const tabIds = new Set<string>();
  for (const share of shares) {
    if (share.resourceType === "tab") {
      tabIds.add(share.resourceId);
      continue;
    }
    if (share.resourceType === "group") {
      const [group] = await db
        .select({ tabId: bookmarkGroups.tabId })
        .from(bookmarkGroups)
        .where(eq(bookmarkGroups.id, share.resourceId))
        .limit(1);
      if (group) tabIds.add(group.tabId);
      continue;
    }
    if (share.resourceType === "card") {
      const [card] = await db
        .select({ groupId: bookmarkCards.groupId })
        .from(bookmarkCards)
        .where(eq(bookmarkCards.id, share.resourceId))
        .limit(1);
      if (card) {
        const [group] = await db
          .select({ tabId: bookmarkGroups.tabId })
          .from(bookmarkGroups)
          .where(eq(bookmarkGroups.id, card.groupId))
          .limit(1);
        if (group) tabIds.add(group.tabId);
      }
    }
  }
  return tabIds;
}

export async function filterVisibleBookmarkTabs<T extends { id: string; visibility: string }>(
  tabs: T[],
  session: Awaited<ReturnType<typeof requireAuth>>
): Promise<T[]> {
  if (
    session.user.role === "admin" ||
    hasPermission(session.user.role, "admin:access", session.user.permissions)
  ) {
    return tabs;
  }

  const sharedTabIds = await resolveTabIdsForShares(session.user.id);
  return tabs.filter(
    (tab) => tab.visibility === "everyone" || sharedTabIds.has(tab.id)
  );
}

export async function getShareableUsers() {
  const session = await requireAuth();
  requireAdmin(session);
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.disabled, false))
    .orderBy(asc(users.name));
}

export async function getBookmarkShareState(
  resourceType: BookmarkShareResource,
  resourceId: string
) {
  const session = await requireAuth();
  requireAdmin(session);

  let visibility: "everyone" | "restricted" = "everyone";
  if (resourceType === "tab") {
    const [tab] = await db
      .select({ visibility: bookmarkTabs.visibility })
      .from(bookmarkTabs)
      .where(eq(bookmarkTabs.id, resourceId))
      .limit(1);
    visibility = (tab?.visibility as "everyone" | "restricted") ?? "everyone";
  }

  const shares = await db
    .select({ userId: bookmarkShares.userId })
    .from(bookmarkShares)
    .where(
      and(
        eq(bookmarkShares.resourceType, resourceType),
        eq(bookmarkShares.resourceId, resourceId)
      )
    );

  return {
    visibility,
    userIds: shares.map((s) => s.userId),
  };
}

export async function updateBookmarkSharing(input: unknown) {
  const session = await requireAuth();
  requireAdmin(session);
  const data = shareUpdateSchema.parse(input);

  if (data.resourceType === "tab" && data.visibility) {
    await db
      .update(bookmarkTabs)
      .set({ visibility: data.visibility })
      .where(eq(bookmarkTabs.id, data.resourceId));
  }

  await db
    .delete(bookmarkShares)
    .where(
      and(
        eq(bookmarkShares.resourceType, data.resourceType),
        eq(bookmarkShares.resourceId, data.resourceId)
      )
    );

  if (data.userIds.length) {
    await db.insert(bookmarkShares).values(
      data.userIds.map((userId) => ({
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        userId,
        sharedBy: session.user.id,
      }))
    );
  }

  revalidatePath("/bookmarks");
  return { success: true };
}
