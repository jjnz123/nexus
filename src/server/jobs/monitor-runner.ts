import { exec } from "child_process";
import { promisify } from "util";
import { eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

const execAsync = promisify(exec);

export type MonitorDb = PostgresJsDatabase<typeof schema>;

async function pingCheck(
  target: string,
  timeoutMs: number
): Promise<{ status: "up" | "down"; latencyMs: number | null; error?: string }> {
  const start = Date.now();
  try {
    const host = target.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
    await execAsync(`ping -c 1 -W ${Math.ceil(timeoutMs / 1000)} ${host}`, {
      timeout: timeoutMs,
    });
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "down",
      latencyMs: null,
      error: err instanceof Error ? err.message : "Ping failed",
    };
  }
}

async function httpCheck(
  target: string,
  timeoutMs: number
): Promise<{ status: "up" | "down"; latencyMs: number | null; error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = target.startsWith("http") ? target : `http://${target}`;
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return {
      status: res.ok ? "up" : "down",
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      status: "down",
      latencyMs: null,
      error: err instanceof Error ? err.message : "HTTP check failed",
    };
  }
}

async function tcpCheck(
  target: string,
  timeoutMs: number
): Promise<{ status: "up" | "down"; latencyMs: number | null; error?: string }> {
  return httpCheck(target.startsWith("http") ? target : `http://${target}`, timeoutMs);
}

export async function checkDevice(
  device: schema.MonitorDevice
): Promise<{ status: "up" | "down"; latencyMs: number | null; error?: string }> {
  switch (device.checkType) {
    case "ping":
      return pingCheck(device.target, device.timeoutMs);
    case "http":
      return httpCheck(device.target, device.timeoutMs);
    case "tcp":
      return tcpCheck(device.target, device.timeoutMs);
    default:
      return { status: "down", latencyMs: null, error: "Unknown check type" };
  }
}

export async function runMonitorCycle(db: MonitorDb) {
  const devices = await db
    .select()
    .from(schema.monitorDevices)
    .where(eq(schema.monitorDevices.enabled, true));

  if (devices.length === 0) return;

  const deviceIds = devices.map((d) => d.id);
  const recentChecks = await db
    .select()
    .from(schema.monitorChecks)
    .where(inArray(schema.monitorChecks.deviceId, deviceIds))
    .orderBy(schema.monitorChecks.checkedAt);

  const lastCheckByDevice = new Map<string, Date>();
  for (const check of recentChecks) {
    lastCheckByDevice.set(check.deviceId, check.checkedAt);
  }

  const now = Date.now();

  for (const device of devices) {
    const lastCheck = lastCheckByDevice.get(device.id);
    if (lastCheck && now - lastCheck.getTime() < device.intervalSec * 1000) {
      continue;
    }

    const result = await checkDevice(device);
    await db.insert(schema.monitorChecks).values({
      deviceId: device.id,
      status: result.status,
      latencyMs: result.latencyMs,
      error: result.error,
    });

    if (device.lastStatus !== result.status) {
      await db
        .update(schema.monitorDevices)
        .set({ lastStatus: result.status })
        .where(eq(schema.monitorDevices.id, device.id));

      const admins = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, "admin"));

      for (const admin of admins) {
        await db.insert(schema.notifications).values({
          userId: admin.id,
          type: "monitor",
          title: `${device.name} is ${result.status}`,
          body: result.error ?? `Device ${device.name} status changed to ${result.status}`,
          link: `/monitoring/${device.id}`,
        });
      }
    } else {
      await db
        .update(schema.monitorDevices)
        .set({ lastStatus: result.status })
        .where(eq(schema.monitorDevices.id, device.id));
    }
  }
}

export async function forceCheckDevice(db: MonitorDb, deviceId: string) {
  const [device] = await db
    .select()
    .from(schema.monitorDevices)
    .where(eq(schema.monitorDevices.id, deviceId))
    .limit(1);

  if (!device) throw new Error("Device not found");

  const result = await checkDevice(device);
  const [check] = await db
    .insert(schema.monitorChecks)
    .values({
      deviceId: device.id,
      status: result.status,
      latencyMs: result.latencyMs,
      error: result.error,
    })
    .returning();

  await db
    .update(schema.monitorDevices)
    .set({ lastStatus: result.status })
    .where(eq(schema.monitorDevices.id, device.id));

  return check;
}
