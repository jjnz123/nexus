"use server";

import { revalidatePath } from "next/cache";
import { eq, desc, and, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorDevices, monitorChecks, bookmarkCards } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import { deviceSchema, updateDeviceSchema } from "@/lib/validators/monitoring";
import { forceCheckDevice } from "@/server/jobs/monitor-runner";
import { logAudit } from "@/server/audit";

export async function getMonitorDevices() {
  const session = await requireAuth();
  requireSessionPermission(session, "monitoring:view");
  return db.select().from(monitorDevices).orderBy(monitorDevices.name);
}

export async function getMonitorDevice(id: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "monitoring:view");
  const [device] = await db
    .select()
    .from(monitorDevices)
    .where(eq(monitorDevices.id, id))
    .limit(1);
  return device ?? null;
}

export async function getDeviceChecks(deviceId: string, hours = 24) {
  const session = await requireAuth();
  requireSessionPermission(session, "monitoring:view");
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
  requireSessionPermission(session, "monitoring:view");

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
  requireSessionPermission(session, "monitoring:configure");
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
  requireSessionPermission(session, "monitoring:configure");
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
  requireSessionPermission(session, "monitoring:configure");
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
  requireSessionPermission(session, "monitoring:view");
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
  requireSessionPermission(session, "monitoring:view");
  const devices = await db.select().from(monitorDevices);
  return {
    total: devices.length,
    up: devices.filter((d) => d.lastStatus === "up").length,
    down: devices.filter((d) => d.lastStatus === "down").length,
    unknown: devices.filter((d) => d.lastStatus === "unknown" || !d.lastStatus).length,
  };
}

function normalizeTarget(url: string) {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export async function discoverUnmonitoredTargets() {
  const session = await requireAuth();
  requireSessionPermission(session, "monitoring:configure");

  const cards = await db
    .select({
      id: bookmarkCards.id,
      title: bookmarkCards.title,
      url: bookmarkCards.url,
    })
    .from(bookmarkCards)
    .where(and(isNull(bookmarkCards.archivedAt), eq(bookmarkCards.enabled, true)));

  const devices = await db.select({ target: monitorDevices.target }).from(monitorDevices);
  const monitored = new Set(devices.map((d) => normalizeTarget(d.target)));

  const seen = new Set<string>();
  const candidates: { id: string; name: string; target: string }[] = [];

  for (const card of cards) {
    if (!/^https?:\/\//i.test(card.url)) continue;
    const key = normalizeTarget(card.url);
    if (monitored.has(key) || seen.has(key)) continue;
    seen.add(key);
    candidates.push({ id: card.id, name: card.title, target: card.url });
  }

  return candidates.sort((a, b) => a.name.localeCompare(b.name));
}

export async function scanNetworkForDevices(input: { range: string }) {
  const session = await requireAuth();
  requireSessionPermission(session, "monitoring:configure");

  const range = input.range.trim();
  if (!range) throw new Error("Network range is required");

  const { scanNetworkRange } = await import("@/lib/network-scan");
  const discovered = await scanNetworkRange(range);

  const devices = await db.select({ target: monitorDevices.target }).from(monitorDevices);
  const monitored = new Set(
    devices.map((d) => {
      try {
        const host = d.target.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
        return host.toLowerCase();
      } catch {
        return d.target.toLowerCase();
      }
    })
  );

  return discovered
    .filter((host) => !monitored.has(host.ip))
    .map((host) => {
      const primaryPort = host.openPorts[0] ?? 80;
      const scheme = primaryPort === 443 ? "https" : "http";
      const target =
        primaryPort === 80 || primaryPort === 443
          ? `${scheme}://${host.ip}`
          : `${scheme}://${host.ip}:${primaryPort}`;
      const checkType =
        host.openPorts.includes(443) || host.openPorts.includes(80) ? "http" : "tcp";

      return {
        id: host.ip,
        name: `Host ${host.ip}`,
        target,
        ip: host.ip,
        openPorts: host.openPorts,
        suggestedCheckType: checkType as "http" | "ping" | "tcp",
        latencyMs: host.latencyMs,
      };
    });
}

export async function bulkCreateMonitorDevices(input: {
  targets: { name: string; target: string }[];
  checkType: "http" | "ping" | "tcp";
  intervalSec: number;
  timeoutMs: number;
  enabled?: boolean;
}) {
  const session = await requireAuth();
  requireSessionPermission(session, "monitoring:configure");

  const created = [];
  for (const target of input.targets) {
    const data = deviceSchema.parse({
      name: target.name,
      target: target.target,
      checkType: input.checkType,
      intervalSec: input.intervalSec,
      timeoutMs: input.timeoutMs,
      enabled: input.enabled ?? true,
    });
    const [device] = await db.insert(monitorDevices).values(data).returning();
    created.push(device);
  }

  revalidatePath("/monitoring");
  revalidatePath("/bookmarks");
  await logAudit({
    action: "monitoring.device.bulk_create",
    resource: "monitor_device",
    summary: `Bulk created ${created.length} monitor devices`,
    details: { count: created.length },
  });

  return created;
}
