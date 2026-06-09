"use server";

import { revalidatePath } from "next/cache";
import { eq, asc, inArray, desc, and, isNull, count } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookmarkTabs,
  bookmarkGroups,
  bookmarkCards,
  userBookmarkFavourites,
  bookmarkLaunches,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import {
  bookmarkTabSchema,
  bookmarkGroupSchema,
  bookmarkCardSchema,
  reorderSchema,
  reorderTabsSchema,
  bulkCardActionSchema,
  importBookmarksSchema,
  exportBookmarksSchema,
  recordLaunchSchema,
  MAX_USER_FAVOURITES,
} from "@/lib/validators/bookmarks";
import { logAudit } from "@/server/audit";

function cardInputFromData(data: ReturnType<typeof bookmarkCardSchema.parse>) {
  return {
    groupId: data.groupId,
    title: data.title,
    description: data.description ?? null,
    url: data.url,
    icon: data.icon ?? data.iconValue ?? null,
    iconType: data.iconType ?? "text",
    iconValue: data.iconValue ?? data.icon ?? null,
    accentColor: data.accentColor ?? "#6366f1",
    openInIframe: data.openInIframe ?? false,
    enabled: data.enabled ?? true,
    favourite: data.favourite ?? false,
  };
}

export async function getBookmarkTabs() {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:view");
  return db.select().from(bookmarkTabs).orderBy(asc(bookmarkTabs.sortOrder));
}

export async function getBookmarkTabData(tabId: string, includeArchived = false) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:view");

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
    .where(
      includeArchived
        ? inArray(bookmarkCards.groupId, groupIds)
        : and(inArray(bookmarkCards.groupId, groupIds), isNull(bookmarkCards.archivedAt))
    )
    .orderBy(asc(bookmarkCards.sortOrder));

  return { groups, cards };
}

export async function getAllBookmarkCards() {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:view");

  return db
    .select({
      card: bookmarkCards,
      group: bookmarkGroups,
      tab: bookmarkTabs,
    })
    .from(bookmarkCards)
    .innerJoin(bookmarkGroups, eq(bookmarkCards.groupId, bookmarkGroups.id))
    .innerJoin(bookmarkTabs, eq(bookmarkGroups.tabId, bookmarkTabs.id))
    .where(isNull(bookmarkCards.archivedAt))
    .orderBy(asc(bookmarkCards.sortOrder));
}

export async function getUserFavouriteCardIds() {
  const session = await requireAuth();
  const rows = await db
    .select({ cardId: userBookmarkFavourites.cardId })
    .from(userBookmarkFavourites)
    .where(eq(userBookmarkFavourites.userId, session.user.id))
    .orderBy(asc(userBookmarkFavourites.sortOrder));
  return rows.map((r) => r.cardId);
}

export async function getFavouriteCards() {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:view");

  const favRows = await db
    .select({ cardId: userBookmarkFavourites.cardId, sortOrder: userBookmarkFavourites.sortOrder })
    .from(userBookmarkFavourites)
    .where(eq(userBookmarkFavourites.userId, session.user.id))
    .orderBy(asc(userBookmarkFavourites.sortOrder))
    .limit(MAX_USER_FAVOURITES);

  if (favRows.length === 0) {
    const legacy = await db
      .select({
        card: bookmarkCards,
        group: bookmarkGroups,
        tab: bookmarkTabs,
      })
      .from(bookmarkCards)
      .innerJoin(bookmarkGroups, eq(bookmarkCards.groupId, bookmarkGroups.id))
      .innerJoin(bookmarkTabs, eq(bookmarkGroups.tabId, bookmarkTabs.id))
      .where(and(eq(bookmarkCards.favourite, true), isNull(bookmarkCards.archivedAt)))
      .orderBy(desc(bookmarkCards.sortOrder))
      .limit(MAX_USER_FAVOURITES);
    return legacy;
  }

  const cardIds = favRows.map((r) => r.cardId);
  const rows = await db
    .select({
      card: bookmarkCards,
      group: bookmarkGroups,
      tab: bookmarkTabs,
    })
    .from(bookmarkCards)
    .innerJoin(bookmarkGroups, eq(bookmarkCards.groupId, bookmarkGroups.id))
    .innerJoin(bookmarkTabs, eq(bookmarkGroups.tabId, bookmarkTabs.id))
    .where(and(inArray(bookmarkCards.id, cardIds), isNull(bookmarkCards.archivedAt)));

  const orderMap = new Map(favRows.map((r, i) => [r.cardId, i]));
  return rows.sort((a, b) => (orderMap.get(a.card.id) ?? 0) - (orderMap.get(b.card.id) ?? 0));
}

