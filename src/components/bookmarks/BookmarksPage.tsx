"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  archiveBookmarkCard,
  bulkBookmarkCardAction,
  createBookmarkCard,
  createBookmarkGroup,
  createBookmarkTab,
  deleteBookmarkCard,
  deleteBookmarkGroup,
  deleteBookmarkTab,
  duplicateBookmarkCard,
  exportBookmarks,
  getBookmarkTabData,
  getBookmarkTabs,
  reorderBookmarkItems,
  reorderBookmarkTabs,
  restoreBookmarkCard,
  toggleUserFavourite,
  updateBookmarkCard,
  updateBookmarkGroup,
  updateBookmarkTab,
} from "@/server/actions/bookmarks";
import { updateBookmarkPreferences } from "@/server/actions/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fuzzyMatchCard } from "@/lib/bookmarks/fuzzy";
import {
  filterBookmarkCards,
  sortBookmarkCards,
  type BookmarkFilterChip,
} from "@/lib/bookmarks/sort";
import type { BookmarkSortMode } from "@/lib/validators/bookmarks";
import type { BookmarkCard, BookmarkGroup, BookmarkTab } from "@/lib/db/schema";
import {
  getCardHealthMap,
  getSmartBookmarkSuggestions,
} from "@/server/actions/bookmark-phase2";
import { getUserBookmarkClickCounts } from "@/server/actions/bookmarks";
import { SmartSuggestionsSection } from "./SmartSuggestionsSection";
import { BookmarkCardItem } from "./BookmarkCardItem";
import { BookmarkEditDialog, type BookmarkFormInput } from "./BookmarkEditDialog";
import { BookmarkDeleteDialog } from "./BookmarkDeleteDialog";
import { BookmarkImportDialog } from "./BookmarkImportDialog";
import { BookmarkShareDialog } from "./BookmarkShareDialog";
import { BookmarksEmptyState } from "./BookmarksEmptyState";
import { BookmarksSkeleton } from "./BookmarksSkeleton";
import {
  BookmarksToolbar,
  BulkToolbar,
  TabActions,
} from "./BookmarksToolbar";
import { useBookmarkLaunch } from "./useBookmarkLaunch";

type TabData = {
  groups: BookmarkGroup[];
  cards: BookmarkCard[];
};

type ClickStatsMap = Record<
  string,
  { total: number; recent30d: number; lastAt: Date | null }
>;

type HealthMap = Record<
  string,
  {
    status: "up" | "down" | "unknown" | "degraded";
    checkedAt: Date | null;
    deviceId: string;
    deviceName: string;
  }
>;

type SuggestionItem = {
  card: BookmarkCard;
  group: BookmarkGroup;
  tab: BookmarkTab;
};

type BookmarksPageProps = {
  tabs: BookmarkTab[];
  canEdit: boolean;
  isAdmin?: boolean;
  canUseAi?: boolean;
  canConfigureMonitoring?: boolean;
  canViewMonitoring?: boolean;
  userId: string;
  favouriteIds: string[];
  initialSuggestions?: { frequent: SuggestionItem[]; stale: SuggestionItem[] };
  initialPrefs: {
    activeBookmarkTabId: string | null;
    bookmarksLayoutMode: "grid" | "list";
    bookmarksGlobalLayoutLocked: boolean;
    bookmarksSortMode?: BookmarkSortMode;
  };
};

