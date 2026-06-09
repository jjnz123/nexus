import { z } from "zod";

export const bookmarkTabSchema = z.object({
  name: z.string().min(1).max(100),
});

export const bookmarkGroupSchema = z.object({
  tabId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(100).optional(),
});

export const bookmarkIconTypeSchema = z.enum(["lucide", "emoji", "image", "text"]);

export const bookmarkCardSchema = z.object({
  groupId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  url: z.string().url(),
  icon: z.string().max(100).optional(),
  iconType: bookmarkIconTypeSchema.optional(),
  iconValue: z.string().max(500).optional(),
  accentColor: z.string().max(20).optional(),
  openInIframe: z.boolean().optional(),
  enabled: z.boolean().optional(),
  favourite: z.boolean().optional(),
});

export const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int().min(0),
      groupId: z.string().uuid().optional(),
    })
  ),
});

export const reorderTabsSchema = z.object({
  tabIds: z.array(z.string().uuid()).min(1),
});

export const bulkCardActionSchema = z.object({
  cardIds: z.array(z.string().uuid()).min(1),
  action: z.enum([
    "enable",
    "disable",
    "delete",
    "archive",
    "restore",
    "favourite",
    "unfavourite",
  ]),
  groupId: z.string().uuid().optional(),
  tabId: z.string().uuid().optional(),
});

export const importBookmarksSchema = z.object({
  json: z.string(),
  mode: z.enum(["merge", "replace"]),
});

export const exportBookmarksSchema = z.object({
  tabId: z.string().uuid().optional(),
  cardIds: z.array(z.string().uuid()).optional(),
  includeArchived: z.boolean().optional(),
});

export const recordLaunchSchema = z.object({
  cardId: z.string().uuid(),
  source: z.enum(["bookmarks", "landing", "search"]),
});

export const MAX_USER_FAVOURITES = 5;

export type BookmarkCardInput = z.infer<typeof bookmarkCardSchema>;
