"use client";

import Image from "next/image";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Check, Copy, FileText, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MarkdownMessage } from "@/components/ai/MarkdownMessage";
import { Button } from "@/components/ui/button";
import { SkillEvents } from "@/components/chat/SkillEvents";
import type { AiMessage, AiMessageAttachment, AiSkillEvent } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

function AttachmentList({ attachments }: { attachments: AiMessageAttachment[] }) {
  if (!attachments.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((file) => {
        const isImage = file.mimeType.startsWith("image/");
        const src = `/uploads/${file.path}`;
        return (
          <a
            key={`${file.path}-${file.filename}`}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border bg-background/50"
          >
            {isImage ? (
              <Image
                src={src}
                alt={file.filename}
                width={160}
                height={120}
                className="h-24 w-40 object-cover"
                unoptimized
              />
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 text-xs">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="max-w-32 truncate">{file.filename}</span>
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
}

export function ChatMessageBubble({
  message,
  isStreaming = false,
  streamingSkills = [],
  showRegenerate = false,
  onRegenerate,
  registerRef,
}: {
  message: AiMessage;
  isStreaming?: boolean;
  streamingSkills?: AiSkillEvent[];
  showRegenerate?: boolean;
  onRegenerate?: () => void;
  registerRef?: (el: HTMLDivElement | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const skills = isStreaming ? streamingSkills : (message.metadata?.skills ?? []);

  async function copyContent() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <motion.div
      ref={registerRef}
      id={`msg-${message.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={cn("group flex gap-3 scroll-mt-4", isUser && "flex-row-reverse")}
    >
      {!isUser ? (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Sparkles className="h-4 w-4" />
        </div>
      ) : (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          You
        </div>
      )}

      <div
        className={cn(
          "min-w-0 max-w-[min(720px,85%)] rounded-2xl px-4 py-3 text-sm shadow-sm",
          isUser ? "bg-primary text-primary-foreground" : "border bg-card"
        )}
      >
        {!isUser ? <SkillEvents skills={skills} /> : null}

        {isUser ? (
          <>
            {message.content ? (
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            ) : null}
            <AttachmentList attachments={message.attachments ?? []} />
          </>
        ) : message.content || isStreaming ? (
          <>
            {message.content ? <MarkdownMessage content={message.content} /> : null}
            {isStreaming && !message.content ? (
              <span className="text-muted-foreground animate-pulse">Thinking…</span>
            ) : null}
          </>
        ) : null}

        {!isUser && message.content && !isStreaming ? (
          <div className="mt-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => void copyContent()}
            >
              {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
              Copy
            </Button>
            {showRegenerate && onRegenerate ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={onRegenerate}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Regenerate
              </Button>
            ) : null}
          </div>
        ) : null}

        <p
          className={cn(
            "mt-2 text-[10px] opacity-60",
            isUser ? "text-primary-foreground/80" : "text-muted-foreground"
          )}
        >
          {format(new Date(message.createdAt), "MMM d, h:mm a")}
        </p>
      </div>
    </motion.div>
  );
}
