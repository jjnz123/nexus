import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getAllBookmarkCards, getFavouriteCards } from "@/server/actions/bookmarks";
import { getSmartBookmarkSuggestions } from "@/server/actions/bookmark-phase2";
import { getHomeFavouriteOrder } from "@/server/actions/preferences";
import { getDashboardStats } from "@/server/actions/users";
import { LandingPage } from "@/components/landing/LandingPage";
import type { BookmarkCard, BookmarkGroup, BookmarkTab } from "@/lib/db/schema";

type BookmarkItem = {
  card: BookmarkCard;
  group: BookmarkGroup;
  tab: BookmarkTab;
};

function sortFavourites(items: BookmarkItem[], order: string[]) {
  const orderMap = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const ai = orderMap.get(a.card.id);
    const bi = orderMap.get(b.card.id);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.card.title.localeCompare(b.card.title);
  });
}

export default async function AppHomePage() {
  const session = await auth();
  const permissions = session?.user.permissions ?? null;
  const role = session?.user.role ?? "viewer";

  const canUseAi = hasPermission(role, "ai:use", permissions);
  const canViewMonitoring = hasPermission(role, "monitoring:view", permissions);
  const canViewTasks = hasPermission(role, "tasks:view", permissions);
  const canViewBookmarks = hasPermission(role, "bookmarks:view", permissions);

  const [stats, homeOrder] = await Promise.all([
    getDashboardStats(),
    canViewBookmarks ? getHomeFavouriteOrder() : Promise.resolve([]),
  ]);

  let favourites: BookmarkItem[] = [];
  let allBookmarks: BookmarkItem[] = [];
  let suggestions: { frequent: BookmarkItem[]; stale: BookmarkItem[] } = {
    frequent: [],
    stale: [],
  };

  if (canViewBookmarks) {
    [favourites, allBookmarks, suggestions] = await Promise.all([
      getFavouriteCards(),
      getAllBookmarkCards(),
      getSmartBookmarkSuggestions().catch(() => ({ frequent: [], stale: [] })),
    ]);
  }

  return (
    <LandingPage
      userName={session?.user.name ?? "there"}
      favourites={sortFavourites(favourites, homeOrder)}
      allBookmarks={allBookmarks}
      smartSuggestions={suggestions}
      downDevices={canViewMonitoring ? stats.downDevices : 0}
      overdueTasks={canViewTasks ? stats.overdueTasks : 0}
      canUseAi={canUseAi}
      canViewMonitoring={canViewMonitoring}
      canViewTasks={canViewTasks}
      canViewBookmarks={canViewBookmarks}
    />
  );
}
