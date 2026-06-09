"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookmarkCardPreview } from "./BookmarkCardPreview";
import type { BookmarkCard } from "@/lib/db/schema";

type BookmarkDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: BookmarkCard | null;
  mode: "archive" | "delete";
  onConfirm: () => Promise<void>;
  loading?: boolean;
};

export function BookmarkDeleteDialog({
  open,
  onOpenChange,
  card,
  mode,
  onConfirm,
  loading = false,
}: BookmarkDeleteDialogProps) {
  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "archive" ? "Archive bookmark" : "Delete permanently"}</DialogTitle>
          <DialogDescription>
            {mode === "archive"
              ? "Archived bookmarks are hidden but can be restored later."
              : "This action cannot be undone. The bookmark will be permanently removed."}
          </DialogDescription>
        </DialogHeader>

        <BookmarkCardPreview
          title={card.title}
          description={card.description ?? undefined}
          url={card.url}
          iconType={card.iconType}
          iconValue={card.iconValue ?? card.icon ?? ""}
          accentColor={card.accentColor}
          enabled={card.enabled}
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={mode === "delete" ? "destructive" : "default"}
            disabled={loading}
            onClick={() => void onConfirm()}
          >
            {loading ? "Working..." : mode === "archive" ? "Archive" : "Delete permanently"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