function sortByOrder<T extends { sortOrder: number }>(items: T[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}

function moveCard(
  cards: BookmarkCard[],
  groups: BookmarkGroup[],
  activeId: string,
  overId: string
) {
  const activeCard = cards.find((card) => card.id === activeId);
  if (!activeCard) return cards;

  const overGroupId = overId.startsWith("group-")
    ? overId.replace("group-", "")
    : cards.find((card) => card.id === overId)?.groupId;

  if (!overGroupId) return cards;

  const sourceGroupId = activeCard.groupId;
  const sourceCards = sortByOrder(
    cards.filter((card) => card.groupId === sourceGroupId && card.id !== activeId)
  );
  const targetBase =
    sourceGroupId === overGroupId
      ? sourceCards
      : sortByOrder(cards.filter((card) => card.groupId === overGroupId));
  const overIndex = targetBase.findIndex((card) => card.id === overId);
  const targetIndex = overIndex >= 0 ? overIndex : targetBase.length;

  const targetCards = [...targetBase];
  targetCards.splice(targetIndex, 0, { ...activeCard, groupId: overGroupId });

  const byGroup = new Map<string, BookmarkCard[]>();
  byGroup.set(sourceGroupId, sourceCards);
  byGroup.set(overGroupId, targetCards);

  for (const group of groups) {
    if (!byGroup.has(group.id)) {
      byGroup.set(
        group.id,
        sortByOrder(cards.filter((card) => card.groupId === group.id))
      );
    }
  }

  return groups.flatMap((group) =>
    (byGroup.get(group.id) ?? []).map((card, index) => ({
      ...card,
      groupId: group.id,
      sortOrder: index,
    }))
  );
}

function reorderGroups(
  groups: BookmarkGroup[],
  activeId: string,
  overId: string
): BookmarkGroup[] {
  if (!activeId.startsWith("group-order-") || !overId.startsWith("group-order-")) {
    return groups;
  }
  const activeGroupId = activeId.replace("group-order-", "");
  const overGroupId = overId.replace("group-order-", "");
  const oldIndex = groups.findIndex((group) => group.id === activeGroupId);
  const newIndex = groups.findIndex((group) => group.id === overGroupId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return groups;
  return arrayMove(groups, oldIndex, newIndex).map((group, index) => ({
    ...group,
    sortOrder: index,
  }));
}

function GroupDropZone({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `group-${id}` });
  return (
    <div
      ref={setNodeRef}
      className={
        isOver
          ? "rounded-md ring-2 ring-primary/40 ring-offset-2 ring-offset-zinc-950"
          : ""
      }
    >
      {children}
    </div>
  );
}

function SortableTab({
  tab,
  isActive,
  onSelect,
  canDrag,
}: {
  tab: BookmarkTab;
  isActive: boolean;
  onSelect: () => void;
  canDrag: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: tab.id,
      disabled: !canDrag,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn("flex items-center rounded-md", isDragging && "z-10 opacity-80")}
    >
      {canDrag ? (
        <button
          type="button"
          className="px-1 text-zinc-500 hover:text-zinc-200"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${tab.name}`}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
        )}
      >
        {tab.name}
      </button>
    </div>
  );
}

function SortableGroupShell({
  groupId,
  disabled,
  children,
}: {
  groupId: string;
  disabled: boolean;
  children: (handleProps: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `group-order-${groupId}`,
      disabled,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(isDragging && "z-10")}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

async function downloadExportJson(
  data: Awaited<ReturnType<typeof exportBookmarks>>,
  filename: string
) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BookmarksPage({
  tabs: initialTabs,
  canEdit,
  isAdmin = false,
  canUseAi = false,
  canConfigureMonitoring = false,
  canViewMonitoring = false,
  userId,
  favouriteIds: initialFavouriteIds,
  initialSuggestions,
  initialPrefs,
}: BookmarksPageProps) {
  const resolvedInitialTabId =
    initialPrefs.activeBookmarkTabId &&
    initialTabs.some((tab) => tab.id === initialPrefs.activeBookmarkTabId)
      ? initialPrefs.activeBookmarkTabId
      : (initialTabs[0]?.id ?? "");

  const [tabs, setTabs] = useState<BookmarkTab[]>(sortByOrder(initialTabs));
  const [activeTabId, setActiveTabId] = useState(resolvedInitialTabId);
  const [tabDataById, setTabDataById] = useState<Record<string, TabData>>({});
  const [loadingData, setLoadingData] = useState(false);

  const [layoutMode, setLayoutMode] = useState<"grid" | "list">(
    initialPrefs.bookmarksLayoutMode
  );
  const [globalLayoutLocked, setGlobalLayoutLocked] = useState(
    initialPrefs.bookmarksGlobalLayoutLocked
  );
  const [sortMode, setSortMode] = useState<BookmarkSortMode>(
    initialPrefs.bookmarksSortMode ?? "custom"
  );
  const [filterChip, setFilterChip] = useState<BookmarkFilterChip>("all");
  const [clickStats, setClickStats] = useState<ClickStatsMap>({});
  const [healthMap, setHealthMap] = useState<HealthMap>({});
  const [flashCardIds, setFlashCardIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState(initialSuggestions ?? { frequent: [], stale: [] });

  const [search, setSearch] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [favouriteIds, setFavouriteIds] = useState<string[]>(initialFavouriteIds);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const [createTabOpen, setCreateTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [renameTabOpen, setRenameTabOpen] = useState(false);
  const [renameTabName, setRenameTabName] = useState("");

  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<BookmarkCard | null>(null);
  const [defaultGroupId, setDefaultGroupId] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogCard, setDeleteDialogCard] = useState<BookmarkCard | null>(null);
  const [deleteDialogLoading, setDeleteDialogLoading] = useState(false);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const { launch, LaunchModal } = useBookmarkLaunch("bookmarks");

  const tabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );
  const contentSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const tabData = activeTabId ? tabDataById[activeTabId] : undefined;
  const groups = useMemo(() => sortByOrder(tabData?.groups ?? []), [tabData?.groups]);
  const cards = useMemo(() => tabData?.cards ?? [], [tabData?.cards]);

  const tabLayoutLocked = activeTab?.layoutLocked ?? false;
  const effectiveLocked = globalLayoutLocked || tabLayoutLocked;

  const tagFilters = useMemo(() => {
    const tags = new Set<string>();
    for (const card of cards) {
      for (const tag of card.tags ?? []) tags.add(tag);
    }
    return [...tags].sort();
  }, [cards]);

  const visibleCards = useMemo(() => {
    const query = search.trim();
    const searched = cards.filter((card) => fuzzyMatchCard(query, card));
    const filtered = filterBookmarkCards(searched, filterChip, clickStats, healthMap);
    return sortBookmarkCards(filtered, sortMode, clickStats, healthMap);
  }, [cards, search, filterChip, clickStats, healthMap, sortMode]);

  const matchCount = visibleCards.length;
  const totalCount = cards.length;

  const loadTabData = useCallback(
    async (tabId: string, includeArchived = showArchived, force = false) => {
      setLoadingData(true);
      try {
        const data = await getBookmarkTabData(tabId, includeArchived);
        const sortedCards = sortByOrder(data.cards);
        const cardIds = sortedCards.map((c) => c.id);

        const [stats, health]: [ClickStatsMap, HealthMap] = await Promise.all([
          getUserBookmarkClickCounts(userId, cardIds),
          canViewMonitoring
            ? getCardHealthMap(cardIds)
            : Promise.resolve({} as HealthMap),
        ]);

        setClickStats((prev) => ({ ...prev, ...stats }));
        setHealthMap((prev) => {
          const next = { ...prev, ...health };
          const changed = new Set<string>();
          for (const id of cardIds) {
            const prevStatus = prev[id]?.status;
            const nextStatus = health[id]?.status;
            if (prevStatus && nextStatus && prevStatus !== nextStatus) {
              changed.add(id);
            }
          }
          if (changed.size) {
            setFlashCardIds(changed);
            setTimeout(() => setFlashCardIds(new Set()), 2000);
          }
          return next;
        });

        setTabDataById((prev) => {
          if (!force && prev[tabId]) return prev;
          return {
            ...prev,
            [tabId]: {
              groups: sortByOrder(data.groups),
              cards: sortedCards,
            },
          };
        });
      } catch {
        toast.error("Failed to load bookmarks for tab");
      } finally {
        setLoadingData(false);
      }
    },
    [showArchived, userId, canViewMonitoring]
  );

  useEffect(() => {
    void getSmartBookmarkSuggestions()
      .then(setSuggestions)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeTabId) return;
    void loadTabData(activeTabId, showArchived, true);
  }, [activeTabId, showArchived, loadTabData]);

  function updateActiveTabData(updater: (value: TabData) => TabData) {
    if (!activeTabId) return;
    setTabDataById((prev) => {
      const current = prev[activeTabId];
      if (!current) return prev;
      return {
        ...prev,
        [activeTabId]: updater(current),
      };
    });
  }

  function visibleCardsForGroup(groupId: string) {
    return sortByOrder(
      visibleCards.filter((card) => card.groupId === groupId)
    );
  }

  async function persistActiveTab(tabId: string) {
    try {
      await updateBookmarkPreferences({ activeBookmarkTabId: tabId });
    } catch {
      toast.error("Failed to save tab preference");
    }
  }

  async function handleTabChange(tabId: string) {
    setActiveTabId(tabId);
    setSelectedCardIds([]);
    await persistActiveTab(tabId);
  }

  async function handleSortModeChange(mode: BookmarkSortMode) {
    const previous = sortMode;
    setSortMode(mode);
    try {
      await updateBookmarkPreferences({ bookmarksSortMode: mode });
    } catch {
      setSortMode(previous);
      toast.error("Failed to save sort preference");
    }
  }

  async function handleLayoutModeChange(mode: "grid" | "list") {
    const previous = layoutMode;
    setLayoutMode(mode);
    try {
      await updateBookmarkPreferences({ bookmarksLayoutMode: mode });
    } catch {
      setLayoutMode(previous);
      toast.error("Failed to save layout preference");
    }
  }

  async function handleGlobalLayoutLockedChange(checked: boolean) {
    const previous = globalLayoutLocked;
    setGlobalLayoutLocked(checked);
    try {
      await updateBookmarkPreferences({ bookmarksGlobalLayoutLocked: checked });
      toast.success(checked ? "Global layout locked" : "Global layout unlocked");
    } catch {
      setGlobalLayoutLocked(previous);
      toast.error("Failed to update global layout lock");
    }
  }

  async function handleTabLayoutLockedChange(checked: boolean) {
    if (!activeTabId || !activeTab) return;
    const previous = activeTab.layoutLocked;
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId ? { ...tab, layoutLocked: checked } : tab
      )
    );
    try {
      await updateBookmarkTab(activeTabId, { layoutLocked: checked });
      toast.success(checked ? "Tab layout locked" : "Tab layout unlocked");
    } catch {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId ? { ...tab, layoutLocked: previous } : tab
        )
      );
      toast.error("Failed to update tab layout lock");
    }
  }

  async function refreshTabs() {
    const updated = sortByOrder(await getBookmarkTabs());
    setTabs(updated);
    if (!updated.some((tab) => tab.id === activeTabId)) {
      const nextTabId = updated[0]?.id ?? "";
      setActiveTabId(nextTabId);
      if (nextTabId) await persistActiveTab(nextTabId);
    }
  }

  async function handleCreateTab() {
    const name = newTabName.trim();
    if (!name) return;
    try {
      const created = await createBookmarkTab({ name });
      setTabs((prev) => sortByOrder([...prev, created]));
      setNewTabName("");
      setCreateTabOpen(false);
      setActiveTabId(created.id);
      await persistActiveTab(created.id);
      toast.success("Tab created");
    } catch {
      toast.error("Failed to create tab");
    }
  }

  async function handleRenameTab() {
    if (!activeTabId || !activeTab) return;
    const name = renameTabName.trim();
    if (!name || name === activeTab.name) {
      setRenameTabOpen(false);
      return;
    }
    const previous = activeTab.name;
    setTabs((prev) =>
      prev.map((tab) => (tab.id === activeTabId ? { ...tab, name } : tab))
    );
    try {
      await updateBookmarkTab(activeTabId, { name });
      setRenameTabOpen(false);
      toast.success("Tab renamed");
    } catch {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId ? { ...tab, name: previous } : tab
        )
      );
      toast.error("Failed to rename tab");
    }
  }

  async function handleDeleteActiveTab() {
    if (!activeTabId || tabs.length <= 1) return;
    if (!window.confirm("Delete this tab and all its groups/cards?")) return;

    const deletingId = activeTabId;
    const fallbackTab = tabs.find((tab) => tab.id !== deletingId);

    setTabs((prev) => prev.filter((tab) => tab.id !== deletingId));
    if (fallbackTab) {
      setActiveTabId(fallbackTab.id);
      await persistActiveTab(fallbackTab.id);
    }

    try {
      await deleteBookmarkTab(deletingId);
      setTabDataById((prev) => {
        const next = { ...prev };
        delete next[deletingId];
        return next;
      });
      toast.success("Tab deleted");
    } catch {
      await refreshTabs();
      toast.error("Failed to delete tab");
    }
  }

  async function handleTabDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
    const newIndex = tabs.findIndex((tab) => tab.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const fallback = tabs;
    const nextTabs = arrayMove(tabs, oldIndex, newIndex).map((tab, index) => ({
      ...tab,
      sortOrder: index,
    }));
    setTabs(nextTabs);

    try {
      await reorderBookmarkTabs({ tabIds: nextTabs.map((tab) => tab.id) });
    } catch {
      setTabs(fallback);
      toast.error("Failed to reorder tabs");
    }
  }

  async function handleCreateGroup() {
    if (!activeTabId || !canEdit) return;
    const name = window.prompt("Group name");
    if (!name?.trim()) return;

    const optimistic: BookmarkGroup = {
      id: crypto.randomUUID(),
      tabId: activeTabId,
      name: name.trim(),
      description: null,
      icon: null,
      collapsed: false,
      sortOrder: groups.length,
    };
    updateActiveTabData((value) => ({
      ...value,
      groups: [...value.groups, optimistic],
    }));

    try {
      const created = await createBookmarkGroup({
        tabId: activeTabId,
        name: name.trim(),
      });
      updateActiveTabData((value) => ({
        ...value,
        groups: [
          ...value.groups.filter((group) => group.id !== optimistic.id),
          created,
        ],
      }));
      toast.success("Group created");
    } catch {
      updateActiveTabData((value) => ({
        ...value,
        groups: value.groups.filter((group) => group.id !== optimistic.id),
      }));
      toast.error("Failed to create group");
    }
  }

  async function handleToggleGroupCollapsed(group: BookmarkGroup) {
    updateActiveTabData((value) => ({
      ...value,
      groups: value.groups.map((entry) =>
        entry.id === group.id ? { ...entry, collapsed: !entry.collapsed } : entry
      ),
    }));
    try {
      await updateBookmarkGroup(group.id, { collapsed: !group.collapsed });
    } catch {
      updateActiveTabData((value) => ({
        ...value,
        groups: value.groups.map((entry) =>
          entry.id === group.id ? group : entry
        ),
      }));
      toast.error("Failed to toggle group");
    }
  }

  async function handleRenameGroup(group: BookmarkGroup) {
    if (!canEdit) return;
    const name = window.prompt("Group name", group.name)?.trim();
    if (!name || name === group.name) return;
    const previous = group.name;
    updateActiveTabData((value) => ({
      ...value,
      groups: value.groups.map((entry) =>
        entry.id === group.id ? { ...entry, name } : entry
      ),
    }));
    try {
      await updateBookmarkGroup(group.id, { name });
      toast.success("Group updated");
    } catch {
      updateActiveTabData((value) => ({
        ...value,
        groups: value.groups.map((entry) =>
          entry.id === group.id ? { ...entry, name: previous } : entry
        ),
      }));
      toast.error("Failed to rename group");
    }
  }

  async function handleDeleteGroup(group: BookmarkGroup) {
    if (!canEdit) return;
    if (!window.confirm(`Delete empty group "${group.name}"?`)) return;
    const previousGroups = groups;
    updateActiveTabData((value) => ({
      ...value,
      groups: value.groups.filter((entry) => entry.id !== group.id),
    }));
    try {
      await deleteBookmarkGroup(group.id);
      toast.success("Group deleted");
    } catch {
      updateActiveTabData(() => ({ groups: previousGroups, cards }));
      toast.error("Group must be empty before deletion");
    }
  }

  async function handleSaveCard(input: BookmarkFormInput) {
    if (!activeTabId) return;

    if (editingCard) {
      const original = editingCard;
      const optimistic: BookmarkCard = {
        ...editingCard,
        groupId: input.groupId,
        title: input.title,
        description: input.description ?? null,
        url: input.url,
        icon: input.iconValue ?? null,
        iconType: input.iconType,
        iconValue: input.iconValue ?? null,
        accentColor: input.accentColor,
        openInIframe: input.openInIframe,
        enabled: input.enabled,
        tags: input.tags ?? [],
        faviconPath: input.faviconPath ?? null,
        autoTitle: input.autoTitle ?? null,
        autoDescription: input.autoDescription ?? null,
        healthMonitoringEnabled: input.healthMonitoringEnabled ?? editingCard.healthMonitoringEnabled,
      };
      updateActiveTabData((value) => ({
        ...value,
        cards: value.cards.map((card) =>
          card.id === editingCard.id ? optimistic : card
        ),
      }));
      try {
        const updated = await updateBookmarkCard(editingCard.id, input);
        updateActiveTabData((value) => ({
          ...value,
          cards: value.cards.map((card) =>
            card.id === editingCard.id ? updated : card
          ),
        }));
        toast.success("Bookmark updated");
      } catch {
        updateActiveTabData((value) => ({
          ...value,
          cards: value.cards.map((card) =>
            card.id === editingCard.id ? original : card
          ),
        }));
        throw new Error("Failed to update bookmark");
      }
      return;
    }

    const optimistic: BookmarkCard = {
      id: crypto.randomUUID(),
      groupId: input.groupId,
      title: input.title,
      description: input.description ?? null,
      url: input.url,
      icon: input.iconValue ?? null,
      iconType: input.iconType,
      iconValue: input.iconValue ?? null,
      accentColor: input.accentColor,
      openInIframe: input.openInIframe,
      enabled: input.enabled,
      favourite: false,
      archivedAt: null,
      sortOrder: cards.filter((card) => card.groupId === input.groupId).length,
      tags: input.tags ?? [],
      faviconPath: input.faviconPath ?? null,
      autoTitle: input.autoTitle ?? null,
      autoDescription: input.autoDescription ?? null,
      healthMonitoringEnabled: false,
      linkedDeviceId: null,
      clickCount: 0,
      lastClickedAt: null,
    };
    updateActiveTabData((value) => ({
      ...value,
      cards: [...value.cards, optimistic],
    }));

    try {
      const created = await createBookmarkCard(input);
      updateActiveTabData((value) => ({
        ...value,
        cards: [
          ...value.cards.filter((card) => card.id !== optimistic.id),
          created,
        ],
      }));
      toast.success("Bookmark created");
    } catch {
      updateActiveTabData((value) => ({
        ...value,
        cards: value.cards.filter((card) => card.id !== optimistic.id),
      }));
      throw new Error("Failed to create bookmark");
    }
  }

  async function toggleCardEnabled(card: BookmarkCard) {
    const optimistic = { ...card, enabled: !card.enabled };
    updateActiveTabData((value) => ({
      ...value,
      cards: value.cards.map((entry) =>
        entry.id === card.id ? optimistic : entry
      ),
    }));
    try {
      const updated = await updateBookmarkCard(card.id, {
        enabled: !card.enabled,
      });
      updateActiveTabData((value) => ({
        ...value,
        cards: value.cards.map((entry) =>
          entry.id === card.id ? updated : entry
        ),
      }));
    } catch {
      updateActiveTabData((value) => ({
        ...value,
        cards: value.cards.map((entry) =>
          entry.id === card.id ? card : entry
        ),
      }));
      toast.error("Failed to update bookmark");
    }
  }

  async function handleToggleFavourite(cardId: string) {
    const wasFavourited = favouriteIds.includes(cardId);
    setFavouriteIds((prev) =>
      wasFavourited ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
    try {
      await toggleUserFavourite(cardId);
    } catch (error) {
      setFavouriteIds((prev) =>
        wasFavourited ? [...prev, cardId] : prev.filter((id) => id !== cardId)
      );
      toast.error(
        error instanceof Error ? error.message : "Failed to update favourite"
      );
    }
  }

  async function handleDuplicateCard(card: BookmarkCard) {
    try {
      const duplicated = await duplicateBookmarkCard(card.id);
      updateActiveTabData((value) => ({
        ...value,
        cards: sortByOrder([...value.cards, duplicated]),
      }));
      toast.success("Bookmark duplicated");
    } catch {
      toast.error("Failed to duplicate bookmark");
    }
  }

  async function handleRestoreCard(card: BookmarkCard) {
    const previous = cards;
    const existsInList = cards.some((entry) => entry.id === card.id);
    updateActiveTabData((value) => ({
      ...value,
      cards: existsInList
        ? value.cards.map((entry) =>
            entry.id === card.id ? { ...entry, archivedAt: null } : entry
          )
        : sortByOrder([...value.cards, { ...card, archivedAt: null }]),
    }));
    try {
      const restored = await restoreBookmarkCard(card.id);
      updateActiveTabData((value) => ({
        ...value,
        cards: value.cards.some((entry) => entry.id === card.id)
          ? value.cards.map((entry) =>
              entry.id === card.id ? restored : entry
            )
          : sortByOrder([...value.cards, restored]),
      }));
      toast.success(`"${card.title}" restored`);
    } catch {
      updateActiveTabData((value) => ({ ...value, cards: previous }));
      toast.error("Failed to restore bookmark");
    }
  }

  async function handleArchiveCard(card: BookmarkCard) {
    const previous = cards;
    updateActiveTabData((value) => ({
      ...value,
      cards: value.cards.filter((entry) => entry.id !== card.id),
    }));
    setFavouriteIds((prev) => prev.filter((id) => id !== card.id));

    try {
      await archiveBookmarkCard(card.id);
      toast.success(`"${card.title}" archived`, {
        action: {
          label: "Undo",
          onClick: () => void handleRestoreCard(card),
        },
      });
    } catch {
      updateActiveTabData((value) => ({ ...value, cards: previous }));
      toast.error("Failed to archive bookmark");
    }
  }

  function openDeleteDialog(card: BookmarkCard) {
    setDeleteDialogCard(card);
    setDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!deleteDialogCard) return;
    const card = deleteDialogCard;
    const previous = cards;
    setDeleteDialogLoading(true);
    updateActiveTabData((value) => ({
      ...value,
      cards: value.cards.filter((entry) => entry.id !== card.id),
    }));
    setFavouriteIds((prev) => prev.filter((id) => id !== card.id));

    try {
      await deleteBookmarkCard(card.id);
      setDeleteDialogOpen(false);
      setDeleteDialogCard(null);
      toast.success(`"${card.title}" deleted permanently`);
    } catch {
      updateActiveTabData((value) => ({ ...value, cards: previous }));
      toast.error("Failed to delete bookmark");
    } finally {
      setDeleteDialogLoading(false);
    }
  }

  async function handleBulkEnableMonitoring() {
    if (!selectedCardIds.length || !canConfigureMonitoring) return;
    try {
      await bulkBookmarkCardAction({
        cardIds: selectedCardIds,
        action: "enable_monitoring",
      });
      if (activeTabId) await loadTabData(activeTabId, showArchived, true);
      setSelectedCardIds([]);
      toast.success("Health monitoring enabled on selected cards");
    } catch {
      toast.error("Failed to enable monitoring");
    }
  }

  async function handleBulk(action: "enable" | "disable" | "archive" | "delete") {
    if (!selectedCardIds.length || !canEdit) return;

    const previous = cards;
    const selectedCards = cards.filter((card) =>
      selectedCardIds.includes(card.id)
    );

    if (action === "delete") {
      if (
        !window.confirm(
          `Permanently delete ${selectedCardIds.length} bookmark${
            selectedCardIds.length === 1 ? "" : "s"
          }?`
        )
      ) {
        return;
      }
    }

    updateActiveTabData((value) => {
      if (action === "delete" || action === "archive") {
        return {
          ...value,
          cards: value.cards.filter(
            (card) => !selectedCardIds.includes(card.id)
          ),
        };
      }
      return {
        ...value,
        cards: value.cards.map((card) =>
          selectedCardIds.includes(card.id)
            ? { ...card, enabled: action === "enable" }
            : card
        ),
      };
    });

    if (action === "archive" || action === "delete") {
      setFavouriteIds((prev) =>
        prev.filter((id) => !selectedCardIds.includes(id))
      );
    }

    try {
      await bulkBookmarkCardAction({ cardIds: selectedCardIds, action });
      const ids = [...selectedCardIds];
      setSelectedCardIds([]);

      if (action === "archive") {
        toast.success(`${ids.length} bookmark${ids.length === 1 ? "" : "s"} archived`, {
          action: {
            label: "Undo",
            onClick: () => {
              void (async () => {
                try {
                  await bulkBookmarkCardAction({
                    cardIds: ids,
                    action: "restore",
                  });
                  if (activeTabId) await loadTabData(activeTabId, true);
                  toast.success("Bookmarks restored");
                } catch {
                  toast.error("Failed to restore bookmarks");
                }
              })();
            },
          },
        });
      } else {
        toast.success("Bulk action applied");
      }
    } catch {
      updateActiveTabData((value) => ({ ...value, cards: previous }));
      if (action === "archive") {
        setFavouriteIds((prev) => [
          ...new Set([
            ...prev,
            ...selectedCards
              .filter((card) => favouriteIds.includes(card.id))
              .map((card) => card.id),
          ]),
        ]);
      }
      toast.error("Bulk action failed");
    }
  }

  async function handleBulkMoveGroup(groupId: string) {
    if (!selectedCardIds.length || !canEdit) return;
    const previous = cards;
    updateActiveTabData((value) => ({
      ...value,
      cards: value.cards.map((card) =>
        selectedCardIds.includes(card.id) ? { ...card, groupId } : card
      ),
    }));
    try {
      await bulkBookmarkCardAction({
        cardIds: selectedCardIds,
        action: "enable",
        groupId,
      });
      setSelectedCardIds([]);
      toast.success("Moved to group");
    } catch {
      updateActiveTabData((value) => ({ ...value, cards: previous }));
      toast.error("Failed to move bookmarks");
    }
  }

  async function handleBulkMoveTab(tabId: string) {
    if (!selectedCardIds.length || !canEdit) return;
    const previous = cards;
    const movingIds = [...selectedCardIds];
    updateActiveTabData((value) => ({
      ...value,
      cards: value.cards.filter((card) => !movingIds.includes(card.id)),
    }));
    try {
      await bulkBookmarkCardAction({
        cardIds: movingIds,
        action: "enable",
        tabId,
      });
      setSelectedCardIds([]);
      await loadTabData(tabId, true);
      toast.success("Moved to tab");
    } catch {
      updateActiveTabData((value) => ({ ...value, cards: previous }));
      toast.error("Failed to move bookmarks");
    }
  }

  async function handleExportAll() {
    try {
      const data = await exportBookmarks();
      await downloadExportJson(
        data,
        `bookmarks-export-${new Date().toISOString()}.json`
      );
      toast.success("Bookmarks exported");
    } catch {
      toast.error("Export failed");
    }
  }

  async function handleExportCurrentTab() {
    if (!activeTabId) return;
    try {
      const data = await exportBookmarks({ tabId: activeTabId });
      await downloadExportJson(
        data,
        `bookmarks-tab-${activeTab?.name ?? activeTabId}-${new Date().toISOString()}.json`
      );
      toast.success("Tab exported");
    } catch {
      toast.error("Export failed");
    }
  }

  async function handleExportSelected() {
    if (!selectedCardIds.length) return;
    try {
      const data = await exportBookmarks({ cardIds: selectedCardIds });
      await downloadExportJson(
        data,
        `bookmarks-selected-${new Date().toISOString()}.json`
      );
      toast.success("Selection exported");
    } catch {
      toast.error("Export failed");
    }
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      setImportJson(text);
      setImportDialogOpen(true);
    } catch {
      toast.error("Failed to read import file");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function handleImportComplete() {
    await refreshTabs();
    if (activeTabId) await loadTabData(activeTabId, true);
    toast.success("Bookmarks imported");
  }

  async function syncCardReorder(
    nextCards: BookmarkCard[],
    fallback: BookmarkCard[]
  ) {
    updateActiveTabData((value) => ({ ...value, cards: nextCards }));
    try {
      await reorderBookmarkItems({
        items: nextCards.map((card) => ({
          id: card.id,
          groupId: card.groupId,
          sortOrder: card.sortOrder,
        })),
      });
    } catch {
      updateActiveTabData((value) => ({ ...value, cards: fallback }));
      toast.error("Failed to persist card order");
    }
  }

  async function syncGroupReorder(
    nextGroups: BookmarkGroup[],
    fallback: BookmarkGroup[]
  ) {
    updateActiveTabData((value) => ({ ...value, groups: nextGroups }));
    try {
      await reorderBookmarkItems({
        items: nextGroups.map((group, index) => ({
          id: group.id,
          sortOrder: index,
        })),
      });
    } catch {
      updateActiveTabData((value) => ({ ...value, groups: fallback }));
      toast.error("Failed to persist group order");
    }
  }

  function handleContentDragStart(event: DragStartEvent) {
    if (effectiveLocked) {
      toast.error("Layout is locked — unlock to rearrange items");
      return;
    }
    setActiveDragId(String(event.active.id));
  }

  function handleContentDragOver(event: DragOverEvent) {
    if (effectiveLocked || !tabData || !event.over) return;

    const activeId = String(event.active.id);
    const overId = String(event.over.id);

    if (activeId.startsWith("group-order-")) {
      const nextGroups = reorderGroups(groups, activeId, overId);
      if (nextGroups !== groups) {
        updateActiveTabData((value) => ({ ...value, groups: nextGroups }));
      }
      return;
    }

    if (!activeDragId || activeId.startsWith("group-order-")) return;

    const nextCards = moveCard(tabData.cards, groups, activeId, overId);
    if (nextCards !== tabData.cards) {
      updateActiveTabData((value) => ({ ...value, cards: nextCards }));
    }
  }

  async function handleContentDragEnd(event: DragEndEvent) {
    if (effectiveLocked || !tabData || !event.over) {
      setActiveDragId(null);
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);

    if (activeId.startsWith("group-order-")) {
      const fallback = groups;
      const nextGroups = reorderGroups(groups, activeId, overId);
      if (nextGroups !== groups) {
        await syncGroupReorder(nextGroups, fallback);
      }
      setActiveDragId(null);
      return;
    }

    const fallback = tabData.cards;
    const nextCards = moveCard(tabData.cards, groups, activeId, overId);
    if (nextCards !== tabData.cards) {
      await syncCardReorder(nextCards, fallback);
    }
    setActiveDragId(null);
  }

  function openNewCardDialog(groupId?: string) {
    setEditingCard(null);
    setDefaultGroupId(groupId ?? groups[0]?.id ?? "");
    setCardDialogOpen(true);
  }

  const showNoGroupsState =
    tabs.length > 0 && !loadingData && activeTabId && groups.length === 0 && !search;
  const showNoCardsState =
    tabs.length > 0 &&
    !loadingData &&
    groups.length > 0 &&
    cards.length === 0 &&
    !search &&
    !showArchived;

  const sharedDialogs = (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => void handleImportFile(event.target.files?.[0])}
      />

      <Dialog open={createTabOpen} onOpenChange={setCreateTabOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Create tab</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add a new bookmark tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-tab-name">Name</Label>
            <Input
              id="new-tab-name"
              value={newTabName}
              onChange={(event) => setNewTabName(event.target.value)}
              placeholder="Engineering"
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleCreateTab();
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateTabOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateTab()}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      <BookmarkImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        json={importJson}
        onComplete={() => void handleImportComplete()}
      />
    </>
  );

  if (!tabs.length) {
    return (
      <>
        <BookmarksEmptyState
          variant="no-tabs"
          canEdit={canEdit}
          onAddTab={() => setCreateTabOpen(true)}
          onImport={() => importInputRef.current?.click()}
        />
        {sharedDialogs}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {suggestions.frequent.length > 0 || suggestions.stale.length > 0 ? (
        <SmartSuggestionsSection
          frequent={suggestions.frequent}
          stale={suggestions.stale}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DndContext
          sensors={tabSensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => void handleTabDragEnd(event)}
        >
          <SortableContext
            items={tabs.map((tab) => tab.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex max-w-full flex-wrap items-center gap-1 rounded-lg bg-zinc-900 p-1">
              {tabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  onSelect={() => void handleTabChange(tab.id)}
                  canDrag={canEdit}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateTabOpen(true)}
            >
              <Plus className="h-4 w-4" />
              New tab
            </Button>
          ) : null}
          <TabActions
            canEdit={canEdit}
            isAdmin={isAdmin}
            onRename={() => {
              setRenameTabName(activeTab?.name ?? "");
              setRenameTabOpen(true);
            }}
            onDelete={() => void handleDeleteActiveTab()}
            onShare={() => setShareDialogOpen(true)}
            disableDelete={tabs.length <= 1}
          />
        </div>
      </div>

      <BookmarksToolbar
        search={search}
        onSearchChange={setSearch}
        matchCount={matchCount}
        totalCount={totalCount}
        bulkMode={bulkMode}
        onBulkModeChange={(value) => {
          setBulkMode(value);
          if (!value) setSelectedCardIds([]);
        }}
        layoutMode={layoutMode}
        onLayoutModeChange={(value) => void handleLayoutModeChange(value)}
        layoutLocked={tabLayoutLocked}
        globalLayoutLocked={globalLayoutLocked}
        onGlobalLayoutLockedChange={(value) =>
          void handleGlobalLayoutLockedChange(value)
        }
        onTabLayoutLockedChange={(value) =>
          void handleTabLayoutLockedChange(value)
        }
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        sortMode={sortMode}
        onSortModeChange={(value) => void handleSortModeChange(value)}
        filterChip={filterChip}
        onFilterChipChange={setFilterChip}
        tagFilters={tagFilters}
        canEdit={canEdit}
        hasGroups={groups.length > 0}
        onNewCard={() => openNewCardDialog()}
        onNewGroup={() => void handleCreateGroup()}
        onExport={() => void handleExportCurrentTab()}
        onImport={() => importInputRef.current?.click()}
      />

      {bulkMode ? (
        <BulkToolbar
          count={selectedCardIds.length}
          canEdit={canEdit}
          groups={groups.map((group) => ({ id: group.id, name: group.name }))}
          tabs={tabs.map((tab) => ({ id: tab.id, name: tab.name }))}
          activeTabId={activeTabId}
          onEnable={() => void handleBulk("enable")}
          onDisable={() => void handleBulk("disable")}
          onArchive={() => void handleBulk("archive")}
          onDelete={() => void handleBulk("delete")}
          onExportSelected={() => void handleExportSelected()}
          onMoveGroup={(groupId) => void handleBulkMoveGroup(groupId)}
          onMoveTab={(tabId) => void handleBulkMoveTab(tabId)}
          canConfigureMonitoring={canConfigureMonitoring}
          onEnableMonitoring={() => void handleBulkEnableMonitoring()}
        />
      ) : null}

      {loadingData ? (
        <BookmarksSkeleton layoutMode={layoutMode} />
      ) : showNoGroupsState ? (
        <BookmarksEmptyState
          variant="no-groups"
          canEdit={canEdit}
          onAddGroup={() => void handleCreateGroup()}
          onImport={() => importInputRef.current?.click()}
        />
      ) : showNoCardsState ? (
        <BookmarksEmptyState
          variant="no-cards"
          canEdit={canEdit}
          onAddCard={() => openNewCardDialog()}
          onImport={() => importInputRef.current?.click()}
        />
      ) : (
        <DndContext
          sensors={contentSensors}
          collisionDetection={closestCenter}
          onDragStart={handleContentDragStart}
          onDragOver={handleContentDragOver}
          onDragEnd={(event) => void handleContentDragEnd(event)}
        >
          <SortableContext
            items={groups.map((group) => `group-order-${group.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div
              className={cn(
                layoutMode === "list"
                  ? "space-y-4"
                  : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              )}
            >
              {groups.map((group) => {
                const groupCards = visibleCardsForGroup(group.id);
                const groupHasVisibleCards = groupCards.length > 0;
                const showGroupEmpty =
                  !group.collapsed && !groupHasVisibleCards;

                return (
                  <SortableGroupShell
                    key={group.id}
                    groupId={group.id}
                    disabled={effectiveLocked || !canEdit}
                  >
                    {({ attributes, listeners }) => (
                      <Card className="border-zinc-800 bg-zinc-950/70">
                        <CardContent className="space-y-3 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1">
                              {canEdit && !effectiveLocked ? (
                                <button
                                  type="button"
                                  className="shrink-0 text-zinc-500 hover:text-zinc-200"
                                  {...attributes}
                                  {...listeners}
                                  aria-label={`Reorder ${group.name}`}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="truncate text-left text-sm font-medium text-zinc-100"
                                onClick={() =>
                                  void handleToggleGroupCollapsed(group)
                                }
                              >
                                {group.collapsed ? "▸" : "▾"} {group.name}
                              </button>
                            </div>
                            {canEdit ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handleRenameGroup(group)}
                                >
                                  Rename
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void handleDeleteGroup(group)}
                                >
                                  Delete
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          {group.collapsed ? null : (
                            <GroupDropZone id={group.id}>
                              <SortableContext
                                items={groupCards.map((card) => card.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                <div
                                  className={cn(
                                    layoutMode === "list" ? "space-y-2" : "space-y-2"
                                  )}
                                >
                                  {groupCards.map((card) => (
                                    <div
                                      key={card.id}
                                      className={cn(
                                        card.archivedAt && "opacity-75"
                                      )}
                                    >
                                      {card.archivedAt ? (
                                        <div className="mb-1 flex justify-end">
                                          <Badge
                                            variant="secondary"
                                            className="bg-zinc-800 text-zinc-300"
                                          >
                                            Archived
                                          </Badge>
                                        </div>
                                      ) : null}
                                      <BookmarkCardItem
                                        card={card}
                                        draggable={
                                          canEdit &&
                                          !effectiveLocked &&
                                          !card.archivedAt &&
                                          sortMode === "custom"
                                        }
                                        bulkMode={bulkMode}
                                        selected={selectedCardIds.includes(
                                          card.id
                                        )}
                                        isFavourited={favouriteIds.includes(
                                          card.id
                                        )}
                                        layoutMode={layoutMode}
                                        clickStats={clickStats[card.id]}
                                        healthInfo={
                                          card.healthMonitoringEnabled
                                            ? healthMap[card.id]
                                            : undefined
                                        }
                                        statusFlash={flashCardIds.has(card.id)}
                                        onSelectedChange={(checked) => {
                                          setSelectedCardIds((prev) =>
                                            checked
                                              ? [
                                                  ...new Set([
                                                    ...prev,
                                                    card.id,
                                                  ]),
                                                ]
                                              : prev.filter(
                                                  (id) => id !== card.id
                                                )
                                          );
                                        }}
                                        onLaunch={() => void launch(card)}
                                        onEdit={() => {
                                          setEditingCard(card);
                                          setDefaultGroupId(card.groupId);
                                          setCardDialogOpen(true);
                                        }}
                                        onDuplicate={
                                          canEdit && !card.archivedAt
                                            ? () =>
                                                void handleDuplicateCard(card)
                                            : undefined
                                        }
                                        onArchive={
                                          canEdit && !card.archivedAt
                                            ? () => void handleArchiveCard(card)
                                            : undefined
                                        }
                                        onDelete={
                                          canEdit
                                            ? () => openDeleteDialog(card)
                                            : undefined
                                        }
                                        onToggleFavourite={() =>
                                          void handleToggleFavourite(card.id)
                                        }
                                        onToggleEnabled={
                                          canEdit && !card.archivedAt
                                            ? () => void toggleCardEnabled(card)
                                            : undefined
                                        }
                                      />
                                      {card.archivedAt && canEdit ? (
                                        <div className="mt-1 flex justify-end">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                              void handleRestoreCard(card)
                                            }
                                          >
                                            Restore
                                          </Button>
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}

                                  {showGroupEmpty ? (
                                    <div className="rounded-md border border-dashed border-zinc-700 p-4 text-center text-xs text-zinc-500">
                                      {search
                                        ? "No matches in this group"
                                        : "Drop cards here"}
                                    </div>
                                  ) : null}
                                </div>
                              </SortableContext>
                            </GroupDropZone>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </SortableGroupShell>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {search && !loadingData && matchCount === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/50 px-6 py-8 text-center text-sm text-zinc-400">
          No bookmarks match your search.
        </div>
      ) : null}

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => void handleImportFile(event.target.files?.[0])}
      />

      <Dialog open={createTabOpen} onOpenChange={setCreateTabOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Create tab</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add a new bookmark tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-tab-name-main">Name</Label>
            <Input
              id="new-tab-name-main"
              value={newTabName}
              onChange={(event) => setNewTabName(event.target.value)}
              placeholder="Engineering"
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleCreateTab();
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateTabOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateTab()}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      <BookmarkImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        json={importJson}
        onComplete={() => void handleImportComplete()}
      />

      <Dialog open={renameTabOpen} onOpenChange={setRenameTabOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Rename tab</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update the name of the active tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-tab-name">Name</Label>
            <Input
              id="rename-tab-name"
              value={renameTabName}
              onChange={(event) => setRenameTabName(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenameTabOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleRenameTab()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <BookmarkEditDialog
        open={cardDialogOpen}
        onOpenChange={(open) => {
          setCardDialogOpen(open);
          if (!open) setEditingCard(null);
        }}
        groups={groups}
        defaultGroupId={defaultGroupId || groups[0]?.id}
        activeTabName={activeTab?.name}
        card={editingCard}
        canEdit={canEdit}
        canUseAi={canUseAi}
        canConfigureMonitoring={canConfigureMonitoring}
        isFavourited={
          editingCard ? favouriteIds.includes(editingCard.id) : false
        }
        onSubmit={handleSaveCard}
        onHealthChange={(cardId, enabled) => {
          if (activeTabId) void loadTabData(activeTabId, showArchived, true);
          if (enabled) {
            void getCardHealthMap([cardId]).then((map) =>
              setHealthMap((prev) => ({ ...prev, ...map }))
            );
          } else {
            setHealthMap((prev) => {
              const next = { ...prev };
              delete next[cardId];
              return next;
            });
          }
        }}
        onDuplicate={
          canEdit && editingCard
            ? async (card) => {
                await handleDuplicateCard(card);
                setCardDialogOpen(false);
              }
            : undefined
        }
        onArchive={
          canEdit && editingCard && !editingCard.archivedAt
            ? (card) => {
                setCardDialogOpen(false);
                void handleArchiveCard(card);
              }
            : undefined
        }
        onDelete={
          canEdit && editingCard
            ? (card) => {
                setCardDialogOpen(false);
                openDeleteDialog(card);
              }
            : undefined
        }
        onToggleFavourite={
          editingCard
            ? (cardId) => handleToggleFavourite(cardId)
            : undefined
        }
      />

      <BookmarkDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        card={deleteDialogCard}
        mode="delete"
        loading={deleteDialogLoading}
        onConfirm={handleConfirmDelete}
      />

      {canEdit ? (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500"
            onClick={() => void handleExportAll()}
          >
            Export all tabs
          </Button>
        </div>
      ) : null}

      {LaunchModal}

      <BookmarkShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        resourceType="tab"
        resourceId={activeTabId}
        resourceName={activeTab?.name ?? "Tab"}
      />

      {activeDragId ? <div className="sr-only">{activeDragId}</div> : null}
    </div>
  );
}
