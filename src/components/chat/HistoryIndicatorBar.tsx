"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AiMessage } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

function excerpt(content: string, max = 80) {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text || "(attachment)";
}

type TooltipState = {
  message: AiMessage;
  top: number;
  left: number;
};

function HistoryPreviewTooltip({ tooltip }: { tooltip: TooltipState }) {
  const isUser = tooltip.message.role === "user";

  return (
    <div
      className="pointer-events-none fixed z-[200] w-56 -translate-x-full -translate-y-1/2 rounded-lg border bg-popover p-3 text-left shadow-xl"
      style={{ top: tooltip.top, left: tooltip.left }}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {isUser ? "You" : "Grok"} · {format(new Date(tooltip.message.createdAt), "MMM d, h:mm a")}
      </p>
      <p className="mt-1 line-clamp-3 text-xs leading-relaxed">{excerpt(tooltip.message.content)}</p>
    </div>
  );
}

export function HistoryIndicatorBar({
  messages,
  activeMessageId,
  onSelect,
}: {
  messages: AiMessage[];
  activeMessageId: string | null;
  onSelect: (messageId: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showTooltip = useCallback((message: AiMessage, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setTooltip({
      message,
      top: rect.top + rect.height / 2,
      left: rect.left - 12,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  if (messages.length === 0) return null;

  return (
    <>
      <div className="relative z-30 flex h-full w-12 shrink-0 flex-col items-center border-l bg-muted/20 py-3">
        <div className="relative flex h-full w-full flex-col items-center gap-1 overflow-y-auto overflow-x-visible px-1">
          <div className="pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border" />
          {messages.map((message) => {
            const isUser = message.role === "user";
            const isActive = activeMessageId === message.id;

            return (
              <div key={message.id} className="relative z-10 flex justify-center py-0.5">
                <button
                  type="button"
                  aria-label={`Jump to ${isUser ? "your" : "Grok"} message`}
                  onClick={() => onSelect(message.id)}
                  onMouseEnter={(event) => showTooltip(message, event.currentTarget)}
                  onMouseLeave={hideTooltip}
                  onFocus={(event) => showTooltip(message, event.currentTarget)}
                  onBlur={hideTooltip}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full border transition-all hover:scale-125",
                    isUser
                      ? "border-primary bg-primary/80 hover:bg-primary"
                      : "border-muted-foreground/50 bg-muted-foreground/40 hover:bg-muted-foreground/70",
                    isActive && "ring-2 ring-primary/50 ring-offset-1 ring-offset-background"
                  )}
                />
              </div>
            );
          })}
        </div>
      </div>

      {mounted && tooltip ? createPortal(<HistoryPreviewTooltip tooltip={tooltip} />, document.body) : null}
    </>
  );
}

export function scrollToMessage(messageId: string) {
  const el = document.getElementById(`msg-${messageId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary/40", "rounded-2xl");
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-primary/40", "rounded-2xl");
  }, 1200);
}
