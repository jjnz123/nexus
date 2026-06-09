import { z } from "zod";

export const bookmarkTabSchema = z.object({
  name: z.string().min(1).max(100),
});

export const bookmarkGroupSchema = z.object({
  tabId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const bookmarkCardSchema = z.object({
  groupId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  url: z.string().url(),
  icon: z.string().max(100).optional(),
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

export const bulkCardActionSchema = z.object({
  cardIds: z.array(z.string().uuid()).min(1),
  action: z.enum(["enable", "disable", "delete", "favourite", "unfavourite"]),
  groupId: z.string().uuid().optional(),
});

export type BookmarkCardInput = z.infer<typeof bookmarkCardSchema>;
