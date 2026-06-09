import { ArchivedMeetingsPage } from "@/components/meetings/ArchivedMeetingsPage";
import { getArchivedMeetings } from "@/server/actions/meetings";
import { getProjects } from "@/server/actions/tasks";

export default async function ArchivedMeetingsRoutePage() {
  const [meetings, projects] = await Promise.all([getArchivedMeetings(), getProjects()]);
  return <ArchivedMeetingsPage initialMeetings={meetings} projects={projects} />;
}
