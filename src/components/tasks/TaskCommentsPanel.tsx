"use client";

import { useMemo, useState, useTransition } from "react";
import { MessageSquarePlus, Reply } from "lucide-react";
import { toast } from "sonner";
import { addComment } from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TaskComment } from "./types";

type CommentNode = TaskComment & { replies: CommentNode[] };

function buildCommentTree(comments: TaskComment[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const comment of comments) {
    byId.set(comment.id, { ...comment, replies: [] });
  }

  for (const comment of comments) {
    const node = byId.get(comment.id)!;
    if (comment.parentId && byId.has(comment.parentId)) {
      byId.get(comment.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function CommentThread({
  node,
  depth,
  onReply,
  replyingTo,
  replyDraft,
  onReplyDraftChange,
  onSubmitReply,
  isPending,
}: {
  node: CommentNode;
  depth: number;
  onReply: (commentId: string) => void;
  replyingTo: string | null;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  onSubmitReply: () => void;
  isPending: boolean;
}) {
  const initials = node.userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={depth > 0 ? "ml-6 border-l border-dashed pl-4" : ""}>
      <div className="flex gap-3 rounded-lg border bg-card/50 p-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{node.userName}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(node.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{node.body}</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-1 h-7 px-2 text-xs"
            onClick={() => onReply(node.id)}
          >
            <Reply className="mr-1 h-3 w-3" />
            Reply
          </Button>
        </div>
      </div>

      {replyingTo === node.id ? (
        <div className="mt-2 flex gap-2">
          <Textarea
            value={replyDraft}
            onChange={(e) => onReplyDraftChange(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            className="text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || !replyDraft.trim()}
            onClick={onSubmitReply}
          >
            Send
          </Button>
        </div>
      ) : null}

      <div className="mt-2 space-y-2">
        {node.replies.map((reply) => (
          <CommentThread
            key={reply.id}
            node={reply}
            depth={depth + 1}
            onReply={onReply}
            replyingTo={replyingTo}
            replyDraft={replyDraft}
            onReplyDraftChange={onReplyDraftChange}
            onSubmitReply={onSubmitReply}
            isPending={isPending}
          />
        ))}
      </div>
    </div>
  );
}

export function TaskCommentsPanel({
  taskId,
  comments,
  onChange,
}: {
  taskId: string;
  comments: TaskComment[];
  onChange: (next: TaskComment[]) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [commentDraft, setCommentDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  const tree = useMemo(() => buildCommentTree(comments), [comments]);

  function submitComment(body: string, parentId?: string | null) {
    startTransition(async () => {
      try {
        const created = await addComment({ taskId, body, parentId: parentId ?? null });
        onChange([
          ...comments,
          { ...created, userName: "You", parentId: parentId ?? null },
        ]);
        setCommentDraft("");
        setReplyDraft("");
        setReplyingTo(null);
        toast.success(parentId ? "Reply added" : "Comment added");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to add comment");
      }
    });
  }

  return (
    <div className="flex min-h-[360px] flex-col rounded-lg border">
      <div className="border-b px-4 py-3">
        <h4 className="font-medium">Comments</h4>
        <p className="text-xs text-muted-foreground">
          Threaded discussion with replies. {comments.length} comment{comments.length === 1 ? "" : "s"}.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {tree.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : (
          tree.map((node) => (
            <CommentThread
              key={node.id}
              node={node}
              depth={0}
              onReply={setReplyingTo}
              replyingTo={replyingTo}
              replyDraft={replyDraft}
              onReplyDraftChange={setReplyDraft}
              onSubmitReply={() => {
                if (!replyingTo || !replyDraft.trim()) return;
                submitComment(replyDraft.trim(), replyingTo);
              }}
              isPending={isPending}
            />
          ))
        )}
      </div>
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="Write a comment…"
            rows={3}
            className="min-h-[80px]"
          />
          <Button
            type="button"
            variant="default"
            className="self-end"
            disabled={isPending || !commentDraft.trim()}
            onClick={() => submitComment(commentDraft.trim())}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
