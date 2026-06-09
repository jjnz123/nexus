"use client";

import {
  Download,
  FileUp,
  FolderPlus,
  Grid3X3,
  List,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { BookmarkSortMode } from "@/lib/validators/bookmarks";
import type { BookmarkFilterChip } from "@/lib/bookmarks/sort";
import type { BookmarkCard, BookmarkGroup, BookmarkTab } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: { value: BookmarkSortMode; label: string }[] = [
  { value: "custom", label: "Custom order" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "most_used", label: "Most used (all time)" },
  { value: "most_used_30d", label: "Most used (30 days)" },
  { value: "recently_used", label: "Recently used" },
  { value: "health", label: "Health status" },
];

const FILTER_CHIPS: { value: BookmarkFilterChip; label: string }[] = [
  { value: "all", label: "All" },
  { value: "recently_used", label: "Recently used" },
  { value: "monitored_healthy", label: "Monitored & healthy" },
  { value: "disabled", label: "Disabled" },
];

export function BookmarksBrowseToolbar({
  search,
  onSearchChange,
  matchCount,
  totalCount,
  onOpenSettings,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  matchCount: number;
  totalCount: number;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
        <Input
          className="pl-9 pr-9"
          placeholder="Search bookmarks..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {search ? (
          <button
            type="button"
            className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-200"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <p className="text-xs text-zinc-400">
        {search ? `${matchCount} of ${totalCount} matches` : `${totalCount} cards`}
      </p>
      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={onOpenSettings} title="Bookmark settings">
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function BookmarksSettingsDialog({
  open,
  onOpenChange,
  canEdit,
  isAdmin,
  activeTab,
  groups,
  cards,
  bulkMode,
  selectedCount,
  onBulkModeChange,
  layoutMode,
  onLayoutModeChange,
  layoutLocked,
  globalLayoutLocked,
  onGlobalLayoutLockedChange,
  onTabLayoutLockedChange,
  showArchived,
  onShowArchivedChange,
  sortMode,
  onSortModeChange,
  filterChip,
  onFilterChipChange,
  tagFilters,
  onCreateTab,
  onCreateGroup,
  onCreateCard,
  onRenameTab,
  onDeleteTab,
  onShareTab,
  disableDeleteTab,
  onRenameGroup,
  onDeleteGroup,
  onEditCard,
  onImport,
  onExportTab,
  onExportAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  isAdmin?: boolean;
  activeTab: BookmarkTab | undefined;
  groups: BookmarkGroup[];
  cards: BookmarkCard[];
  bulkMode: boolean;
  selectedCount: number;
  onBulkModeChange: (value: boolean) => void;
  layoutMode: "grid" | "list";
  onLayoutModeChange: (value: "grid" | "list") => void;
  layoutLocked: boolean;
  globalLayoutLocked: boolean;
  onGlobalLayoutLockedChange: (value: boolean) => void;
  onTabLayoutLockedChange: (value: boolean) => void;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  sortMode: BookmarkSortMode;
  onSortModeChange: (value: BookmarkSortMode) => void;
  filterChip: BookmarkFilterChip;
  onFilterChipChange: (value: BookmarkFilterChip) => void;
  tagFilters: string[];
  onCreateTab: () => void;
  onCreateGroup: () => void;
  onCreateCard: () => void;
  onRenameTab: () => void;
  onDeleteTab: () => void;
  onShareTab?: () => void;
  disableDeleteTab: boolean;
  onRenameGroup: (group: BookmarkGroup) => void;
  onDeleteGroup: (group: BookmarkGroup) => void;
  onEditCard: (card: BookmarkCard) => void;
  onImport: () => void;
  onExportTab: () => void;
  onExportAll: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Bookmark settings
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Create and manage tabs, groups, and cards. View options apply to the browse view.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {canEdit ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Create</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onCreateTab}>
                  <Plus className="mr-1 h-4 w-4" />
                  New tab
                </Button>
                <Button size="sm" variant="outline" onClick={onCreateGroup} disabled={!activeTab}>
                  <FolderPlus className="mr-1 h-4 w-4" />
                  New group
                </Button>
                <Button size="sm" variant="outline" onClick={onCreateCard} disabled={!groups.length}>
                  <Plus className="mr-1 h-4 w-4" />
                  New card
                </Button>
              </div>
            </section>
          ) : null}

          {canEdit || isAdmin ? (
            <>
              <Separator className="bg-zinc-800" />
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Active tab
                </h3>
                <p className="text-sm text-zinc-300">{activeTab?.name ?? "None selected"}</p>
                <div className="flex flex-wrap gap-2">
                  {canEdit ? (
                    <>
                      <Button size="sm" variant="outline" onClick={onRenameTab} disabled={!activeTab}>
                        <Pencil className="mr-1 h-4 w-4" />
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onDeleteTab}
                        disabled={disableDeleteTab}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    </>
                  ) : null}
                  {isAdmin && onShareTab ? (
                    <Button size="sm" variant="outline" onClick={onShareTab} disabled={!activeTab}>
                      Share
                    </Button>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}

          {canEdit && groups.length > 0 ? (
            <>
              <Separator className="bg-zinc-800" />
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Groups</h3>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 p-2">
                  {groups.map((group) => {
                    const count = cards.filter((c) => c.groupId === group.id).length;
                    return (
                      <div
                        key={group.id}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-900"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {group.name}
                          <span className="ml-1 text-xs text-zinc-500">({count})</span>
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => onRenameGroup(group)}
                          >
                            Rename
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-destructive"
                            onClick={() => onDeleteGroup(group)}
                            disabled={count > 0}
                            title={count > 0 ? "Group must be empty" : undefined}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}

          {canEdit && cards.length > 0 ? (
            <>
              <Separator className="bg-zinc-800" />
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Manage cards
                </h3>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 p-2">
                  {cards.slice(0, 50).map((card) => (
                    <div
                      key={card.id}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-900"
                    >
                      <span className="min-w-0 truncate text-sm">{card.title}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => onEditCard(card)}
                      >
                        Edit
                      </Button>
                    </div>
                  ))}
                  {cards.length > 50 ? (
                    <p className="px-2 py-1 text-xs text-zinc-500">
                      Showing first 50 of {cards.length} cards
                    </p>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}

          {canEdit ? (
            <>
              <Separator className="bg-zinc-800" />
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Bulk actions
                </h3>
                <Button
                  size="sm"
                  variant={bulkMode ? "secondary" : "outline"}
                  onClick={() => onBulkModeChange(!bulkMode)}
                >
                  {bulkMode ? "Exit bulk select" : "Bulk select cards"}
                </Button>
                {bulkMode ? (
                  <p className="text-xs text-zinc-400">
                    {selectedCount} selected — use the bulk bar below the search field in the main
                    view.
                  </p>
                ) : null}
              </section>

              <Separator className="bg-zinc-800" />
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Import & export
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={onImport}>
                    <FileUp className="mr-1 h-4 w-4" />
                    Import JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={onExportTab} disabled={!activeTab}>
                    <Download className="mr-1 h-4 w-4" />
                    Export tab
                  </Button>
                  <Button size="sm" variant="outline" onClick={onExportAll}>
                    <Download className="mr-1 h-4 w-4" />
                    Export all
                  </Button>
                </div>
              </section>
            </>
          ) : null}

          <Separator className="bg-zinc-800" />
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              View options
            </h3>
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Sort</Label>
              <Select value={sortMode} onValueChange={(v) => onSortModeChange(v as BookmarkSortMode)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => onFilterChipChange(chip.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition",
                    filterChip === chip.value
                      ? "border-primary/50 bg-primary/10 text-zinc-100"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  )}
                >
                  {chip.label}
                </button>
              ))}
              {tagFilters.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    onFilterChipChange(filterChip === `tag:${tag}` ? "all" : `tag:${tag}`)
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition",
                    filterChip === `tag:${tag}`
                      ? "border-primary/50 bg-primary/10 text-zinc-100"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  )}
                >
                  #{tag}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={layoutMode === "grid" ? "secondary" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => onLayoutModeChange("grid")}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={layoutMode === "list" ? "secondary" : "outline"}
                size="icon"
                className="h-8 w-8"
                onClick={() => onLayoutModeChange("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-400">Show archived</Label>
                <Switch checked={showArchived} onCheckedChange={onShowArchivedChange} />
              </div>
              {canEdit ? (
                <>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">Global layout lock</Label>
                    <Switch
                      checked={globalLayoutLocked}
                      onCheckedChange={onGlobalLayoutLockedChange}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-zinc-400">Tab layout lock</Label>
                      {globalLayoutLocked || layoutLocked ? (
                        <Lock className="h-3.5 w-3.5 text-zinc-500" />
                      ) : (
                        <LockOpen className="h-3.5 w-3.5 text-zinc-500" />
                      )}
                    </div>
                    <Switch checked={layoutLocked} onCheckedChange={onTabLayoutLockedChange} />
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BulkToolbar({
  count,
  canEdit,
  groups,
  tabs,
  activeTabId,
  onEnable,
  onDisable,
  onArchive,
  onDelete,
  onExportSelected,
  onMoveGroup,
  onMoveTab,
  onEnableMonitoring,
  canConfigureMonitoring,
}: {
  count: number;
  canEdit: boolean;
  canConfigureMonitoring?: boolean;
  groups: { id: string; name: string }[];
  tabs: { id: string; name: string }[];
  activeTabId: string;
  onEnable: () => void;
  onDisable: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onExportSelected: () => void;
  onMoveGroup: (groupId: string) => void;
  onMoveTab: (tabId: string) => void;
  onEnableMonitoring?: () => void;
}) {
  if (!count) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <p className="mr-2 text-sm text-zinc-300">{count} selected</p>
      {canEdit ? (
        <>
          <Button size="sm" variant="outline" onClick={onEnable}>
            Enable
          </Button>
          <Button size="sm" variant="outline" onClick={onDisable}>
            Disable
          </Button>
          {canConfigureMonitoring && onEnableMonitoring ? (
            <Button size="sm" variant="outline" onClick={onEnableMonitoring}>
              Enable monitoring
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={onArchive}>
            Archive
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
          <Button size="sm" variant="outline" onClick={onExportSelected}>
            <Download className="mr-1 h-4 w-4" />
            Export selected
          </Button>
          <Select onValueChange={onMoveGroup}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Move to group" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={onMoveTab}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Move to tab" />
            </SelectTrigger>
            <SelectContent>
              {tabs
                .filter((tab) => tab.id !== activeTabId)
                .map((tab) => (
                  <SelectItem key={tab.id} value={tab.id}>
                    {tab.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </>
      ) : null}
    </div>
  );
}
