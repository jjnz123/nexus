import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { BookmarksPage } from "@/components/bookmarks/BookmarksPage";
import { getBookmarkTabs, getUserFavouriteCardIds } from "@/server/actions/bookmarks";
import { getSmartBookmarkSuggestions } from "@/server/actions/bookmark-phase2";
import { getBookmarkPreferences } from "@/server/actions/preferences";

export default async function BookmarksRoutePage() {
  const session = await auth();
  const userId = session?.user.id ?? "";

  const [tabs, prefs, favouriteIds, suggestions] = await Promise.all([
    getBookmarkTabs(),
    getBookmarkPreferences(),
    getUserFavouriteCardIds(),
    getSmartBookmarkSuggestions().catch(() => ({ frequent: [], stale: [] })),
  ]);

  const role = session?.user.role ?? "viewer";
  const permissions = session?.user.permissions ?? null;

  return (
    <BookmarksPage
      tabs={tabs}
      userId={userId}
      canEdit={hasPermission(role, "bookmarks:edit", permissions)}
      isAdmin={hasPermission(role, "admin:access", permissions)}
      canUseAi={hasPermission(role, "ai:use", permissions)}
      canConfigureMonitoring={hasPermission(role, "monitoring:configure", permissions)}
      canViewMonitoring={hasPermission(role, "monitoring:view", permissions)}
      favouriteIds={favouriteIds}
      initialSuggestions={suggestions}
      initialPrefs={{
        activeBookmarkTabId: prefs.activeBookmarkTabId,
        bookmarksLayoutMode:
          prefs.bookmarksLayoutMode === "list" ? "list" : "grid",
        bookmarksGlobalLayoutLocked: prefs.bookmarksGlobalLayoutLocked,
        bookmarksSortMode:
          prefs.bookmarksSortMode === "alphabetical" ||
          prefs.bookmarksSortMode === "most_used" ||
          prefs.bookmarksSortMode === "most_used_30d" ||
          prefs.bookmarksSortMode === "recently_used" ||
          prefs.bookmarksSortMode === "health"
            ? prefs.bookmarksSortMode
            : "custom",
      }}
    />
  );
}