export async function toggleUserFavourite(cardId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:view");

  const [existing] = await db
    .select()
    .from(userBookmarkFavourites)
    .where(
      and(
        eq(userBookmarkFavourites.userId, session.user.id),
        eq(userBookmarkFavourites.cardId, cardId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .delete(userBookmarkFavourites)
      .where(
        and(
          eq(userBookmarkFavourites.userId, session.user.id),
          eq(userBookmarkFavourites.cardId, cardId)
        )
      );
    revalidatePath("/");
    revalidatePath("/bookmarks");
    return { favourited: false };
  }

  const [{ value: favCount }] = await db
    .select({ value: count() })
    .from(userBookmarkFavourites)
    .where(eq(userBookmarkFavourites.userId, session.user.id));

  if (Number(favCount) >= MAX_USER_FAVOURITES) {
    throw new Error(`You can only favourite up to ${MAX_USER_FAVOURITES} bookmarks`);
  }

  await db.insert(userBookmarkFavourites).values({
    userId: session.user.id,
    cardId,
    sortOrder: Number(favCount),
  });

  revalidatePath("/");
  revalidatePath("/bookmarks");
  return { favourited: true };
}

export async function recordBookmarkLaunch(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:view");
  const data = recordLaunchSchema.parse(input);

  await db.insert(bookmarkLaunches).values({
    userId: session.user.id,
    cardId: data.cardId,
    source: data.source,
  });

  return { success: true };
}

export async function createBookmarkTab(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const data = bookmarkTabSchema.parse(input);
  const tabs = await db.select().from(bookmarkTabs);
  const [tab] = await db
    .insert(bookmarkTabs)
    .values({ name: data.name, sortOrder: tabs.length, createdBy: session.user.id })
    .returning();
  revalidatePath("/bookmarks");
  await logAudit({
    action: "bookmarks.tab.create",
    resource: "bookmark_tab",
    resourceId: tab.id,
    summary: `Created bookmark tab "${tab.name}"`,
  });
  return tab;
}

export async function updateBookmarkTab(
  id: string,
  input: { name?: string; layoutLocked?: boolean }
) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const [tab] = await db.update(bookmarkTabs).set(input).where(eq(bookmarkTabs.id, id)).returning();
  revalidatePath("/bookmarks");
  return tab;
}

export async function reorderBookmarkTabs(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const { tabIds } = reorderTabsSchema.parse(input);
  for (let i = 0; i < tabIds.length; i++) {
    await db.update(bookmarkTabs).set({ sortOrder: i }).where(eq(bookmarkTabs.id, tabIds[i]));
  }
  revalidatePath("/bookmarks");
  return { success: true };
}

export async function deleteBookmarkTab(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  await db.delete(bookmarkTabs).where(eq(bookmarkTabs.id, id));
  revalidatePath("/bookmarks");
  return { success: true };
}

export async function createBookmarkGroup(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const data = bookmarkGroupSchema.parse(input);
  const groups = await db.select().from(bookmarkGroups).where(eq(bookmarkGroups.tabId, data.tabId));
  const [group] = await db
    .insert(bookmarkGroups)
    .values({
      tabId: data.tabId,
      name: data.name,
      description: data.description ?? null,
      icon: data.icon ?? null,
      sortOrder: groups.length,
    })
    .returning();
  revalidatePath("/bookmarks");
  return group;
}

export async function updateBookmarkGroup(
  id: string,
  input: { name?: string; description?: string | null; icon?: string | null; collapsed?: boolean }
) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const [group] = await db.update(bookmarkGroups).set(input).where(eq(bookmarkGroups.id, id)).returning();
  revalidatePath("/bookmarks");
  return group;
}

export async function deleteBookmarkGroup(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");

  const [{ value: cardCount }] = await db
    .select({ value: count() })
    .from(bookmarkCards)
    .where(and(eq(bookmarkCards.groupId, id), isNull(bookmarkCards.archivedAt)));

  if (Number(cardCount) > 0) {
    throw new Error("Group must be empty before deletion");
  }

  await db.delete(bookmarkGroups).where(eq(bookmarkGroups.id, id));
  revalidatePath("/bookmarks");
  return { success: true };
}

export async function createBookmarkCard(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const data = bookmarkCardSchema.parse(input);
  const cards = await db
    .select()
    .from(bookmarkCards)
    .where(and(eq(bookmarkCards.groupId, data.groupId), isNull(bookmarkCards.archivedAt)));
  const [card] = await db
    .insert(bookmarkCards)
    .values({ ...cardInputFromData(data), sortOrder: cards.length })
    .returning();
  revalidatePath("/bookmarks");
  revalidatePath("/");
  await logAudit({
    action: "bookmarks.card.create",
    resource: "bookmark_card",
    resourceId: card.id,
    summary: `Created bookmark "${card.title}"`,
    details: { url: card.url },
  });
  return card;
}

