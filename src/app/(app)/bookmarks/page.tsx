import { BookmarksPage } from "@/components/bookmarks/BookmarksPage";
import { getBookmarkTabs } from "@/server/actions/bookmarks";

export default async function BookmarksRoutePage() {
  const tabs = await getBookmarkTabs();

  return <BookmarksPage tabs={tabs} />;
}
