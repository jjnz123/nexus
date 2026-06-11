"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getProjectMemberAccess,
  setProjectMemberAccess,
} from "@/server/actions/project-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type UserRow = { id: string; name: string; email: string; role: string };

type MembershipState = Record<
  string,
  {
    canView: boolean;
    canEdit: boolean;
  }
>;

export function TasksProjectAccessSettings({ projectId }: { projectId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipState>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const data = await getProjectMemberAccess(projectId);
        setUsers(data.users);
        const next: MembershipState = {};
        for (const row of data.memberships) {
          next[row.userId] = { canView: row.canView, canEdit: row.canEdit };
        }
        setMemberships(next);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to load project access");
      }
    });
  }, [projectId]);

  if (!users.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No active users found. Add users in Admin first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Control which users can view or edit this project. Admins always have full access.
      </p>
      <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border p-3">
        {users.map((user) => {
          const access = memberships[user.id] ?? { canView: false, canEdit: false };
          return (
            <div
              key={user.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border"
            >
              <div>
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">
                  {user.email} · {user.role}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={access.canView}
                    onCheckedChange={(checked) =>
                      setMemberships((prev) => ({
                        ...prev,
                        [user.id]: {
                          canView: checked,
                          canEdit: checked ? (prev[user.id]?.canEdit ?? false) : false,
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
                        [user.id]: {
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
                    Member
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
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              try {
                await setProjectMemberAccess(
                  projectId,
                  Object.entries(memberships)
                    .filter(([, value]) => value.canView || value.canEdit)
                    .map(([userId, value]) => ({
                      userId,
                      canView: value.canView,
                      canEdit: value.canEdit,
                    }))
                );
                toast.success("Project access saved");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Failed to save project access"
                );
              }
            });
          }}
        >
          Save access
        </Button>
      </div>
    </div>
  );
}
