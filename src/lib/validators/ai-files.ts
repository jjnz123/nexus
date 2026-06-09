import { z } from "zod";
import { aiAttachmentSchema } from "@/lib/validators/ai-chat";

export const aiStoredFileSchema = aiAttachmentSchema.extend({
  displayName: z.string().min(1).max(255).optional(),
});

export const aiProjectFileInputSchema = z.object({
  projectId: z.string().uuid(),
  path: z.string().max(500),
  filename: z.string().max(255),
  mimeType: z.string().max(100),
  size: z.number().int().min(0),
  displayName: z.string().min(1).max(255).optional(),
});

export const aiConversationFileInputSchema = z.object({
  conversationId: z.string().uuid(),
  path: z.string().max(500),
  filename: z.string().max(255),
  mimeType: z.string().max(100),
  size: z.number().int().min(0),
  displayName: z.string().min(1).max(255).optional(),
});

export const aiRenameFileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(255),
});
