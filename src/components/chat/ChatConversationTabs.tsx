"use client";

import { GitBranch, X } from "lucide-react";
import type { AiConversation } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function tabLabel(conversation: AiConversation, index: number) {
  if (conversation.forkFromMessageId) {
    return conversation.title.startsWith("Fork")
      ? conversation.title.replace(/^Fork · /, "").slice(0, 24) || `Fork ${index + 1}`
      : `Fork ${index + 1}`;
  }
  return index === 0 ? "Main" : conversation.title.slice(0, 24) || `Tab ${index + 1}`;
}

export function ChatConversationTabs({
  tabs,
  activeConversationId,
  onSelect,
  onClose,
}: {
  tabs: AiConversation[];
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onClose?: (conversationId: string) => void;
}) {
  if (tabs.length <= 1) return null;

  return (
    <div className="border-b bg-muted/20 px-4 py-2 md:px-6">
      <div className="flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeConversationId;
          const isFork = Boolean(tab.forkFromMessageId);

          return (
            <div
              key={tab.id}
              className={cn(
                "group inline-flex shrink-0 items-center rounded-md border text-xs transition",
                isActive
                  ? "border-border bg-background text-foreground shadow-sm"
                  : "border-transparent bg-transparent text-muted-foreground hover:bg-background/70"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                className="inline-flex max-w-[180px] items-center gap-1.5 px-3 py-1.5"
                title={tab.title}
              >
                {isFork ? <GitBranch className="h-3 w-3 shrink-0" /> : null}
                <span className="truncate">{tabLabel(tab, index)}</span>
              </button>
              {isFork && onClose ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mr-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                  onClick={() => onClose(tab.id)}
                  title="Close fork"
                >
                  <X className="h-3 w-3" />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
