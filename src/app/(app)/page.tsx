import { auth } from "@/lib/auth";
import { getAllBookmarkCards, getFavouriteCards } from "@/server/actions/bookmarks";
import { getDashboardStats } from "@/server/actions/users";
import { LandingPage } from "@/components/landing/LandingPage";

export default async function AppHomePage() {
  const session = await auth();

  const [favourites, stats, allBookmarks] = await Promise.all([
    getFavouriteCards(),
    getDashboardStats(),
    getAllBookmarkCards(),
  ]);

  return (
    <LandingPage
      userName={session?.user.name ?? "there"}
      favourites={favourites}
      allBookmarks={allBookmarks}
      downDevices={stats.downDevices}
      overdueTasks={stats.overdueTasks}
    />
  );
}
