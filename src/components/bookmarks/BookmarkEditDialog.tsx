"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookmarkCard, BookmarkGroup } from "@/lib/db/schema";

type BookmarkEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: BookmarkGroup[];
  defaultGroupId?: string;
  card?: BookmarkCard | null;
  onSubmit: (input: {
    groupId: string;
    title: string;
    description?: string;
    url: string;
    icon?: string;
    enabled: boolean;
    favourite: boolean;
  }) => Promise<void>;
};

export function BookmarkEditDialog({
  open,
  onOpenChange,
  groups,
  defaultGroupId,
  card,
  onSubmit,
}: BookmarkEditDialogProps) {
  const firstGroupId = useMemo(() => groups[0]?.id ?? "", [groups]);
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [favourite, setFavourite] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGroupId(card?.groupId ?? defaultGroupId ?? firstGroupId);
    setTitle(card?.title ?? "");
    setDescription(card?.description ?? "");
    setUrl(card?.url ?? "");
    setIcon(card?.icon ?? "");
    setEnabled(card?.enabled ?? true);
    setFavourite(card?.favourite ?? false);
  }, [card, defaultGroupId, firstGroupId, open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId) return;
    setSaving(true);
    try {
      await onSubmit({
        groupId,
        title: title.trim(),
        description: description.trim() || undefined,
        url: url.trim(),
        icon: icon.trim() || undefined,
        enabled,
        favourite,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle>{card ? "Edit bookmark" : "Create bookmark"}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {card
              ? "Update bookmark details and save changes."
              : "Add a new bookmark card to this tab."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="bookmark-group">Group</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id="bookmark-group">
                <SelectValue placeholder="Select group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookmark-title">Title</Label>
            <Input
              id="bookmark-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookmark-url">URL</Label>
            <Input
              id="bookmark-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookmark-description">Description</Label>
            <Textarea
              id="bookmark-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bookmark-icon">Icon text (optional)</Label>
            <Input
              id="bookmark-icon"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
              maxLength={100}
              placeholder="e.g. GH, Docs, Jira"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={enabled ? "secondary" : "outline"}
              size="sm"
              onClick={() => setEnabled((value) => !value)}
            >
              {enabled ? "Enabled" : "Disabled"}
            </Button>
            <Button
              type="button"
              variant={favourite ? "secondary" : "outline"}
              size="sm"
              onClick={() => setFavourite((value) => !value)}
            >
              {favourite ? "Favourite" : "Not favourite"}
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : card ? "Save changes" : "Create bookmark"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
