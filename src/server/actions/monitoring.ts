"use server";

import { revalidatePath } from "next/cache";
import { eq, desc, and, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorDevices, monitorChecks } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { deviceSchema, updateDeviceSchema } from "@/lib/validators/monitoring";
import { forceCheckDevice } from "@/server/jobs/monitor-runner";
import { logAudit } from "@/server/audit";

export async function getMonitorDevices() {
  const session = await requireAuth();
  requirePermission(session.user.role, "monitoring:view");
  return db.select().from(monitorDevices).orderBy(monitorDevices.name);
}

export async function getMonitorDevice(id: string) {
  const session = await requireAuth();
  requirePermission(session.user.role, "monitoring:view");
  const [device] = await db
    .select()
    .from(monitorDevices)
    .where(eq(monitorDevices.id, id))
    .limit(1);
  return device ?? null;
}

export async function getDeviceChecks(deviceId: string, hours = 24) {
  const session = await requireAuth();
  requirePermission(session.user.role, "monitoring:view");
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db
    .select()
    .from(monitorChecks)
    .where(
      and(
        eq(monitorChecks.deviceId, deviceId),
        gte(monitorChecks.checkedAt, since)
      )
    )
    .orderBy(desc(monitorChecks.checkedAt))
    .limit(500);
}

export async function getDevicesWithRecentChecks() {
  const session = await requireAuth();
  requirePermission(session.user.role, "monitoring:view");

  const devices = await db.select().from(monitorDevices).orderBy(monitorDevices.name);
  const enriched = await Promise.all(
    devices.map(async (device) => {
      const checks = await db
        .select()
        .from(monitorChecks)
        .where(eq(monitorChecks.deviceId, device.id))
        .orderBy(desc(monitorChecks.checkedAt))
        .limit(20);
      return { device, checks, lastCheck: checks[0] ?? null };
    })
  );
  return enriched;
}

export async function createMonitorDevice(input: unknown) {
  const session = await requireAuth();
  requirePermission(session.user.role, "monitoring:configure");
  const data = deviceSchema.parse(input);
  const [device] = await db.insert(monitorDevices).values(data).returning();
  revalidatePath("/monitoring");
  await logAudit({
    action: "monitoring.device.create",
    resource: "monitor_device",
    resourceId: device.id,
    summary: `Created monitor device "${device.name}"`,
    details: { target: device.target, checkType: device.checkType },
  });
  return device;
}

export async function updateMonitorDevice(input: unknown) {
  const session = await requireAuth();
  requirePermission(session.user.role, "monitoring:configure");
  const data = updateDeviceSchema.parse(input);
  const { id, ...updates } = data;
  const [device] = await db
    .update(monitorDevices)
    .set(updates)
    .where(eq(monitorDevices.id, id))
    .returning();
  revalidatePath("/monitoring");
  await logAudit({
    action: "monitoring.device.update",
    resource: "monitor_device",
    resourceId: device.id,
    summary: `Updated monitor device "${device.name}"`,
  });
  return device;
}

export async function deleteMonitorDevice(id: string) {
  const session = await requireAuth();
  requirePermission(session.user.role, "monitoring:configure");
  await db.delete(monitorDevices).where(eq(monitorDevices.id, id));
  revalidatePath("/monitoring");
  await logAudit({
    action: "monitoring.device.delete",
    resource: "monitor_device",
    resourceId: id,
    summary: `Deleted monitor device ${id}`,
  });
  return { success: true };
}

export async function forceDeviceCheck(id: string) {
  const session = await requireAuth();
  requirePermission(session.user.role, "monitoring:view");
  const check = await forceCheckDevice(db, id);
  revalidatePath("/monitoring");
  revalidatePath(`/monitoring/${id}`);
  await logAudit({
    action: "monitoring.device.force_check",
    resource: "monitor_device",
    resourceId: id,
    summary: `Forced health check for device ${id}`,
    details: { status: check.status },
  });
  return check;
}

export async function getMonitoringStats() {
  const session = await requireAuth();
  requirePermission(session.user.role, "monitoring:view");
  const devices = await db.select().from(monitorDevices);
  return {
    total: devices.length,
    up: devices.filter((d) => d.lastStatus === "up").length,
    down: devices.filter((d) => d.lastStatus === "down").length,
    unknown: devices.filter((d) => d.lastStatus === "unknown" || !d.lastStatus).length,
  };
}
