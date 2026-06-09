"use client";

import { formatDistanceToNow } from "date-fns";
import { FolderPlus, MessageSquarePlus, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AiConversation, AiProject } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export function ChatSidebar({
  projects,
  conversations,
  activeProjectId,
  activeConversationId,
  search,
  onSearchChange,
  onSelectProject,
  onSelectConversation,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
}: {
  projects: AiProject[];
  conversations: AiConversation[];
  activeProjectId: string | null;
  activeConversationId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onSelectConversation: (conversationId: string) => void;
  onCreateProject: () => void;
  onRenameProject: (project: AiProject) => void;
  onDeleteProject: (project: AiProject) => void;
  onCreateConversation: () => void;
  onRenameConversation: (conversation: AiConversation) => void;
  onDeleteConversation: (conversation: AiConversation) => void;
}) {
  const query = search.trim().toLowerCase();

  const filteredConversations = conversations.filter((c) => {
    const inProject =
      activeProjectId === null ? c.projectId === null : c.projectId === activeProjectId;
    if (!inProject) return false;
    if (!query) return true;
    return (
      c.title.toLowerCase().includes(query) ||
      (c.lastMessagePreview ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-card/40">
      <div className="space-y-3 border-b p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Projects</h2>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCreateProject}>
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => onSelectProject(null)}
            className={cn(
              "w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-accent",
              activeProjectId === null && "bg-accent font-medium"
            )}
          >
            General
          </button>
          {projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                "group flex items-center gap-1 rounded-md pr-1",
                activeProjectId === project.id && "bg-accent"
              )}
            >
              <button
                type="button"
                onClick={() => onSelectProject(project.id)}
                className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm hover:opacity-90"
              >
                {project.name}
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                onClick={() => onRenameProject(project)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                onClick={() => onDeleteProject(project)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Conversations</h2>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCreateConversation}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search…"
            className="h-9 pl-8"
          />
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group rounded-lg border border-transparent p-2 transition hover:bg-accent/60",
                  activeConversationId === conversation.id && "border-primary/30 bg-accent"
                )}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <p className="truncate text-sm font-medium">{conversation.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {conversation.lastMessagePreview || "No messages yet"}
                  </p>
                  {conversation.lastMessageAt ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(conversation.lastMessageAt), {
                        addSuffix: true,
                      })}
                    </p>
                  ) : null}
                </button>
                <div className="mt-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => onRenameConversation(conversation)}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive"
                    onClick={() => onDeleteConversation(conversation)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
