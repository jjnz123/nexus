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
  description: z.string().max(10000).optional().nullable(),
  details: z.string().max(20000).optional().nullable(),
  acceptanceCriteria: z.string().max(10000).optional().nullable(),
  definitionOfDone: z.string().max(10000).optional().nullable(),
  storyPoints: z.number().int().min(0).max(999).nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  type: z.enum(["epic", "feature", "story", "task"]).optional(),
  parentId: z.string().uuid().nullable().optional(),
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
  parentId: z.string().uuid().nullable().optional(),
});

export const labelSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(50),
  color: z.string().optional(),
});

export const taskLinkSchema = z.object({
  sourceTaskId: z.string().uuid(),
  targetTaskId: z.string().uuid(),
  linkType: z.enum(["relates_to", "blocks", "duplicates"]),
});

export const taskAttachmentSchema = z.object({
  taskId: z.string().uuid(),
  filename: z.string().min(1).max(300),
  path: z.string().min(1).max(500),
  mimeType: z.string().max(200).optional(),
  size: z.number().int().positive(),
});

export const ticketFieldConfigSchema = z.object({
  key: z.string(),
  visible: z.boolean(),
});

export const updateProjectFieldSettingsSchema = z.object({
  projectId: z.string().uuid(),
  ticketFields: z.record(
    z.enum(["epic", "feature", "story", "task"]),
    z.array(ticketFieldConfigSchema)
  ),
});

export const bulkUpdateTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1),
  updates: z.object({
    assigneeId: z.string().uuid().nullable().optional(),
    columnId: z.string().uuid().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  }),
});

export const bulkDeleteTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1),
});

export const roadmapCommitSchema = z.object({
  projectId: z.string().uuid(),
  creates: z.array(
    z.object({
      draftId: z.string(),
      title: z.string().min(1).max(300),
      type: z.enum(["epic", "feature", "story", "task"]),
      parentId: z.string().uuid().nullable().optional(),
      assigneeId: z.string().uuid().nullable().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      dueDate: z.string().datetime().nullable().optional(),
      storyPoints: z.number().int().min(0).max(999).nullable().optional(),
      columnId: z.string().uuid(),
      description: z.string().max(10000).nullable().optional(),
    })
  ),
  updates: z.array(updateTaskSchema),
  deletes: z.array(z.string().uuid()),
});

export type TaskInput = z.infer<typeof taskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
