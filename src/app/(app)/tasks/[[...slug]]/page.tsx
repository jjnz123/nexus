import { getProjectBoard, getProjects, getTaskByKey } from "@/server/actions/tasks";
import { TasksPage } from "@/components/tasks/TasksPage";

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
  const projects = await getProjects();
  const taskKey = getTaskKeyFromSlug(resolvedParams.slug);
  const deepLinkedTask = taskKey ? await getTaskByKey(taskKey) : null;

  const initialProjectId = deepLinkedTask?.project.id ?? projects[0]?.id;
  const initialBoard = initialProjectId ? await getProjectBoard(initialProjectId) : null;

  return (
    <TasksPage
      projects={projects}
      initialBoard={initialBoard}
      initialTask={deepLinkedTask}
      initialTaskKey={taskKey}
    />
  );
}
