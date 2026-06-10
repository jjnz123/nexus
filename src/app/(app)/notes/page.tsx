import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { getBookmarkPreferences } from "@/server/actions/preferences";
import { getUserNotes } from "@/server/actions/notes";
import { getProjects } from "@/server/actions/tasks";

export default async function NotesPage() {
  const [notes, prefs, projects] = await Promise.all([
    getUserNotes(),
    getBookmarkPreferences(),
    getProjects(),
  ]);

  const workspace = prefs.notesWorkspace ?? {
    openTabIds: [],
    activeTabId: null,
    activeProjectId: null,
    previewVisible: true,
    explorerCollapsed: false,
  };

  return (
    <NotesWorkspace
      initialNotes={notes}
      initialWorkspace={workspace}
      projects={projects.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
      }))}
    />
  );
}
