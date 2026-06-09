import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getAllBookmarkCards, getFavouriteCards } from "@/server/actions/bookmarks";
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

  const [favourites, stats, allBookmarks, homeOrder] = await Promise.all([
    getFavouriteCards(),
    getDashboardStats(),
    getAllBookmarkCards(),
    getHomeFavouriteOrder(),
  ]);

  return (
    <LandingPage
      userName={session?.user.name ?? "there"}
      favourites={sortFavourites(favourites, homeOrder)}
      allBookmarks={allBookmarks}
      downDevices={canViewMonitoring ? stats.downDevices : 0}
      overdueTasks={canViewTasks ? stats.overdueTasks : 0}
      canUseAi={canUseAi}
      canViewMonitoring={canViewMonitoring}
      canViewTasks={canViewTasks}
      canViewBookmarks={canViewBookmarks}
    />
  );
}
