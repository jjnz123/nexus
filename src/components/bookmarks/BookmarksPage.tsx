"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  Download,
  FileUp,
  FolderPlus,
  Lock,
  LockOpen,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  bulkBookmarkCardAction,
  createBookmarkCard,
  createBookmarkGroup,
  createBookmarkTab,
  deleteBookmarkGroup,
  deleteBookmarkTab,
  exportBookmarks,
  getBookmarkTabData,
  getBookmarkTabs,
  importBookmarks,
  reorderBookmarkItems,
  updateBookmarkCard,
  updateBookmarkGroup,
  updateBookmarkTab,
} from "@/server/actions/bookmarks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { BookmarkCard, BookmarkGroup, BookmarkTab } from "@/lib/db/schema";
import { BookmarkCardItem } from "./BookmarkCardItem";
import { BookmarkEditDialog } from "./BookmarkEditDialog";

type TabData = {
  groups: BookmarkGroup[];
  cards: BookmarkCard[];
};

type BookmarksPageProps = {
  tabs: BookmarkTab[];
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
  const targetBase = sourceGroupId === overGroupId ? sourceCards : sortByOrder(cards.filter((card) => card.groupId === overGroupId));
  const overIndex = targetBase.findIndex((card) => card.id === overId);
  const targetIndex = overIndex >= 0 ? overIndex : targetBase.length;

  const targetCards = [...targetBase];
  targetCards.splice(targetIndex, 0, { ...activeCard, groupId: overGroupId });

  const byGroup = new Map<string, BookmarkCard[]>();
  byGroup.set(sourceGroupId, sourceCards);
  byGroup.set(overGroupId, targetCards);

  for (const group of groups) {
    if (!byGroup.has(group.id)) {
      byGroup.set(group.id, sortByOrder(cards.filter((card) => card.groupId === group.id)));
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
      className={isOver ? "rounded-md ring-2 ring-primary/40 ring-offset-2 ring-offset-zinc-950" : ""}
    >
      {children}
    </div>
  );
}

export function BookmarksPage({ tabs: initialTabs }: BookmarksPageProps) {
  const [tabs, setTabs] = useState<BookmarkTab[]>(sortByOrder(initialTabs));
  const [activeTabId, setActiveTabId] = useState(initialTabs[0]?.id ?? "");
  const [tabDataById, setTabDataById] = useState<Record<string, TabData>>({});
  const [loadingData, setLoadingData] = useState(false);

  const [search, setSearch] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const [createTabOpen, setCreateTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");

  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<BookmarkCard | null>(null);
  const [defaultGroupId, setDefaultGroupId] = useState<string>("");

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const tabData = activeTabId ? tabDataById[activeTabId] : undefined;
  const groups = useMemo(() => sortByOrder(tabData?.groups ?? []), [tabData?.groups]);
  const cards = useMemo(() => tabData?.cards ?? [], [tabData?.cards]);
  const layoutLocked = activeTab?.layoutLocked ?? true;

  useEffect(() => {
    if (!activeTabId) return;
    void loadTabData(activeTabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  async function loadTabData(tabId: string, force = false) {
    if (!force && tabDataById[tabId]) return;
    setLoadingData(true);
    try {
      const data = await getBookmarkTabData(tabId);
      setTabDataById((prev) => ({
        ...prev,
        [tabId]: {
          groups: sortByOrder(data.groups),
          cards: sortByOrder(data.cards),
        },
      }));
    } catch {
      toast.error("Failed to load bookmarks for tab");
    } finally {
      setLoadingData(false);
    }
  }

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
    const query = search.trim().toLowerCase();
    return sortByOrder(cards.filter((card) => card.groupId === groupId)).filter((card) => {
      if (!query) return true;
      return (
        card.title.toLowerCase().includes(query) ||
        card.url.toLowerCase().includes(query) ||
        (card.description ?? "").toLowerCase().includes(query)
      );
    });
  }

  async function handleCreateTab() {
    const name = newTabName.trim();
    if (!name) return;
    try {
      const created = await createBookmarkTab({ name });
      setTabs((prev) => [...prev, created]);
      setNewTabName("");
      setCreateTabOpen(false);
      setActiveTabId(created.id);
      toast.success("Tab created");
    } catch {
      toast.error("Failed to create tab");
    }
  }

  async function handleCreateGroup() {
    if (!activeTabId) return;
    const name = window.prompt("Group name");
    if (!name) return;

    const optimistic: BookmarkGroup = {
      id: crypto.randomUUID(),
      tabId: activeTabId,
      name,
      collapsed: false,
      sortOrder: groups.length,
    };
    updateActiveTabData((value) => ({ ...value, groups: [...value.groups, optimistic] }));

    try {
      const created = await createBookmarkGroup({ tabId: activeTabId, name });
      updateActiveTabData((value) => ({
        ...value,
        groups: [...value.groups.filter((group) => group.id !== optimistic.id), created],
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

  async function handleDeleteActiveTab() {
    if (!activeTabId || tabs.length <= 1) return;
    if (!window.confirm("Delete this tab and all its groups/cards?")) return;

    const deletingId = activeTabId;
    const fallbackTab = tabs.find((tab) => tab.id !== deletingId);

    setTabs((prev) => prev.filter((tab) => tab.id !== deletingId));
    if (fallbackTab) setActiveTabId(fallbackTab.id);

    try {
      await deleteBookmarkTab(deletingId);
      toast.success("Tab deleted");
    } catch {
      await refreshTabs();
      toast.error("Failed to delete tab");
    }
  }

  async function refreshTabs() {
    const updated = sortByOrder(await getBookmarkTabs());
    setTabs(updated);
    if (!updated.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(updated[0]?.id ?? "");
    }
  }

  async function handleToggleLayoutLock(checked: boolean) {
    if (!activeTabId || !activeTab) return;
    const previous = activeTab.layoutLocked;
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId ? { ...tab, layoutLocked: checked } : tab
      )
    );
    try {
      await updateBookmarkTab(activeTabId, { layoutLocked: checked });
      toast.success(checked ? "Layout locked" : "Layout unlocked");
    } catch {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId ? { ...tab, layoutLocked: previous } : tab
        )
      );
      toast.error("Failed to update layout lock");
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
        groups: value.groups.map((entry) => (entry.id === group.id ? group : entry)),
      }));
      toast.error("Failed to toggle group");
    }
  }

  async function handleRenameGroup(group: BookmarkGroup) {
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
    if (!window.confirm(`Delete group "${group.name}" and its cards?`)) return;
    const previousGroups = groups;
    const previousCards = cards;
    updateActiveTabData((value) => ({
      ...value,
      groups: value.groups.filter((entry) => entry.id !== group.id),
      cards: value.cards.filter((card) => card.groupId !== group.id),
    }));
    try {
      await deleteBookmarkGroup(group.id);
      toast.success("Group deleted");
    } catch {
      updateActiveTabData(() => ({ groups: previousGroups, cards: previousCards }));
      toast.error("Failed to delete group");
    }
  }

  async function handleSaveCard(input: {
    groupId: string;
    title: string;
    description?: string;
    url: string;
    icon?: string;
    enabled: boolean;
    favourite: boolean;
  }) {
    if (!activeTabId) return;
    if (editingCard) {
      const original = editingCard;
      const optimistic: BookmarkCard = { ...editingCard, ...input };
      updateActiveTabData((value) => ({
        ...value,
        cards: value.cards.map((card) => (card.id === editingCard.id ? optimistic : card)),
      }));
      try {
        const updated = await updateBookmarkCard(editingCard.id, input);
        updateActiveTabData((value) => ({
          ...value,
          cards: value.cards.map((card) => (card.id === editingCard.id ? updated : card)),
        }));
        toast.success("Bookmark updated");
      } catch {
        updateActiveTabData((value) => ({
          ...value,
          cards: value.cards.map((card) => (card.id === editingCard.id ? original : card)),
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
      icon: input.icon ?? null,
      enabled: input.enabled,
      favourite: input.favourite,
      sortOrder: cards.filter((card) => card.groupId === input.groupId).length,
    };
    updateActiveTabData((value) => ({ ...value, cards: [...value.cards, optimistic] }));

    try {
      const created = await createBookmarkCard(input);
      updateActiveTabData((value) => ({
        ...value,
        cards: [...value.cards.filter((card) => card.id !== optimistic.id), created],
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

  async function toggleCard(card: BookmarkCard, patch: Partial<BookmarkCard>) {
    const optimistic = { ...card, ...patch };
    updateActiveTabData((value) => ({
      ...value,
      cards: value.cards.map((entry) => (entry.id === card.id ? optimistic : entry)),
    }));
    try {
      const updated = await updateBookmarkCard(card.id, patch);
      updateActiveTabData((value) => ({
        ...value,
        cards: value.cards.map((entry) => (entry.id === card.id ? updated : entry)),
      }));
    } catch {
      updateActiveTabData((value) => ({
        ...value,
        cards: value.cards.map((entry) => (entry.id === card.id ? card : entry)),
      }));
      toast.error("Failed to update bookmark");
    }
  }

  async function handleBulk(action: "enable" | "disable" | "delete") {
    if (!selectedCardIds.length) return;
    const previous = cards;
    updateActiveTabData((value) => {
      if (action === "delete") {
        return {
          ...value,
          cards: value.cards.filter((card) => !selectedCardIds.includes(card.id)),
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

    try {
      await bulkBookmarkCardAction({ cardIds: selectedCardIds, action });
      setSelectedCardIds([]);
      toast.success("Bulk action applied");
    } catch {
      updateActiveTabData((value) => ({ ...value, cards: previous }));
      toast.error("Bulk action failed");
    }
  }

  async function handleExport() {
    try {
      const data = await exportBookmarks();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookmarks-export-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Bookmarks exported");
    } catch {
      toast.error("Export failed");
    }
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      await importBookmarks(text);
      await refreshTabs();
      if (activeTabId) await loadTabData(activeTabId, true);
      toast.success("Bookmarks imported");
    } catch {
      toast.error("Import failed");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function syncCardReorder(nextCards: BookmarkCard[], fallback: BookmarkCard[]) {
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

  function handleDragStart(event: DragStartEvent) {
    if (layoutLocked) return;
    setActiveDragId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    if (layoutLocked || !tabData || !activeDragId || !event.over) return;
    const nextCards = moveCard(
      tabData.cards,
      sortByOrder(tabData.groups),
      String(event.active.id),
      String(event.over.id)
    );
    if (nextCards !== tabData.cards) {
      updateActiveTabData((value) => ({ ...value, cards: nextCards }));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (layoutLocked || !tabData || !event.over) {
      setActiveDragId(null);
      return;
    }

    const fallback = tabData.cards;
    const nextCards = moveCard(
      tabData.cards,
      sortByOrder(tabData.groups),
      String(event.active.id),
      String(event.over.id)
    );

    if (nextCards !== tabData.cards) {
      await syncCardReorder(nextCards, fallback);
    }
    setActiveDragId(null);
  }

  if (!tabs.length) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 text-zinc-300">
        No bookmark tabs found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={activeTabId}
          onValueChange={(value) => {
            setActiveTabId(value);
            setSelectedCardIds([]);
          }}
          className="max-w-full"
        >
          <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1 bg-zinc-900 p-1">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="data-[state=active]:bg-zinc-800">
                {tab.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCreateTabOpen(true)}>
            <Plus /> New tab
          </Button>
          <Button variant="outline" size="sm" onClick={handleDeleteActiveTab} disabled={tabs.length <= 1}>
            <Trash2 /> Delete tab
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            className="pl-9"
            placeholder="Search bookmarks..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Button variant={bulkMode ? "secondary" : "outline"} size="sm" onClick={() => setBulkMode((v) => !v)}>
          {bulkMode ? "Exit bulk mode" : "Bulk select"}
        </Button>

        <Button variant="outline" size="sm" onClick={() => setCardDialogOpen(true)} disabled={!groups.length}>
          <Plus /> New card
        </Button>
        <Button variant="outline" size="sm" onClick={handleCreateGroup}>
          <FolderPlus /> New group
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}>
          <FileUp /> Import
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-zinc-400">Layout lock</Label>
          <Switch
            checked={layoutLocked}
            onCheckedChange={handleToggleLayoutLock}
            aria-label="Toggle layout lock"
          />
          {layoutLocked ? (
            <Lock className="h-4 w-4 text-zinc-500" />
          ) : (
            <LockOpen className="h-4 w-4 text-zinc-500" />
          )}
        </div>
      </div>

      {bulkMode && selectedCardIds.length > 0 ? (
        <Card className="border-zinc-800 bg-zinc-950/70">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <p className="mr-2 text-sm text-zinc-300">{selectedCardIds.length} selected</p>
            <Button size="sm" variant="outline" onClick={() => void handleBulk("enable")}>
              Enable
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleBulk("disable")}>
              Disable
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void handleBulk("delete")}>
              Delete
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={(event) => void handleDragEnd(event)}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const groupCards = visibleCardsForGroup(group.id);
            return (
              <Card key={group.id} className="border-zinc-800 bg-zinc-950/70">
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="truncate text-left text-sm font-medium text-zinc-100"
                      onClick={() => void handleToggleGroupCollapsed(group)}
                    >
                      {group.collapsed ? "▸" : "▾"} {group.name}
                    </button>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => void handleRenameGroup(group)}>
                        Rename
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void handleDeleteGroup(group)}>
                        Delete
                      </Button>
                    </div>
                  </div>

                  {group.collapsed ? null : (
                    <GroupDropZone id={group.id}>
                      <SortableContext
                        items={groupCards.map((card) => card.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {groupCards.map((card) => (
                            <BookmarkCardItem
                              key={card.id}
                              card={card}
                              draggable={!layoutLocked}
                              bulkMode={bulkMode}
                              selected={selectedCardIds.includes(card.id)}
                              onSelectedChange={(checked) => {
                                setSelectedCardIds((prev) =>
                                  checked
                                    ? [...new Set([...prev, card.id])]
                                    : prev.filter((id) => id !== card.id)
                                );
                              }}
                              onOpen={() => window.open(card.url, "_blank", "noopener,noreferrer")}
                              onEdit={() => {
                                setEditingCard(card);
                                setDefaultGroupId(card.groupId);
                                setCardDialogOpen(true);
                              }}
                              onToggleFavourite={() =>
                                void toggleCard(card, { favourite: !card.favourite })
                              }
                              onToggleEnabled={() =>
                                void toggleCard(card, { enabled: !card.enabled })
                              }
                            />
                          ))}

                          {!groupCards.length ? (
                            <div className="rounded-md border border-dashed border-zinc-700 p-4 text-center text-xs text-zinc-500">
                              {search ? "No matches in this group" : "Drop cards here"}
                            </div>
                          ) : null}
                        </div>
                      </SortableContext>
                    </GroupDropZone>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </DndContext>

      {loadingData ? <p className="text-sm text-zinc-500">Loading bookmarks...</p> : null}

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

      <BookmarkEditDialog
        open={cardDialogOpen}
        onOpenChange={(open) => {
          setCardDialogOpen(open);
          if (!open) setEditingCard(null);
        }}
        groups={groups}
        defaultGroupId={defaultGroupId || groups[0]?.id}
        card={editingCard}
        onSubmit={handleSaveCard}
      />

      {activeDragId ? (
        <div className="sr-only">{activeDragId}</div>
      ) : null}
    </div>
  );
}
