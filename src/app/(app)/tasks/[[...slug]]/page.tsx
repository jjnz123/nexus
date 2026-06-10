import { getProjectBoard, getProjects, getTaskByKey } from "@/server/actions/tasks";
import { getBookmarkPreferences } from "@/server/actions/preferences";
import { TasksPage } from "@/components/tasks/TasksPage";
import { parseTasksWorkspace } from "@/lib/preferences/workspace";

function getTaskKeyFromSlug(slug: string[] | undefined) {
  if (!slug || slug.length === 0) return null;
  const found = slug.find((segment) => /^[A-Z][A-Z0-9]*-\d+$/i.test(segment));
  return found ? found.toUpperCase() : null;
}

export default async function TasksRoutePage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const resolvedParams = await params;
  const [projects, prefs] = await Promise.all([getProjects(), getBookmarkPreferences()]);
  const tasksWorkspace = parseTasksWorkspace(prefs.tasksWorkspace);
  const taskKey = getTaskKeyFromSlug(resolvedParams.slug);
  const deepLinkedTask = taskKey ? await getTaskByKey(taskKey) : null;

  const savedProjectId =
    prefs.activeKanbanProjectId &&
    projects.some((project) => project.id === prefs.activeKanbanProjectId)
      ? prefs.activeKanbanProjectId
      : null;

  const initialProjectId = deepLinkedTask?.project.id ?? savedProjectId ?? projects[0]?.id;
  const initialBoard = initialProjectId ? await getProjectBoard(initialProjectId) : null;

  return (
    <TasksPage
      projects={projects}
      initialBoard={initialBoard}
      initialTask={deepLinkedTask}
      initialTaskKey={taskKey}
      tasksWorkspace={tasksWorkspace}
    />
  );
}
