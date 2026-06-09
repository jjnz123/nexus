"use client";

import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookmarkCard, BookmarkGroup, BookmarkIconType } from "@/lib/db/schema";
import { BookmarkCardPreview } from "./BookmarkCardPreview";
import { BookmarkIconPicker } from "./BookmarkIconPicker";

export type BookmarkFormInput = {
  groupId: string;
  title: string;
  description?: string;
  url: string;
  iconType: BookmarkIconType;
  iconValue?: string;
  accentColor: string;
  openInIframe: boolean;
  enabled: boolean;
};

type BookmarkEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: BookmarkGroup[];
  defaultGroupId?: string;
  card?: BookmarkCard | null;
  canEdit?: boolean;
  favouriteCount?: number;
  isFavourited?: boolean;
  onSubmit: (input: BookmarkFormInput) => Promise<void>;
  onDuplicate?: (card: BookmarkCard) => Promise<void>;
  onArchive?: (card: BookmarkCard) => void;
  onDelete?: (card: BookmarkCard) => void;
  onToggleFavourite?: (cardId: string) => Promise<void>;
};

async function uploadIconImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!response.ok) throw new Error("Upload failed");
  const data = (await response.json()) as { path: string };
  return data.path;
}

export function BookmarkEditDialog({
  open,
  onOpenChange,
  groups,
  defaultGroupId,
  card,
  canEdit = true,
  isFavourited = false,
  onSubmit,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleFavourite,
}: BookmarkEditDialogProps) {
  const firstGroupId = groups[0]?.id ?? "";
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [iconType, setIconType] = useState<BookmarkIconType>("text");
  const [iconValue, setIconValue] = useState("");
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [openInIframe, setOpenInIframe] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGroupId(card?.groupId ?? defaultGroupId ?? firstGroupId);
    setTitle(card?.title ?? "");
    setDescription(card?.description ?? "");
    setUrl(card?.url ?? "");
    setIconType(card?.iconType ?? "text");
    setIconValue(card?.iconValue ?? card?.icon ?? "");
    setAccentColor(card?.accentColor ?? "#6366f1");
    setOpenInIframe(card?.openInIframe ?? false);
    setEnabled(card?.enabled ?? true);
  }, [card, defaultGroupId, firstGroupId, open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId || !canEdit) return;
    setSaving(true);
    try {
      await onSubmit({
        groupId,
        title: title.trim(),
        description: description.trim() || undefined,
        url: url.trim(),
        iconType,
        iconValue: iconValue.trim() || undefined,
        accentColor,
        openInIframe,
        enabled,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{card ? "Edit bookmark" : "Create bookmark"}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {canEdit
              ? "Configure your bookmark and preview how it will appear."
              : "View-only mode. You do not have edit access."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-2">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="bookmark-group">Group</Label>
              <Select value={groupId} onValueChange={setGroupId} disabled={!canEdit}>
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
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bookmark-url">URL</Label>
              <Input
                id="bookmark-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bookmark-description">Description</Label>
              <Textarea
                id="bookmark-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                disabled={!canEdit}
              />
            </div>

            {canEdit ? (
              <BookmarkIconPicker
                value={{ iconType, iconValue, accentColor }}
                onChange={(next) => {
                  setIconType(next.iconType);
                  setIconValue(next.iconValue);
                  setAccentColor(next.accentColor);
                }}
                onUploadImage={uploadIconImage}
              />
            ) : null}

            <div className="space-y-3 rounded-md border border-zinc-800 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enabled</p>
                  <p className="text-xs text-zinc-400">Disabled cards cannot be launched</p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Open in iframe modal</p>
                  <p className="text-xs text-amber-400">Sandboxed preview — some sites block embedding</p>
                </div>
                <Switch
                  checked={openInIframe}
                  onCheckedChange={setOpenInIframe}
                  disabled={!canEdit}
                />
              </div>
              {card && onToggleFavourite ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Home favourite</p>
                    <p className="text-xs text-zinc-400">Pin to your home screen (max 5)</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isFavourited ? "secondary" : "outline"}
                    onClick={() => void onToggleFavourite(card.id)}
                  >
                    {isFavourited ? "Favourited" : "Add favourite"}
                  </Button>
                </div>
              ) : null}
            </div>

            {card && canEdit ? (
              <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
                {onDuplicate ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void onDuplicate(card)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </Button>
                ) : null}
                {onArchive ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => onArchive(card)}>
                    Archive
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(card)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {canEdit ? (
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : card ? "Save changes" : "Create bookmark"}
                </Button>
              ) : null}
            </div>
          </form>

          <div className="space-y-2">
            <Label>Live preview</Label>
            <BookmarkCardPreview
              title={title}
              description={description}
              url={url}
              iconType={iconType}
              iconValue={iconValue}
              accentColor={accentColor}
              enabled={enabled}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
