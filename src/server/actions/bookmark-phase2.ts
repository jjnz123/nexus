"use server";

import { z } from "zod";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookmarkCards,
  bookmarkGroups,
  bookmarkTabs,
  bookmarkLaunches,
  monitorDevices,
  monitorChecks,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { hasPermission, requireSessionPermission } from "@/lib/permissions";
import { enrichUrl } from "@/server/bookmarks/url-enrichment";
import { getAiModel } from "@/server/settings";
import { createMonitorDevice } from "@/server/actions/monitoring";
import { LUCIDE_ICON_NAMES } from "@/lib/bookmarks/icons";

const enrichSchema = z.object({ url: z.string().url().or(z.string().min(4)) });

const aiSuggestSchema = z.object({
  url: z.string().min(4),
  tabName: z.string().optional(),
  groupNames: z.array(z.string()).optional(),
});

export async function enrichBookmarkFromUrl(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  const { url } = enrichSchema.parse(input);

  try {
    const result = await enrichUrl(url.startsWith("http") ? url : `https://${url}`);
    return { success: true as const, ...result };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Enrichment failed",
    };
  }
}

export async function suggestBookmarkWithAi(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");
  if (!hasPermission(session.user.role, "ai:use", session.user.permissions)) {
    throw new Error("AI access required");
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("AI not configured");

  const data = aiSuggestSchema.parse(input);
  const model = await getAiModel();
  const groups = data.groupNames?.length ? data.groupNames.join(", ") : "General";

  const prompt = `Suggest bookmark metadata for this internal tool URL.
URL: ${data.url}
Tab context: ${data.tabName ?? "Unknown"}
Existing groups: ${groups}

Respond with ONLY valid JSON:
{"title":"...","description":"...","icon":"LucideIconName","tags":["tag1","tag2"],"suggestedGroup":"..."}

Use a Lucide icon name from common set like: ${LUCIDE_ICON_NAMES.slice(0, 15).join(", ")}`;

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error("AI suggestion failed");
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Invalid AI response");

  const parsed = JSON.parse(match[0]) as {
    title?: string;
    description?: string;
    icon?: string;
    tags?: string[];
    suggestedGroup?: string;
  };

  return {
    title: parsed.title ?? "",
    description: parsed.description ?? "",
    icon: LUCIDE_ICON_NAMES.includes(parsed.icon ?? "") ? parsed.icon : "Link2",
    tags: (parsed.tags ?? []).slice(0, 5),
    suggestedGroup: parsed.suggestedGroup ?? "",
  };
}

export async function getCardHealthMap(cardIds: string[]) {
  if (cardIds.length === 0) return {};

  const session = await requireAuth();
  requireSessionPermission(session, "monitoring:view");

  const cards = await db
    .select()
    .from(bookmarkCards)
    .where(
      and(
        inArray(bookmarkCards.id, cardIds),
        eq(bookmarkCards.healthMonitoringEnabled, true)
      )
    );

  const deviceIds = cards
    .map((c) => c.linkedDeviceId)
    .filter((id): id is string => Boolean(id));

  if (deviceIds.length === 0) return {};

  const devices = await db
    .select()
    .from(monitorDevices)
    .where(inArray(monitorDevices.id, deviceIds));

  const deviceMap = new Map(devices.map((d) => [d.id, d]));

  const checks = await db
    .select()
    .from(monitorChecks)
    .where(inArray(monitorChecks.deviceId, deviceIds))
    .orderBy(desc(monitorChecks.checkedAt));

  const lastCheckByDevice = new Map<string, (typeof checks)[0]>();
  for (const check of checks) {
    if (!lastCheckByDevice.has(check.deviceId)) {
      lastCheckByDevice.set(check.deviceId, check);
    }
  }

  const result: Record<
    string,
    {
      status: "up" | "down" | "unknown" | "degraded";
      checkedAt: Date | null;
      deviceId: string;
      deviceName: string;
    }
  > = {};

  for (const card of cards) {
    if (!card.linkedDeviceId) continue;
    const device = deviceMap.get(card.linkedDeviceId);
    const check = lastCheckByDevice.get(card.linkedDeviceId);
    const status =
      check?.status === "up" && check.latencyMs != null && check.latencyMs > 2000
        ? "degraded"
        : (check?.status ?? device?.lastStatus ?? "unknown");

    result[card.id] = {
      status: status as "up" | "down" | "unknown" | "degraded",
      checkedAt: check?.checkedAt ?? null,
      deviceId: card.linkedDeviceId,
      deviceName: device?.name ?? "Monitor",
    };
  }

  return result;
}

export async function enableCardHealthMonitoring(cardId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "monitoring:configure");

  const [card] = await db
    .select()
    .from(bookmarkCards)
    .where(eq(bookmarkCards.id, cardId))
    .limit(1);
  if (!card) throw new Error("Card not found");

  let deviceId = card.linkedDeviceId;

  if (!deviceId) {
    const device = await createMonitorDevice({
      name: card.title,
      target: card.url,
      checkType: "http",
      intervalSec: 60,
      timeoutMs: 5000,
      enabled: true,
    });
    deviceId = device.id;
  }

  const [updated] = await db
    .update(bookmarkCards)
    .set({ healthMonitoringEnabled: true, linkedDeviceId: deviceId })
    .where(eq(bookmarkCards.id, cardId))
    .returning();

  return updated;
}

