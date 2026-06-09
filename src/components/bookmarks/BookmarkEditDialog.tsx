"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookmarkCard, BookmarkGroup, BookmarkIconType } from "@/lib/db/schema";
import {
  enrichBookmarkFromUrl,
  suggestBookmarkWithAi,
  enableCardHealthMonitoring,
  disableCardHealthMonitoring,
} from "@/server/actions/bookmark-phase2";
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
  tags?: string[];
  faviconPath?: string;
  autoTitle?: string;
  autoDescription?: string;
  healthMonitoringEnabled?: boolean;
};

type BookmarkEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: BookmarkGroup[];
  defaultGroupId?: string;
  activeTabName?: string;
  card?: BookmarkCard | null;
  canEdit?: boolean;
  canUseAi?: boolean;
  canConfigureMonitoring?: boolean;
  favouriteCount?: number;
  isFavourited?: boolean;
  onSubmit: (input: BookmarkFormInput) => Promise<void>;
  onDuplicate?: (card: BookmarkCard) => Promise<void>;
  onArchive?: (card: BookmarkCard) => void;
  onDelete?: (card: BookmarkCard) => void;
  onToggleFavourite?: (cardId: string) => Promise<void>;
  onHealthChange?: (cardId: string, enabled: boolean) => void;
};

async function uploadIconImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!response.ok) throw new Error("Upload failed");
  const data = (await response.json()) as { path: string };
  return data.path;
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

type AiSuggestion = {
  title: string;
  description: string;
  icon: string;
  tags: string[];
  suggestedGroup: string;
};

