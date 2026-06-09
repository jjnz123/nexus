import { z } from "zod";

export const deviceSchema = z.object({
  name: z.string().min(1).max(100),
  target: z.string().min(1).max(255),
  checkType: z.enum(["ping", "tcp", "http"]),
  intervalSec: z.number().int().min(10).max(3600).default(60),
  timeoutMs: z.number().int().min(1000).max(30000).default(5000),
  enabled: z.boolean().optional(),
});

export const updateDeviceSchema = deviceSchema.partial().extend({
  id: z.string().uuid(),
});

export type DeviceInput = z.infer<typeof deviceSchema>;
