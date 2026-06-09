import { z } from "zod";

export const userPermissionsSchema = z.object({
  useCustom: z.boolean().optional(),
  ai: z.boolean().optional(),
  bookmarksView: z.boolean().optional(),
  bookmarksEdit: z.boolean().optional(),
  tasksView: z.boolean().optional(),
  tasksEdit: z.boolean().optional(),
  monitoringView: z.boolean().optional(),
  monitoringConfigure: z.boolean().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
  backupCode: z.string().optional(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
  role: z.enum(["admin", "editor", "user", "viewer"]),
  permissions: userPermissionsSchema.optional(),
  sendWelcomeEmail: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["admin", "editor", "user", "viewer"]).optional(),
  status: z.enum(["pending", "member", "administrator"]).optional(),
  disabled: z.boolean().optional(),
  permissions: userPermissionsSchema.optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export const totpSetupVerifySchema = z.object({
  code: z.string().min(6).max(8),
});

export const totpDisableSchema = z.object({
  currentPassword: z.string().min(1),
  code: z.string().min(6).max(20),
});

export const sendEmailTotpSchema = z.object({
  currentPassword: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
