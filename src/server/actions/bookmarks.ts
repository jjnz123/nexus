"use server";

import { revalidatePath } from "next/cache";
import { eq, asc, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookmarkTabs,
  bookmarkGroups,
  bookmarkCards,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import {
  bookmarkTabSchema,
  bookmarkGroupSchema,
  bookmarkCardSchema,
  reorderSchema,
  bulkCardActionSchema,
} from "@/lib/validators/bookmarks";

export async function getBookmarkTabs() {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:view");
  return db.select().from(bookmarkTabs).orderBy(asc(bookmarkTabs.sortOrder));
}

export async function getBookmarkTabData(tabId: string) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:view");

  const groups = await db
    .select()
    .from(bookmarkGroups)
    .where(eq(bookmarkGroups.tabId, tabId))
    .orderBy(asc(bookmarkGroups.sortOrder));

  if (groups.length === 0) return { groups: [], cards: [] };

  const groupIds = groups.map((g) => g.id);
  const cards = await db
    .select()
    .from(bookmarkCards)
    .where(inArray(bookmarkCards.groupId, groupIds))
    .orderBy(asc(bookmarkCards.sortOrder));

  return { groups, cards };
}

export async function getAllBookmarkCards() {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:view");

  const cards = await db
    .select({
      card: bookmarkCards,
      group: bookmarkGroups,
      tab: bookmarkTabs,
    })
    .from(bookmarkCards)
    .innerJoin(bookmarkGroups, eq(bookmarkCards.groupId, bookmarkGroups.id))
    .innerJoin(bookmarkTabs, eq(bookmarkGroups.tabId, bookmarkTabs.id))
    .orderBy(asc(bookmarkCards.sortOrder));

  return cards;
}

export async function getFavouriteCards() {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:view");

  return db
    .select({
      card: bookmarkCards,
      group: bookmarkGroups,
      tab: bookmarkTabs,
    })
    .from(bookmarkCards)
    .innerJoin(bookmarkGroups, eq(bookmarkCards.groupId, bookmarkGroups.id))
    .innerJoin(bookmarkTabs, eq(bookmarkGroups.tabId, bookmarkTabs.id))
    .where(eq(bookmarkCards.favourite, true))
    .orderBy(desc(bookmarkCards.sortOrder))
    .limit(5);
}

export async function createBookmarkTab(input: unknown) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  const data = bookmarkTabSchema.parse(input);
  const tabs = await db.select().from(bookmarkTabs);
  const [tab] = await db
    .insert(bookmarkTabs)
    .values({
      name: data.name,
      sortOrder: tabs.length,
      createdBy: session.user.id,
    })
    .returning();
  revalidatePath("/bookmarks");
  return tab;
}

export async function updateBookmarkTab(
  id: string,
  input: { name?: string; layoutLocked?: boolean }
) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  const [tab] = await db
    .update(bookmarkTabs)
    .set(input)
    .where(eq(bookmarkTabs.id, id))
    .returning();
  revalidatePath("/bookmarks");
  return tab;
}

export async function deleteBookmarkTab(id: string) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  await db.delete(bookmarkTabs).where(eq(bookmarkTabs.id, id));
  revalidatePath("/bookmarks");
  return { success: true };
}

export async function createBookmarkGroup(input: unknown) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  const data = bookmarkGroupSchema.parse(input);
  const groups = await db
    .select()
    .from(bookmarkGroups)
    .where(eq(bookmarkGroups.tabId, data.tabId));
  const [group] = await db
    .insert(bookmarkGroups)
    .values({ ...data, sortOrder: groups.length })
    .returning();
  revalidatePath("/bookmarks");
  return group;
}

export async function updateBookmarkGroup(
  id: string,
  input: { name?: string; collapsed?: boolean }
) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  const [group] = await db
    .update(bookmarkGroups)
    .set(input)
    .where(eq(bookmarkGroups.id, id))
    .returning();
  revalidatePath("/bookmarks");
  return group;
}

export async function deleteBookmarkGroup(id: string) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  await db.delete(bookmarkGroups).where(eq(bookmarkGroups.id, id));
  revalidatePath("/bookmarks");
  return { success: true };
}