export function BookmarkEditDialog({
  open,
  onOpenChange,
  groups,
  defaultGroupId,
  activeTabName,
  card,
  canEdit = true,
  canUseAi = false,
  canConfigureMonitoring = false,
  isFavourited = false,
  onSubmit,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleFavourite,
  onHealthChange,
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
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [faviconPath, setFaviconPath] = useState<string | undefined>();
  const [autoTitle, setAutoTitle] = useState<string | undefined>();
  const [autoDescription, setAutoDescription] = useState<string | undefined>();
  const [healthMonitoringEnabled, setHealthMonitoringEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const [enriching, setEnriching] = useState(false);
  const [enrichSuccess, setEnrichSuccess] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);

  const enrichTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEnrichedUrlRef = useRef("");

  const runEnrich = useCallback(async (targetUrl: string) => {
    if (!canEdit || !isValidUrl(targetUrl)) return;
    const normalized = targetUrl.trim();
    if (normalized === lastEnrichedUrlRef.current) return;

    setEnriching(true);
    setEnrichSuccess(false);
    try {
      const result = await enrichBookmarkFromUrl({ url: normalized });
      if (!result.success) {
        toast.error(result.error ?? "Could not fetch metadata", {
          action: { label: "Manual entry", onClick: () => undefined },
        });
        return;
      }

      lastEnrichedUrlRef.current = normalized;
      if (result.title && !title.trim()) setTitle(result.title);
      if (result.description && !description.trim()) setDescription(result.description);
      if (result.autoTitle) setAutoTitle(result.autoTitle);
      if (result.autoDescription) setAutoDescription(result.autoDescription);
      if (result.faviconPath) {
        setFaviconPath(result.faviconPath);
        setIconType("image");
        setIconValue(result.faviconPath);
      }
      setEnrichSuccess(true);
      setTimeout(() => setEnrichSuccess(false), 2000);
    } catch {
      toast.error("Enrichment failed", {
        action: { label: "Manual entry", onClick: () => undefined },
      });
    } finally {
      setEnriching(false);
    }
  }, [canEdit, title, description]);

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
    setTags(card?.tags ?? []);
    setFaviconPath(card?.faviconPath ?? undefined);
    setAutoTitle(card?.autoTitle ?? undefined);
    setAutoDescription(card?.autoDescription ?? undefined);
    setHealthMonitoringEnabled(card?.healthMonitoringEnabled ?? false);
    setAiSuggestion(null);
    setEnrichSuccess(false);
    lastEnrichedUrlRef.current = card?.url ?? "";
  }, [card, defaultGroupId, firstGroupId, open]);

  useEffect(() => {
    if (!open || !canEdit) return;
    if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current);
    if (!isValidUrl(url)) return;

    enrichTimerRef.current = setTimeout(() => {
      void runEnrich(url);
    }, 800);

    return () => {
      if (enrichTimerRef.current) clearTimeout(enrichTimerRef.current);
    };
  }, [url, open, canEdit, runEnrich]);

  async function handleAiSuggest() {
    if (!canUseAi || !url.trim()) return;
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      const suggestion = await suggestBookmarkWithAi({
        url,
        tabName: activeTabName,
        groupNames: groups.map((g) => g.name),
      });
      setAiSuggestion({
        title: suggestion.title,
        description: suggestion.description,
        icon: suggestion.icon ?? "Link2",
        tags: suggestion.tags,
        suggestedGroup: suggestion.suggestedGroup,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI suggestion failed");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiField(field: keyof AiSuggestion) {
    if (!aiSuggestion) return;
    if (field === "title") setTitle(aiSuggestion.title);
    if (field === "description") setDescription(aiSuggestion.description);
    if (field === "icon") {
      setIconType("lucide");
      setIconValue(aiSuggestion.icon);
    }
    if (field === "tags") setTags(aiSuggestion.tags);
    if (field === "suggestedGroup") {
      const match = groups.find(
        (g) => g.name.toLowerCase() === aiSuggestion.suggestedGroup.toLowerCase()
      );
      if (match) setGroupId(match.id);
    }
  }

  function addTag() {
    const value = tagInput.trim();
    if (!value || tags.includes(value) || tags.length >= 10) return;
    setTags((prev) => [...prev, value]);
    setTagInput("");
  }

  async function handleHealthToggle(checked: boolean) {
    if (!card) {
      setHealthMonitoringEnabled(checked);
      return;
    }
    if (!canConfigureMonitoring) return;

    const previous = healthMonitoringEnabled;
    setHealthMonitoringEnabled(checked);
    try {
      if (checked) {
        await enableCardHealthMonitoring(card.id);
        toast.success("Health monitoring enabled");
      } else {
        await disableCardHealthMonitoring(card.id);
        toast.success("Health monitoring disabled");
      }
      onHealthChange?.(card.id, checked);
    } catch {
      setHealthMonitoringEnabled(previous);
      toast.error("Failed to update health monitoring");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId || !canEdit) return;
    setSaving(true);
    try {
      const input: BookmarkFormInput = {
        groupId,
        title: title.trim(),
        description: description.trim() || undefined,
        url: url.trim(),
        iconType,
        iconValue: iconValue.trim() || undefined,
        accentColor,
        openInIframe,
        enabled,
        tags,
        faviconPath,
        autoTitle,
        autoDescription,
        healthMonitoringEnabled: card ? healthMonitoringEnabled : false,
      };
      await onSubmit(input);

      if (!card && healthMonitoringEnabled && canConfigureMonitoring) {
        toast.info("Save the card first, then enable health monitoring");
      }

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
              ? "Paste a URL to auto-fill metadata, or configure manually."
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
              <Label htmlFor="bookmark-url">URL</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="bookmark-url"
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setEnrichSuccess(false);
                    }}
                    required
                    disabled={!canEdit}
                    className={enriching ? "pr-9" : enrichSuccess ? "pr-9" : ""}
                  />
                  <AnimatePresence>
                    {enriching ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute right-3 top-2.5 text-zinc-400"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </motion.div>
                    ) : enrichSuccess ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: [0.5, 1.2, 1] }}
                        exit={{ opacity: 0 }}
                        className="absolute right-3 top-2.5 text-emerald-400"
                      >
                        <Check className="h-4 w-4" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!isValidUrl(url) || enriching}
                    onClick={() => void runEnrich(url)}
                  >
                    Enrich
                  </Button>
                ) : null}
              </div>
              {enriching ? (
                <p className="text-xs text-zinc-400">Fetching metadata…</p>
              ) : null}
            </div>

            <motion.div
              className="space-y-2"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <Label htmlFor="bookmark-title">Title</Label>
              <Input
                id="bookmark-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                disabled={!canEdit}
              />
            </motion.div>

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
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add tag"
                    maxLength={50}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addTag}>
                    Add
                  </Button>
                </div>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                          aria-label={`Remove ${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

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

            {canUseAi && canEdit ? (
              <div className="space-y-2 rounded-md border border-zinc-800 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">AI assist</p>
                    <p className="text-xs text-zinc-400">Suggest title, icon, tags, and group</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!url.trim() || aiLoading}
                    onClick={() => void handleAiSuggest()}
                  >
                    {aiLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Suggest
                  </Button>
                </div>
                {aiSuggestion ? (
                  <div className="flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="secondary" onClick={() => applyAiField("title")}>
                      Apply title
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => applyAiField("description")}>
                      Apply description
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => applyAiField("icon")}>
                      Apply icon
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => applyAiField("tags")}>
                      Apply tags
                    </Button>
                    {aiSuggestion.suggestedGroup ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => applyAiField("suggestedGroup")}>
                        Group: {aiSuggestion.suggestedGroup}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
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
              {canConfigureMonitoring ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable health monitoring</p>
                    <p className="text-xs text-zinc-400">
                      {card
                        ? "Links this card to network monitoring"
                        : "Available after the card is saved"}
                    </p>
                  </div>
                  <Switch
                    checked={healthMonitoringEnabled}
                    onCheckedChange={(checked) => void handleHealthToggle(checked)}
                    disabled={!canEdit || !card}
                  />
                </div>
              ) : null}
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
