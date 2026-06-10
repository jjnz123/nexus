"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Folder,
  FolderOpen,
  LayoutGrid,
  MessageSquare,
  MessageSquarePlus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CollapsibleSideRail,
  SIDE_RAIL_ICON_WIDTH,
  SideRailLabel,
} from "@/components/ui/collapsible-side-rail";
import type { AiConversation, PortalProjectSummary } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

function SidebarRow({
  icon: Icon,
  label,
  active,
  showLabels,
  onClick,
  title,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  showLabels: boolean;
  onClick?: () => void;
  title?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group flex w-full items-center rounded-md",
        active && "bg-accent",
        showLabels ? "pr-1" : "justify-center"
      )}
    >
      <button
        type="button"
        onClick={onClick}
        title={showLabels ? title : label}
        className={cn(
          "flex min-w-0 flex-1 items-center rounded-md text-left text-sm transition hover:opacity-90",
          showLabels ? "h-9" : "h-9 w-full justify-center"
        )}
      >
        <span
          className="flex shrink-0 items-center justify-center"
          style={{ width: SIDE_RAIL_ICON_WIDTH - (showLabels ? 8 : 0) }}
        >
          <Icon className="h-4 w-4 shrink-0" />
        </span>
        <SideRailLabel show={showLabels}>{label}</SideRailLabel>
      </button>
      {showLabels && actions ? (
        <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function ChatSidebar({
  projects,
  conversations,
  activeProjectId,
  activeConversationId,
  search,
  collapsed,
  onCollapsedChange,
  onSearchChange,
  onSelectProject,
  onSelectConversation,
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
  onOpenFiles,
}: {
  projects: PortalProjectSummary[];
  conversations: AiConversation[];
  activeProjectId: string | null;
  activeConversationId: string | null;
  search: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSearchChange: (value: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => void;
  onRenameConversation: (conversation: AiConversation) => void;
  onDeleteConversation: (conversation: AiConversation) => void;
  onOpenFiles: () => void;
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
    <CollapsibleSideRail
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      compactWidth={SIDE_RAIL_ICON_WIDTH}
      expandedWidth={288}
      elevatedOnHover
      className="!flex h-full flex-col md:!flex"
      headerIcon={<MessageSquare className="h-4 w-4 text-primary" />}
      headerLabel="Workspace"
    >
      {({ showLabels: railLabels }) => {
        const labelsVisible = railLabels;
        return (
          <>
            <div className="flex shrink-0 items-center border-b">
              <div
                className="flex shrink-0 items-center justify-center py-2"
                style={{ width: SIDE_RAIL_ICON_WIDTH }}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={onOpenFiles}
                  title="Files"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-center justify-end overflow-hidden pr-2 transition-[max-width,opacity] duration-200",
                  labelsVisible ? "max-w-[200px] opacity-100" : "max-w-0 opacity-0"
                )}
              >
                <Button size="sm" variant="ghost" className="h-8 gap-1 px-2" onClick={onOpenFiles}>
                  <FolderOpen className="h-4 w-4" />
                  Files
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <div className={cn("shrink-0 border-b", labelsVisible ? "space-y-3 p-3" : "py-2")}>
                {labelsVisible ? (
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Projects
                    </h3>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Same projects as Tasks and Notes. Manage them in Tasks.
                    </p>
                  </div>
                ) : null}

                <div className={cn("space-y-1", !labelsVisible && "px-1")}>
                  <SidebarRow
                    icon={LayoutGrid}
                    label="General"
                    active={activeProjectId === null}
                    showLabels={labelsVisible}
                    onClick={() => onSelectProject(null)}
                  />
                  {projects.map((project) => (
                    <SidebarRow
                      key={project.id}
                      icon={Folder}
                      label={project.name}
                      title={`${project.key} — ${project.name}`}
                      active={activeProjectId === project.id}
                      showLabels={labelsVisible}
                      onClick={() => onSelectProject(project.id)}
                    />
                  ))}
                </div>
              </div>

              <div className={cn("flex shrink-0 flex-col", labelsVisible ? "p-3" : "py-2")}>
                {labelsVisible ? (
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Conversations
                    </h3>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={onCreateConversation}
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-center pb-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={onCreateConversation}
                      title="New conversation"
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {labelsVisible ? (
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder="Search…"
                      className="h-9 pl-8"
                    />
                  </div>
                ) : null}

                <div className={cn("min-h-0 flex-1 space-y-1", !labelsVisible && "px-1")}>
                  {filteredConversations.length === 0 ? (
                    labelsVisible ? (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                        No conversations yet
                      </p>
                    ) : null
                  ) : labelsVisible ? (
                    filteredConversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={cn(
                          "group rounded-lg border border-transparent p-2 transition hover:bg-accent/60",
                          activeConversationId === conversation.id &&
                            "border-primary/30 bg-accent"
                        )}
                      >
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 text-left"
                          onClick={() => onSelectConversation(conversation.id)}
                        >
                          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1">
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
                          </span>
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
                  ) : (
                    filteredConversations.slice(0, 12).map((conversation) => (
                      <SidebarRow
                        key={conversation.id}
                        icon={MessageSquare}
                        label={conversation.title}
                        active={activeConversationId === conversation.id}
                        showLabels={false}
                        onClick={() => onSelectConversation(conversation.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        );
      }}
    </CollapsibleSideRail>
  );
}
