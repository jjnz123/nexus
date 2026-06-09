import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MeetingDetailView } from "@/components/meetings/MeetingDetailView";
import { getMeeting } from "@/server/actions/meetings";
import { getProjects } from "@/server/actions/tasks";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, projects] = await Promise.all([
    getMeeting(id).catch(() => null),
    getProjects(),
  ]);
  if (!detail) notFound();

  return (
    <Suspense>
      <MeetingDetailView
        meeting={detail.meeting}
        projectName={detail.projectName}
        projectKey={detail.projectKey}
        actionItems={detail.actionItems}
        messages={detail.messages}
        projects={projects}
      />
    </Suspense>
  );
}
