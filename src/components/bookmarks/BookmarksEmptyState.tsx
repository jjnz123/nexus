"use client";

import { Bookmark, FileUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type BookmarksEmptyStateProps = {
  variant: "no-tabs" | "no-groups" | "no-cards";
  canEdit?: boolean;
  onAddTab?: () => void;
  onAddGroup?: () => void;
  onAddCard?: () => void;
  onImport?: () => void;
};

export function BookmarksEmptyState({
  variant,
  canEdit = true,
  onAddTab,
  onAddGroup,
  onAddCard,
  onImport,
}: BookmarksEmptyStateProps) {
  const copy =
    variant === "no-tabs"
      ? {
          title: "No bookmark tabs yet",
          body: "Create your first tab to organize links by team, project, or workflow.",
        }
      : variant === "no-groups"
        ? {
            title: "This tab is empty",
            body: "Add a group to start collecting bookmarks in this tab.",
          }
        : {
            title: "Add your first card",
            body: "Create a bookmark card or import from a JSON export.",
          };

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-950/50 px-6 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Bookmark className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-medium text-zinc-100">{copy.title}</h3>
      <p className="mt-2 max-w-md text-sm text-zinc-400">{copy.body}</p>
      {canEdit ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {variant === "no-tabs" && onAddTab ? (
            <Button onClick={onAddTab}>
              <Plus className="mr-2 h-4 w-4" />
              Create tab
            </Button>
          ) : null}
          {variant === "no-groups" && onAddGroup ? (
            <Button onClick={onAddGroup}>
              <Plus className="mr-2 h-4 w-4" />
              Add group
            </Button>
          ) : null}
          {variant === "no-cards" && onAddCard ? (
            <Button onClick={onAddCard}>
              <Plus className="mr-2 h-4 w-4" />
              Add card
            </Button>
          ) : null}
          {onImport ? (
            <Button variant="outline" onClick={onImport}>
              <FileUp className="mr-2 h-4 w-4" />
              Import JSON
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
