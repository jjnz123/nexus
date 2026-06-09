import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { BookmarksPage } from "@/components/bookmarks/BookmarksPage";
import { getBookmarkTabs, getUserFavouriteCardIds } from "@/server/actions/bookmarks";
import { getBookmarkPreferences } from "@/server/actions/preferences";

export default async function BookmarksRoutePage() {
  const session = await auth();
  const [tabs, prefs, favouriteIds] = await Promise.all([
    getBookmarkTabs(),
    getBookmarkPreferences(),
    getUserFavouriteCardIds(),
  ]);

  const role = session?.user.role ?? "viewer";
  const permissions = session?.user.permissions ?? null;

  return (
    <BookmarksPage
      tabs={tabs}
      canEdit={hasPermission(role, "bookmarks:edit", permissions)}
      favouriteIds={favouriteIds}
      initialPrefs={{
        activeBookmarkTabId: prefs.activeBookmarkTabId,
        bookmarksLayoutMode:
          prefs.bookmarksLayoutMode === "list" ? "list" : "grid",
        bookmarksGlobalLayoutLocked: prefs.bookmarksGlobalLayoutLocked,
      }}
    />
  );
}