export async function duplicateBookmarkCard(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const [source] = await db.select().from(bookmarkCards).where(eq(bookmarkCards.id, id)).limit(1);
  if (!source) throw new Error("Card not found");

  const cards = await db
    .select()
    .from(bookmarkCards)
    .where(and(eq(bookmarkCards.groupId, source.groupId), isNull(bookmarkCards.archivedAt)));

  const [card] = await db
    .insert(bookmarkCards)
    .values({
      groupId: source.groupId,
      title: `${source.title} (copy)`,
      description: source.description,
      url: source.url,
      icon: source.icon,
      iconType: source.iconType,
      iconValue: source.iconValue,
      accentColor: source.accentColor,
      openInIframe: source.openInIframe,
      enabled: source.enabled,
      favourite: false,
      sortOrder: cards.length,
    })
    .returning();

  revalidatePath("/bookmarks");
  return card;
}

export async function updateBookmarkCard(
  id: string,
  input: Partial<{
    title: string;
    description: string | null;
    url: string;
    icon: string | null;
    iconType: "lucide" | "emoji" | "image" | "text";
    iconValue: string | null;
    accentColor: string;
    openInIframe: boolean;
    enabled: boolean;
    favourite: boolean;
    groupId: string;
    archivedAt: Date | null;
  }>
) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const [card] = await db.update(bookmarkCards).set(input).where(eq(bookmarkCards.id, id)).returning();
  revalidatePath("/bookmarks");
  revalidatePath("/");
  return card;
}

export async function archiveBookmarkCard(id: string) {
  return updateBookmarkCard(id, { archivedAt: new Date() });
}

export async function restoreBookmarkCard(id: string) {
  return updateBookmarkCard(id, { archivedAt: null });
}

export async function deleteBookmarkCard(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  await db.delete(userBookmarkFavourites).where(eq(userBookmarkFavourites.cardId, id));
  await db.delete(bookmarkCards).where(eq(bookmarkCards.id, id));
  revalidatePath("/bookmarks");
  revalidatePath("/");
  return { success: true };
}

