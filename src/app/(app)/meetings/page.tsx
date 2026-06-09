import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { MeetingsPage } from "@/components/meetings/MeetingsPage";
import { getMeetings } from "@/server/actions/meetings";
import { getProjects } from "@/server/actions/tasks";

export default async function MeetingsRoutePage() {
  const session = await auth();
  const [meetings, projects] = await Promise.all([getMeetings(), getProjects()]);
  const canCreateProject =
    !!session?.user &&
    hasPermission(session.user.role, "tasks:edit", session.user.permissions);

  return (
    <MeetingsPage
      initialMeetings={meetings}
      projects={projects}
      canCreateProject={canCreateProject}
    />
  );
}
