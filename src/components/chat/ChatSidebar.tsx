"use client";

import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  MessageSquare,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";
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
  collapsed,
  onCollapsedChange,
  onSearchChange,
  onSelectProject,
  onSelectConversation,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
  onOpenFiles,
}: {
  projects: AiProject[];
  conversations: AiConversation[];
  activeProjectId: string | null;
  activeConversationId: string | null;
  search: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSearchChange: (value: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onSelectConversation: (conversationId: string) => void;
  onCreateProject: () => void;
  onRenameProject: (project: AiProject) => void;
  onDeleteProject: (project: AiProject) => void;
  onCreateConversation: () => void;
  onRenameConversation: (conversation: AiConversation) => void;
  onDeleteConversation: (conversation: AiConversation) => void;
  onOpenFiles: () => void;
}) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const isCompact = collapsed && !hoverExpanded;
  const showLabels = !isCompact;

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
    <motion.aside
      animate={{ width: isCompact ? 56 : 288 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      onMouseEnter={() => collapsed && setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r bg-card/40",
        collapsed && hoverExpanded && "z-20 shadow-xl"
      )}
    >
      <div className={cn("flex items-center border-b p-2", showLabels ? "justify-between px-3" : "justify-center")}>
        {showLabels ? <h2 className="text-sm font-semibold">Workspace</h2> : null}
        <div className="flex items-center gap-1">
          {showLabels ? (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onOpenFiles} title="Files">
              <FolderOpen className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onCollapsedChange(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showLabels ? (
          <motion.div
            key="sidebar-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="space-y-3 border-b p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Projects
                </h3>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCreateProject}>
                  <FolderPlus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => onSelectProject(null)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-accent",
                    activeProjectId === null && "bg-accent font-medium"
                  )}
                >
                  <LayoutGrid className="h-4 w-4 shrink-0" />
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
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm hover:opacity-90"
                    >
                      <Folder className="h-4 w-4 shrink-0" />
                      <span className="truncate">{project.name}</span>
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
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Conversations
                </h3>
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
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="sidebar-icons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center gap-2 py-3"
          >
            <Button
              size="icon"
              variant={activeProjectId === null ? "secondary" : "ghost"}
              className="h-9 w-9"
              onClick={() => onSelectProject(null)}
              title="General"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            {projects.slice(0, 6).map((project) => (
              <Button
                key={project.id}
                size="icon"
                variant={activeProjectId === project.id ? "secondary" : "ghost"}
                className="h-9 w-9"
                onClick={() => onSelectProject(project.id)}
                title={project.name}
              >
                <Folder className="h-4 w-4" />
              </Button>
            ))}
            <div className="my-1 h-px w-8 bg-border" />
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onOpenFiles} title="Files">
              <FolderOpen className="h-4 w-4" />
            </Button>
            {filteredConversations.slice(0, 8).map((conversation) => (
              <Button
                key={conversation.id}
                size="icon"
                variant={activeConversationId === conversation.id ? "secondary" : "ghost"}
                className="h-9 w-9"
                onClick={() => onSelectConversation(conversation.id)}
                title={conversation.title}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
