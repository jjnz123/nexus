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

type BookmarksToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  matchCount: number;
  totalCount: number;
  bulkMode: boolean;
  onBulkModeChange: (value: boolean) => void;
  layoutMode: "grid" | "list";
  onLayoutModeChange: (value: "grid" | "list") => void;
  layoutLocked: boolean;
  globalLayoutLocked: boolean;
  onGlobalLayoutLockedChange: (value: boolean) => void;
  onTabLayoutLockedChange: (value: boolean) => void;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  canEdit: boolean;
  hasGroups: boolean;
  onNewCard: () => void;
  onNewGroup: () => void;
  onExport: () => void;
  onImport: () => void;
};

export function BookmarksToolbar({
  search,
  onSearchChange,
  matchCount,
  totalCount,
  bulkMode,
  onBulkModeChange,
  layoutMode,
  onLayoutModeChange,
  layoutLocked,
  globalLayoutLocked,
  onGlobalLayoutLockedChange,
  onTabLayoutLockedChange,
  showArchived,
  onShowArchivedChange,
  canEdit,
  hasGroups,
  onNewCard,
  onNewGroup,
  onExport,
  onImport,
}: BookmarksToolbarProps) {
  return (
    <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={bulkMode ? "secondary" : "outline"}
          size="sm"
          onClick={() => onBulkModeChange(!bulkMode)}
        >
          {bulkMode ? "Exit bulk mode" : "Bulk select"}
        </Button>

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

        {canEdit ? (
          <>
            <Button variant="outline" size="sm" onClick={onNewCard} disabled={!hasGroups}>
              <Plus /> New card
            </Button>
            <Button variant="outline" size="sm" onClick={onNewGroup}>
              <FolderPlus /> New group
            </Button>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={onImport}>
              <FileUp /> Import
            </Button>
          </>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-400">Show archived</Label>
            <Switch checked={showArchived} onCheckedChange={onShowArchivedChange} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-400">Global lock</Label>
            <Switch
              checked={globalLayoutLocked}
              onCheckedChange={onGlobalLayoutLockedChange}
              disabled={!canEdit}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-400">Tab lock</Label>
            <Switch
              checked={layoutLocked}
              onCheckedChange={onTabLayoutLockedChange}
              disabled={!canEdit}
            />
            {globalLayoutLocked || layoutLocked ? (
              <Lock className="h-4 w-4 text-zinc-500" />
            ) : (
              <LockOpen className="h-4 w-4 text-zinc-500" />
            )}
          </div>
        </div>
      </div>
    </div>
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
}: {
  count: number;
  canEdit: boolean;
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

export function TabActions({
  canEdit,
  onRename,
  onDelete,
  disableDelete,
}: {
  canEdit: boolean;
  onRename: () => void;
  onDelete: () => void;
  disableDelete: boolean;
}) {
  if (!canEdit) return null;
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onRename}>
        <Pencil className="h-4 w-4" />
        Rename tab
      </Button>
      <Button variant="outline" size="sm" onClick={onDelete} disabled={disableDelete}>
        <Trash2 className="h-4 w-4" />
        Delete tab
      </Button>
    </div>
  );
}
