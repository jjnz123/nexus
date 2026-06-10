"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getUserProjectMemberships, setUserProjectMemberships } from "@/server/actions/project-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type ProjectRow = { id: string; key: string; name: string };

type MembershipState = Record<
  string,
  {
    canView: boolean;
    canEdit: boolean;
  }
>;

export function UserProjectAccessPanel({
  userId,
  enabled,
}: {
  userId: string | null;
  enabled: boolean;
}) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipState>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!userId || !enabled) return;
    startTransition(async () => {
      const data = await getUserProjectMemberships(userId);
      setProjects(data.projects);
      const next: MembershipState = {};
      for (const row of data.memberships) {
        next[row.projectId] = { canView: row.canView, canEdit: row.canEdit };
      }
      setMemberships(next);
    });
  }, [userId, enabled]);

  if (!enabled || !userId) {
    return (
      <p className="text-sm text-muted-foreground">
        Save the user first, then assign shared projects. By default users have no project access.
      </p>
    );
  }

  if (!projects.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No projects exist yet. Create projects in Tasks.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Share specific projects with this user. They can only see project data in apps they have
        permission to use.
      </p>
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
        {projects.map((project) => {
          const access = memberships[project.id] ?? { canView: false, canEdit: false };
          return (
            <div
              key={project.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border"
            >
              <div>
                <p className="text-sm font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">{project.key}</p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={access.canView}
                    onCheckedChange={(checked) =>
                      setMemberships((prev) => ({
                        ...prev,
                        [project.id]: {
                          canView: checked,
                          canEdit: checked ? (prev[project.id]?.canEdit ?? false) : false,
                        },
                      }))
                    }
                  />
                  View
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={access.canEdit}
                    disabled={!access.canView}
                    onCheckedChange={(checked) =>
                      setMemberships((prev) => ({
                        ...prev,
                        [project.id]: {
                          canView: true,
                          canEdit: checked,
                        },
                      }))
                    }
                  />
                  Edit
                </label>
                {access.canView ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Shared
                  </Badge>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              try {
                await setUserProjectMemberships(
                  userId,
                  Object.entries(memberships)
                    .filter(([, value]) => value.canView || value.canEdit)
                    .map(([projectId, value]) => ({
                      projectId,
                      canView: value.canView,
                      canEdit: value.canEdit,
                    }))
                );
                toast.success("Project access saved");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to save project access");
              }
            });
          }}
        >
          Save project access
        </Button>
      </div>
    </div>
  );
}
