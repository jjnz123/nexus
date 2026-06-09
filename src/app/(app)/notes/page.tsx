import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { getBookmarkPreferences } from "@/server/actions/preferences";
import { getUserNotes } from "@/server/actions/notes";

export default async function NotesPage() {
  const [notes, prefs] = await Promise.all([getUserNotes(), getBookmarkPreferences()]);

  const workspace = prefs.notesWorkspace ?? {
    openTabIds: [],
    activeTabId: null,
    previewVisible: true,
    explorerCollapsed: false,
  };

  return <NotesWorkspace initialNotes={notes} initialWorkspace={workspace} />;
}