export async function reorderBookmarkItems(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
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

async function moveCardsToTab(cardIds: string[], tabId: string) {
  const [firstGroup] = await db
    .select()
    .from(bookmarkGroups)
    .where(eq(bookmarkGroups.tabId, tabId))
    .orderBy(asc(bookmarkGroups.sortOrder))
    .limit(1);

  if (!firstGroup) throw new Error("Target tab has no groups");

  const cards = await db
    .select()
    .from(bookmarkCards)
    .where(and(eq(bookmarkCards.groupId, firstGroup.id), isNull(bookmarkCards.archivedAt)));

  await db
    .update(bookmarkCards)
    .set({ groupId: firstGroup.id, sortOrder: cards.length })
    .where(inArray(bookmarkCards.id, cardIds));
}

export async function bulkBookmarkCardAction(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const data = bulkCardActionSchema.parse(input);

  switch (data.action) {
    case "delete":
      await db.delete(userBookmarkFavourites).where(inArray(userBookmarkFavourites.cardId, data.cardIds));
      await db.delete(bookmarkCards).where(inArray(bookmarkCards.id, data.cardIds));
      break;
    case "archive":
      await db
        .update(bookmarkCards)
        .set({ archivedAt: new Date() })
        .where(inArray(bookmarkCards.id, data.cardIds));
      await db
        .delete(userBookmarkFavourites)
        .where(inArray(userBookmarkFavourites.cardId, data.cardIds));
      break;
    case "restore":
      await db
        .update(bookmarkCards)
        .set({ archivedAt: null })
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
      for (const cardId of data.cardIds) {
        const [exists] = await db
          .select()
          .from(userBookmarkFavourites)
          .where(
            and(
              eq(userBookmarkFavourites.userId, session.user.id),
              eq(userBookmarkFavourites.cardId, cardId)
            )
          )
          .limit(1);
        if (exists) continue;
        const [{ value: favCount }] = await db
          .select({ value: count() })
          .from(userBookmarkFavourites)
          .where(eq(userBookmarkFavourites.userId, session.user.id));
        if (Number(favCount) >= MAX_USER_FAVOURITES) break;
        await db.insert(userBookmarkFavourites).values({
          userId: session.user.id,
          cardId,
          sortOrder: Number(favCount),
        });
      }
      break;
    case "unfavourite":
      await db
        .delete(userBookmarkFavourites)
        .where(
          and(
            eq(userBookmarkFavourites.userId, session.user.id),
            inArray(userBookmarkFavourites.cardId, data.cardIds)
          )
        );
      break;
  }

  if (data.groupId) {
    await db
      .update(bookmarkCards)
      .set({ groupId: data.groupId })
      .where(inArray(bookmarkCards.id, data.cardIds));
  } else if (data.tabId) {
    await moveCardsToTab(data.cardIds, data.tabId);
  }

  revalidatePath("/bookmarks");
  revalidatePath("/");
  await logAudit({
    action: "bookmarks.bulk",
    summary: `Bulk bookmark action: ${data.action} on ${data.cardIds.length} cards`,
    details: { action: data.action, count: data.cardIds.length },
  });
  return { success: true };
}

export async function exportBookmarks(input?: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:view");
  const filters = input ? exportBookmarksSchema.parse(input) : {};

  let tabs = await db.select().from(bookmarkTabs).orderBy(asc(bookmarkTabs.sortOrder));
  if (filters.tabId) tabs = tabs.filter((t) => t.id === filters.tabId);

  const tabIds = tabs.map((t) => t.id);
  const groups =
    tabIds.length > 0
      ? await db
          .select()
          .from(bookmarkGroups)
          .where(inArray(bookmarkGroups.tabId, tabIds))
          .orderBy(asc(bookmarkGroups.sortOrder))
      : [];

  let cards = await db.select().from(bookmarkCards).orderBy(asc(bookmarkCards.sortOrder));
  if (!filters.includeArchived) {
    cards = cards.filter((c) => !c.archivedAt);
  }
  if (filters.cardIds?.length) {
    cards = cards.filter((c) => filters.cardIds!.includes(c.id));
  } else if (tabIds.length) {
    const groupIds = new Set(groups.map((g) => g.id));
    cards = cards.filter((c) => groupIds.has(c.groupId));
  }

  return { tabs, groups, cards, exportedAt: new Date().toISOString() };
}

export async function importBookmarks(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const { json, mode } = importBookmarksSchema.parse(input);
  const data = JSON.parse(json) as {
    tabs: (typeof bookmarkTabs.$inferSelect)[];
    groups: (typeof bookmarkGroups.$inferSelect)[];
    cards: (typeof bookmarkCards.$inferSelect)[];
  };

  if (mode === "replace") {
    await db.delete(bookmarkCards);
    await db.delete(bookmarkGroups);
    await db.delete(bookmarkTabs);
  }

  for (const tab of data.tabs) {
    await db
      .insert(bookmarkTabs)
      .values({
        id: tab.id,
        name: tab.name,
        sortOrder: tab.sortOrder,
        layoutLocked: tab.layoutLocked,
        createdBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: bookmarkTabs.id,
        set: { name: tab.name, sortOrder: tab.sortOrder, layoutLocked: tab.layoutLocked },
      });
  }
  for (const group of data.groups) {
    await db
      .insert(bookmarkGroups)
      .values(group)
      .onConflictDoUpdate({
        target: bookmarkGroups.id,
        set: {
          name: group.name,
          description: group.description,
          icon: group.icon,
          collapsed: group.collapsed,
          sortOrder: group.sortOrder,
          tabId: group.tabId,
        },
      });
  }
  for (const card of data.cards) {
    await db
      .insert(bookmarkCards)
      .values(card)
      .onConflictDoUpdate({
        target: bookmarkCards.id,
        set: {
          groupId: card.groupId,
          title: card.title,
          description: card.description,
          url: card.url,
          icon: card.icon,
          iconType: card.iconType ?? "text",
          iconValue: card.iconValue,
          accentColor: card.accentColor ?? "#6366f1",
          openInIframe: card.openInIframe ?? false,
          enabled: card.enabled,
          favourite: card.favourite,
          archivedAt: card.archivedAt,
          sortOrder: card.sortOrder,
        },
      });
  }

  revalidatePath("/bookmarks");
  await logAudit({
    action: "bookmarks.import",
    summary: `Imported ${data.tabs.length} tabs, ${data.cards.length} cards (${mode})`,
    details: { tabs: data.tabs.length, cards: data.cards.length, mode },
  });
  return { success: true };
}

export async function previewImportBookmarks(json: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const data = JSON.parse(json) as {
    tabs: unknown[];
    groups: unknown[];
    cards: unknown[];
  };
  return {
    tabs: data.tabs?.length ?? 0,
    groups: data.groups?.length ?? 0,
    cards: data.cards?.length ?? 0,
  };
}
