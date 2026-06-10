"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CheckSquare, GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateBookmarkPreferences } from "@/server/actions/preferences";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HomeBoardLink, HomeDashboardConfig } from "@/lib/preferences/workspace";

type ProjectOption = { id: string; key: string; name: string };

export function BoardLinksSection({
  projects,
  boardLinks,
  editMode,
  dashboard,
  onChange,
}: {
  projects: ProjectOption[];
  boardLinks: HomeBoardLink[];
  editMode: boolean;
  dashboard: HomeDashboardConfig;
  onChange: (next: HomeDashboardConfig) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const persistLinks = (links: HomeBoardLink[]) => {
    startTransition(async () => {
      try {
        const nextDashboard = { ...dashboard, boardLinks: links };
        onChange(nextDashboard);
        await updateBookmarkPreferences({ homeDashboard: nextDashboard });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save board links");
      }
    });
  };

  const addLink = (projectId: string) => {
    if (boardLinks.some((link) => link.projectId === projectId)) {
      toast.message("That project is already on your dashboard");
      return;
    }
    persistLinks([...boardLinks, { id: crypto.randomUUID(), projectId, label: null }]);
  };

  const removeLink = (linkId: string) => {
    persistLinks(boardLinks.filter((link) => link.id !== linkId));
  };

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const availableProjects = projects.filter(
    (project) => !boardLinks.some((link) => link.projectId === project.id)
  );

  return (
    <div className="space-y-3">
      {boardLinks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {editMode
            ? "Add a project board link below."
            : "No board links yet. Use Edit dashboard to add project shortcuts."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {boardLinks.map((link) => {
            const project = projectById.get(link.projectId);
            if (!project) return null;
            const label = link.label?.trim() || `${project.key} Board`;

            return (
              <div
                key={link.id}
                className="group relative rounded-xl border bg-card/60 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                {editMode ? (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      disabled={isPending}
                      onClick={() => removeLink(link.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                <Link
                  href="/tasks"
                  onClick={() => {
                    void updateBookmarkPreferences({ activeKanbanProjectId: project.id });
                  }}
                  className="block space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CheckSquare className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{label}</p>
                      <p className="truncate text-xs text-muted-foreground">{project.name}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Open kanban board →</p>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {editMode && availableProjects.length > 0 ? (
        <Select onValueChange={addLink}>
          <SelectTrigger className="sm:max-w-xs">
            <SelectValue placeholder="Add board link…" />
          </SelectTrigger>
          <SelectContent>
            {availableProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.key} — {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
