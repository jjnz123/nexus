"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bookmark, GripVertical, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import type { BookmarkCard, BookmarkGroup, BookmarkTab } from "@/lib/db/schema";
import { updateHomeFavouriteOrder } from "@/server/actions/preferences";
import { cn } from "@/lib/utils";
import { BookmarkIcon } from "@/components/bookmarks/BookmarkIcon";
import { useBookmarkLaunch } from "@/components/bookmarks/useBookmarkLaunch";
import { Button } from "@/components/ui/button";

type BookmarkItem = {
  card: BookmarkCard;
  group: BookmarkGroup;
  tab: BookmarkTab;
};

function SortableFavourite({
  item,
  onLaunch,
  reorderUnlocked,
}: {
  item: BookmarkItem;
  onLaunch: () => void;
  reorderUnlocked: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.card.id,
    disabled: !reorderUnlocked,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "relative w-full max-w-[320px] overflow-hidden rounded-lg border bg-card transition-all hover:-translate-y-0.5 hover:bg-accent hover:shadow-md",
        isDragging && "z-10 opacity-80 shadow-lg"
      )}
    >
      <div className="h-1" style={{ backgroundColor: item.card.accentColor }} />
      <div className={cn("p-4", reorderUnlocked && "pl-8")}>
        {reorderUnlocked ? (
          <button
            type="button"
            className="absolute left-2 top-3 rounded p-1 text-muted-foreground hover:bg-muted"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
        <button type="button" className="block w-full text-left" onClick={onLaunch}>
          <div className="flex items-start gap-3">
            <BookmarkIcon
              title={item.card.title}
              icon={item.card.icon}
              iconType={item.card.iconType}
              iconValue={item.card.iconValue}
              accentColor={item.card.accentColor}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.card.title}</p>
              {item.card.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.card.description}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {item.tab.name} / {item.group.name}
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

export function FavouritesSection({ initialItems }: { initialItems: BookmarkItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [reorderUnlocked, setReorderUnlocked] = useState(false);
  const { launch, LaunchModal } = useBookmarkLaunch("landing");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = async (event: DragEndEvent) => {
    if (!reorderUnlocked) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.card.id === active.id);
    const newIndex = items.findIndex((item) => item.card.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);

    try {
      await updateHomeFavouriteOrder({ cardIds: next.map((item) => item.card.id) });
      toast.success("Home layout saved");
    } catch {
      setItems(items);
      toast.error("Failed to save layout");
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Bookmark className="h-7 w-7 text-primary" />
        </div>
        <p className="text-sm text-muted-foreground">
          No favourites yet. Star up to 5 bookmarks to pin them here.
        </p>
        <Link href="/bookmarks" className="mt-3 text-sm text-primary hover:underline">
          Go to Bookmarks
        </Link>
      </div>
    );
  }

  const grid = (
    <SortableContext items={items.map((item) => item.card.id)} strategy={rectSortingStrategy}>
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,320px))]">
        {items.map((item) => (
          <SortableFavourite
            key={item.card.id}
            item={item}
            reorderUnlocked={reorderUnlocked}
            onLaunch={() => void launch(item.card)}
          />
        ))}
      </div>
    </SortableContext>
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setReorderUnlocked((value) => !value)}
          aria-label={reorderUnlocked ? "Lock favourites order" : "Unlock to rearrange favourites"}
          title={reorderUnlocked ? "Lock order" : "Unlock to rearrange"}
        >
          {reorderUnlocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </Button>
      </div>

      <DndContext
        sensors={reorderUnlocked ? sensors : []}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        {grid}
      </DndContext>

      <p className="mt-3 text-xs text-muted-foreground">
        {reorderUnlocked
          ? "Drag cards to rearrange your home screen."
          : "Order is locked. Click the unlock icon to rearrange."}
      </p>
      {LaunchModal}
    </>
  );
}
