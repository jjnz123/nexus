import { MeetingsPage } from "@/components/meetings/MeetingsPage";
import { getMeetings } from "@/server/actions/meetings";
import { getProjects } from "@/server/actions/tasks";

export default async function MeetingsRoutePage() {
  const [meetings, projects] = await Promise.all([getMeetings(), getProjects()]);
  return <MeetingsPage initialMeetings={meetings} projects={projects} />;
}
