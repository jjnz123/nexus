import type { BookmarkCard } from "@/lib/db/schema";
import type { BookmarkSortMode } from "@/lib/validators/bookmarks";

type ClickStats = Record<
  string,
  { total: number; recent30d: number; lastAt: Date | null }
>;

type HealthMap = Record<
  string,
  { status: "up" | "down" | "unknown" | "degraded"; checkedAt: Date | null }
>;

export function sortBookmarkCards(
  cards: BookmarkCard[],
  mode: BookmarkSortMode,
  clickStats: ClickStats,
  healthMap: HealthMap
): BookmarkCard[] {
  const list = [...cards];

  switch (mode) {
    case "alphabetical":
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case "most_used":
      return list.sort(
        (a, b) => (clickStats[b.id]?.total ?? b.clickCount) - (clickStats[a.id]?.total ?? a.clickCount)
      );
    case "most_used_30d":
      return list.sort(
        (a, b) => (clickStats[b.id]?.recent30d ?? 0) - (clickStats[a.id]?.recent30d ?? 0)
      );
    case "recently_used":
      return list.sort((a, b) => {
        const aTime = clickStats[a.id]?.lastAt ?? a.lastClickedAt;
        const bTime = clickStats[b.id]?.lastAt ?? b.lastClickedAt;
        return (bTime?.getTime() ?? 0) - (aTime?.getTime() ?? 0);
      });
    case "health":
      return list.sort((a, b) => {
        const rank = (id: string) => {
          const s = healthMap[id]?.status;
          if (s === "down") return 0;
          if (s === "degraded") return 1;
          if (s === "unknown") return 2;
          if (s === "up") return 3;
          return 4;
        };
        return rank(a.id) - rank(b.id);
      });
    case "custom":
    default:
      return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

export type BookmarkFilterChip =
  | "all"
  | "recently_used"
  | "monitored_healthy"
  | "disabled"
  | string;

export function filterBookmarkCards(
  cards: BookmarkCard[],
  filter: BookmarkFilterChip,
  clickStats: ClickStats,
  healthMap: HealthMap
): BookmarkCard[] {
  if (filter === "all") return cards;

  if (filter === "recently_used") {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return cards.filter((c) => {
      const last = clickStats[c.id]?.lastAt ?? c.lastClickedAt;
      return last && last.getTime() >= weekAgo;
    });
  }

  if (filter === "monitored_healthy") {
    return cards.filter(
      (c) => c.healthMonitoringEnabled && healthMap[c.id]?.status === "up"
    );
  }

  if (filter === "disabled") {
    return cards.filter((c) => !c.enabled);
  }

  if (filter.startsWith("tag:")) {
    const tag = filter.slice(4);
    return cards.filter((c) => (c.tags ?? []).includes(tag));
  }

  return cards;
}
