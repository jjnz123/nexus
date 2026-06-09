"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { importBookmarks, previewImportBookmarks } from "@/server/actions/bookmarks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BookmarkImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  json: string;
  onComplete: () => void;
};

export function BookmarkImportDialog({
  open,
  onOpenChange,
  json,
  onComplete,
}: BookmarkImportDialogProps) {
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [preview, setPreview] = useState<{ tabs: number; groups: number; cards: number } | null>(
    null
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !json.trim()) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    void previewImportBookmarks(json)
      .then((stats) => {
        if (!cancelled) {
          setPreview(stats);
          setPreviewError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(error instanceof Error ? error.message : "Unable to parse import file");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, json]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import bookmarks</DialogTitle>
          <DialogDescription>
            Review the import before applying changes to your bookmark library.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            {preview ? (
              <ul className="space-y-1">
                <li>{preview.tabs} tabs</li>
                <li>{preview.groups} groups</li>
                <li>{preview.cards} cards</li>
              </ul>
            ) : previewError ? (
              <p className="text-destructive">{previewError}</p>
            ) : (
              <p className="text-muted-foreground">Parsing import file…</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Import mode</Label>
            <Select value={mode} onValueChange={(v: "merge" | "replace") => setMode(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merge">Merge — add/update without removing existing</SelectItem>
                <SelectItem value="replace">Replace — remove all bookmarks first</SelectItem>
              </SelectContent>
            </Select>
            {mode === "replace" ? (
              <p className="text-xs text-destructive">
                Replace will delete all existing tabs, groups, and cards before importing.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={isPending || !preview}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await importBookmarks({ json, mode });
                    onOpenChange(false);
                    onComplete();
                    toast.success("Bookmarks imported");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Import failed");
                  }
                })
              }
            >
              {isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
