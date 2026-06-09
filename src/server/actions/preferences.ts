"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

const homeOrderSchema = z.object({
  cardIds: z.array(z.string().uuid()).max(50),
});

const bookmarkPrefsSchema = z.object({
  activeBookmarkTabId: z.string().uuid().nullable().optional(),
  bookmarksLayoutMode: z.enum(["grid", "list"]).optional(),
  bookmarksGlobalLayoutLocked: z.boolean().optional(),
});

async function getOrCreatePrefs(userId: string) {
  const [existing] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(userPreferences)
    .values({ userId })
    .returning();
  return created;
}

export async function getBookmarkPreferences() {
  const session = await requireAuth();
  return getOrCreatePrefs(session.user.id);
}

export async function updateBookmarkPreferences(input: unknown) {
  const session = await requireAuth();
  const data = bookmarkPrefsSchema.parse(input);
  await getOrCreatePrefs(session.user.id);

  await db
    .update(userPreferences)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(userPreferences.userId, session.user.id));

  return { success: true };
}

export async function getHomeFavouriteOrder() {
  const session = await requireAuth();
  const prefs = await getOrCreatePrefs(session.user.id);
  return prefs.homeFavouriteOrder ?? [];
}

export async function updateHomeFavouriteOrder(input: unknown) {
  const session = await requireAuth();
  const { cardIds } = homeOrderSchema.parse(input);
  await getOrCreatePrefs(session.user.id);

  await db
    .update(userPreferences)
    .set({ homeFavouriteOrder: cardIds, updatedAt: new Date() })
    .where(eq(userPreferences.userId, session.user.id));

  return { success: true };
}
