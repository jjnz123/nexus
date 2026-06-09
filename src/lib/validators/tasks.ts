import { z } from "zod";

export const projectSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]*$/),
  name: z.string().min(1).max(100),
});

export const columnSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(50),
  color: z.string().optional(),
  wipLimit: z.number().int().positive().nullable().optional(),
  isBacklog: z.boolean().optional(),
});

export const taskSchema = z.object({
  projectId: z.string().uuid(),
  columnId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export const updateTaskSchema = taskSchema.partial().extend({
  id: z.string().uuid(),
  columnId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
});

export const subtaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1).max(300),
});

export const commentSchema = z.object({
  taskId: z.string().uuid(),
  body: z.string().min(1).max(5000),
});

export const labelSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(50),
  color: z.string().optional(),
});

export type TaskInput = z.infer<typeof taskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