export async function createBookmarkCard(input: unknown) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  const data = bookmarkCardSchema.parse(input);
  const cards = await db
    .select()
    .from(bookmarkCards)
    .where(eq(bookmarkCards.groupId, data.groupId));
  const [card] = await db
    .insert(bookmarkCards)
    .values({ ...data, sortOrder: cards.length })
    .returning();
  revalidatePath("/bookmarks");
  revalidatePath("/");
  return card;
}

export async function updateBookmarkCard(
  id: string,
  input: Partial<{
    title: string;
    description: string | null;
    url: string;
    icon: string | null;
    enabled: boolean;
    favourite: boolean;
    groupId: string;
  }>
) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  const [card] = await db
    .update(bookmarkCards)
    .set(input)
    .where(eq(bookmarkCards.id, id))
    .returning();
  revalidatePath("/bookmarks");
  revalidatePath("/");
  return card;
}

export async function deleteBookmarkCard(id: string) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  await db.delete(bookmarkCards).where(eq(bookmarkCards.id, id));
  revalidatePath("/bookmarks");
  revalidatePath("/");
  return { success: true };
}

export async function reorderBookmarkItems(input: unknown) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  const data = reorderSchema.parse(input);

  for (const item of data.items) {
    if (item.groupId) {
      await db
        .update(bookmarkCards)
        .set({ sortOrder: item.sortOrder, groupId: item.groupId })
        .where(eq(bookmarkCards.id, item.id));
    } else {
      await db
        .update(bookmarkGroups)
        .set({ sortOrder: item.sortOrder })
        .where(eq(bookmarkGroups.id, item.id));
    }
  }

  revalidatePath("/bookmarks");
  return { success: true };
}

export async function bulkBookmarkCardAction(input: unknown) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  const data = bulkCardActionSchema.parse(input);

  switch (data.action) {
    case "delete":
      await db
        .delete(bookmarkCards)
        .where(inArray(bookmarkCards.id, data.cardIds));
      break;
    case "enable":
      await db
        .update(bookmarkCards)
        .set({ enabled: true })
        .where(inArray(bookmarkCards.id, data.cardIds));
      break;
    case "disable":
      await db
        .update(bookmarkCards)
        .set({ enabled: false })
        .where(inArray(bookmarkCards.id, data.cardIds));
      break;
    case "favourite":
      await db
        .update(bookmarkCards)
        .set({ favourite: true })
        .where(inArray(bookmarkCards.id, data.cardIds));
      break;
    case "unfavourite":
      await db
        .update(bookmarkCards)
        .set({ favourite: false })
        .where(inArray(bookmarkCards.id, data.cardIds));
      break;
  }

  if (data.groupId) {
    await db
      .update(bookmarkCards)
      .set({ groupId: data.groupId })
      .where(inArray(bookmarkCards.id, data.cardIds));
  }

  revalidatePath("/bookmarks");
  revalidatePath("/");
  return { success: true };
}

export async function exportBookmarks() {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:view");
  const tabs = await db.select().from(bookmarkTabs).orderBy(asc(bookmarkTabs.sortOrder));
  const groups = await db.select().from(bookmarkGroups).orderBy(asc(bookmarkGroups.sortOrder));
  const cards = await db.select().from(bookmarkCards).orderBy(asc(bookmarkCards.sortOrder));
  return { tabs, groups, cards, exportedAt: new Date().toISOString() };
}

export async function importBookmarks(json: string) {
  const session = await requireAuth();
  requirePermission(session.user.role, "bookmarks:edit");
  const data = JSON.parse(json) as {
    tabs: typeof bookmarkTabs.$inferSelect[];
    groups: typeof bookmarkGroups.$inferSelect[];
    cards: typeof bookmarkCards.$inferSelect[];
  };

  for (const tab of data.tabs) {
    await db.insert(bookmarkTabs).values({
      id: tab.id,
      name: tab.name,
      sortOrder: tab.sortOrder,
      layoutLocked: tab.layoutLocked,
      createdBy: session.user.id,
    }).onConflictDoNothing();
  }
  for (const group of data.groups) {
    await db.insert(bookmarkGroups).values(group).onConflictDoNothing();
  }
  for (const card of data.cards) {
    await db.insert(bookmarkCards).values(card).onConflictDoNothing();
  }

  revalidatePath("/bookmarks");
  return { success: true };
}
