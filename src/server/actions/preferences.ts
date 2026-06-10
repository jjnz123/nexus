"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { COLOR_THEMES } from "@/lib/theme";
import { setThemeCookie } from "@/lib/theme-server";

const homeOrderSchema = z.object({
  cardIds: z.array(z.string().uuid()).max(50),
});

const bookmarkPrefsSchema = z.object({
  activeBookmarkTabId: z.string().uuid().nullable().optional(),
  bookmarksLayoutMode: z.enum(["grid", "list"]).optional(),
  bookmarksGlobalLayoutLocked: z.boolean().optional(),
  bookmarksSortMode: z
    .enum(["custom", "alphabetical", "most_used", "most_used_30d", "recently_used", "health"])
    .optional(),
  activeAiProjectId: z.string().uuid().nullable().optional(),
  activeAiConversationId: z.string().uuid().nullable().optional(),
  activeKanbanProjectId: z.string().uuid().nullable().optional(),
  chatSidebarCollapsed: z.boolean().optional(),
  appSidebarCollapsed: z.boolean().optional(),
  notesWorkspace: z
    .object({
      openTabIds: z.array(z.string().uuid()),
      activeTabId: z.string().uuid().nullable(),
      activeProjectId: z.string().uuid().nullable(),
      previewVisible: z.boolean(),
      explorerCollapsed: z.boolean(),
    })
    .optional(),
  tasksWorkspace: z
    .object({
      descriptionHeight: z.number().min(120).max(800).optional(),
      boardFilters: z
        .record(z.string(), z.enum(["all", "bugs", "others"]))
        .optional(),
    })
    .optional(),
  homeDashboard: z
    .object({
      widgetOrder: z.array(
        z.enum(["search", "operations", "suggestions", "favourites", "boardLinks"])
      ),
      widgets: z.record(
        z.enum(["search", "operations", "suggestions", "favourites", "boardLinks"]),
        z.object({
          visible: z.boolean(),
          minimized: z.boolean(),
        })
      ),
      boardLinks: z.array(
        z.object({
          id: z.string().uuid(),
          projectId: z.string().uuid(),
          label: z.string().nullable().optional(),
        })
      ),
    })
    .optional(),
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

export async function updateColorTheme(input: unknown) {
  const session = await requireAuth();
  const theme = z.enum(COLOR_THEMES).parse(input);
  await getOrCreatePrefs(session.user.id);

  await db
    .update(userPreferences)
    .set({ colorTheme: theme, updatedAt: new Date() })
    .where(eq(userPreferences.userId, session.user.id));

  await setThemeCookie(theme);
  return { theme };
}
