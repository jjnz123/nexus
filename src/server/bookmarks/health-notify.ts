import { eq, and, inArray } from "drizzle-orm";
import type { MonitorDb } from "@/server/jobs/monitor-runner";
import { bookmarkCards, userBookmarkFavourites, notifications } from "@/lib/db/schema";

export async function notifyUsersOfBookmarkHealthChange(
  db: MonitorDb,
  deviceId: string,
  status: "up" | "down",
  deviceName: string
) {
  const cards = await db
    .select({ id: bookmarkCards.id })
    .from(bookmarkCards)
    .where(
      and(
        eq(bookmarkCards.linkedDeviceId, deviceId),
        eq(bookmarkCards.healthMonitoringEnabled, true)
      )
    );

  if (cards.length === 0) return;

  const cardIds = cards.map((c) => c.id);
  const favourites = await db
    .select({ userId: userBookmarkFavourites.userId })
    .from(userBookmarkFavourites)
    .where(inArray(userBookmarkFavourites.cardId, cardIds));

  const userIds = [...new Set(favourites.map((f) => f.userId))];

  for (const userId of userIds) {
    await db.insert(notifications).values({
      userId,
      type: "monitor",
      title: `${deviceName} is ${status}`,
      body: `A bookmark you monitor changed status to ${status}.`,
      link: `/monitoring/${deviceId}`,
    });
  }
}
