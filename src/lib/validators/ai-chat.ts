import { z } from "zod";

export const aiAttachmentSchema = z.object({
  path: z.string().max(500),
  filename: z.string().max(255),
  mimeType: z.string().max(100),
  size: z.number().int().min(0),
});

export const aiProjectSchema = z.object({
  name: z.string().min(1).max(100),
});

export const aiConversationSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
});

export const aiMessageSchema = z
  .object({
    conversationId: z.string().uuid(),
    content: z.string().max(100_000),
    attachments: z.array(aiAttachmentSchema).max(5).optional(),
  })
  .refine(
    (data) => data.content.trim().length > 0 || (data.attachments?.length ?? 0) > 0,
    { message: "Message must include text or attachments" }
  );

export const aiAdminSearchSchema = z.object({
  query: z.string().max(500).optional(),
  userId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export type AiAttachmentInput = z.infer<typeof aiAttachmentSchema>;
