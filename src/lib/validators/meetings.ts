import { z } from "zod";

export const createMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  projectId: z.string().uuid().nullable().optional(),
  meetingAt: z.string().datetime().optional(),
  labels: z.array(z.string().min(1).max(40)).max(20).optional(),
});

export const updateMeetingSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  projectId: z.string().uuid().nullable().optional(),
  meetingAt: z.string().datetime().optional(),
  labels: z.array(z.string().min(1).max(40)).max(20).optional(),
});

export const attachMeetingAudioSchema = z.object({
  meetingId: z.string().uuid(),
  audioPath: z.string().min(1),
  audioFilename: z.string().min(1),
  audioMimeType: z.string().min(1),
  audioSize: z.number().int().positive(),
});

export const meetingChatSchema = z.object({
  meetingId: z.string().uuid(),
  question: z.string().min(1).max(4000),
});

export const convertActionItemSchema = z.object({
  actionItemId: z.string().uuid(),
  projectId: z.string().uuid(),
  columnId: z.string().uuid().optional(),
});

export const meetingSearchSchema = z.object({
  query: z.string().optional(),
  projectId: z.string().uuid().optional(),
  label: z.string().optional(),
  archived: z.boolean().optional(),
});
