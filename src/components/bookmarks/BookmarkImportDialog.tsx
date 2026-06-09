"use client";

import { useState, useTransition } from "react";
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
  const [isPending, startTransition] = useTransition();

  async function loadPreview() {
    try {
      const stats = await previewImportBookmarks(json);
      setPreview(stats);
    } catch {
      setPreview(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) void loadPreview();
      }}
    >
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
            ) : (
              <p className="text-muted-foreground">Unable to parse preview.</p>
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
                  await importBookmarks({ json, mode });
                  onOpenChange(false);
                  onComplete();
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