export async function disableCardHealthMonitoring(cardId: string) {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:edit");

  const [updated] = await db
    .update(bookmarkCards)
    .set({ healthMonitoringEnabled: false })
    .where(eq(bookmarkCards.id, cardId))
    .returning();

  return updated;
}

export async function bulkEnableHealthMonitoring(cardIds: string[]) {
  const session = await requireAuth();
  requireSessionPermission(session, "monitoring:configure");

  const results = [];
  for (const cardId of cardIds) {
    results.push(await enableCardHealthMonitoring(cardId));
  }
  return results;
}

export async function getSmartBookmarkSuggestions() {
  const session = await requireAuth();
  requireSessionPermission(session, "bookmarks:view");

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const topRecent = await db
    .select({
      cardId: bookmarkLaunches.cardId,
      count: sql<number>`count(*)::int`,
    })
    .from(bookmarkLaunches)
    .where(
      and(
        eq(bookmarkLaunches.userId, session.user.id),
        gte(bookmarkLaunches.launchedAt, since7d)
      )
    )
    .groupBy(bookmarkLaunches.cardId)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  const topIds = topRecent.map((r) => r.cardId).filter((id): id is string => Boolean(id));

  let frequent: Awaited<ReturnType<typeof fetchCardItems>> = [];
  if (topIds.length) {
    frequent = await fetchCardItems(topIds);
  }

  const staleLaunches = await db
    .select({
      cardId: bookmarkLaunches.cardId,
      lastAt: sql<Date>`max(${bookmarkLaunches.launchedAt})`,
    })
    .from(bookmarkLaunches)
    .where(eq(bookmarkLaunches.userId, session.user.id))
    .groupBy(bookmarkLaunches.cardId)
    .having(sql`max(${bookmarkLaunches.launchedAt}) < ${since30d}`);

  const staleIds = staleLaunches
    .map((r) => r.cardId)
    .filter((id): id is string => Boolean(id))
    .slice(0, 5);

  const staleItems = staleIds.length ? await fetchCardItems(staleIds) : [];

  return { frequent, stale: staleItems };
}

async function fetchCardItems(cardIds: string[]) {
  if (!cardIds.length) return [];
  return db
    .select({
      card: bookmarkCards,
      group: bookmarkGroups,
      tab: bookmarkTabs,
    })
    .from(bookmarkCards)
    .innerJoin(bookmarkGroups, eq(bookmarkCards.groupId, bookmarkGroups.id))
    .innerJoin(bookmarkTabs, eq(bookmarkGroups.tabId, bookmarkTabs.id))
    .where(inArray(bookmarkCards.id, cardIds));
}
