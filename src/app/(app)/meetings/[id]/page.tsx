import { notFound } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { MeetingDetailView } from "@/components/meetings/MeetingDetailView";
import { getMeeting } from "@/server/actions/meetings";
import { getProjects } from "@/server/actions/tasks";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const [detail, projects] = await Promise.all([
    getMeeting(id).catch(() => null),
    getProjects(),
  ]);
  if (!detail) notFound();

  const canCreateProject =
    !!session?.user &&
    hasPermission(session.user.role, "tasks:edit", session.user.permissions);

  return (
    <Suspense>
      <MeetingDetailView
        meeting={detail.meeting}
        projectName={detail.projectName}
        projectKey={detail.projectKey}
        actionItems={detail.actionItems}
        messages={detail.messages}
        projects={projects}
        canCreateProject={canCreateProject}
      />
    </Suspense>
  );
}
