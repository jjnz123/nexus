"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import {
  ExternalLink,
  GripVertical,
  Pencil,
  Power,
  Star,
  StarOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BookmarkCard } from "@/lib/db/schema";

type BookmarkCardItemProps = {
  card: BookmarkCard;
  draggable: boolean;
  bulkMode: boolean;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  onOpen: () => void;
  onEdit: () => void;
  onToggleFavourite: () => void;
  onToggleEnabled: () => void;
};

export function BookmarkCardItem({
  card,
  draggable,
  bulkMode,
  selected,
  onSelectedChange,
  onOpen,
  onEdit,
  onToggleFavourite,
  onToggleEnabled,
}: BookmarkCardItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
      disabled: !draggable,
    });

  return (
    <Card
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "group border-zinc-800/80 bg-zinc-900/60 transition hover:border-zinc-700",
        "cursor-pointer",
        card.enabled ? "opacity-100" : "opacity-50",
        isDragging && "ring-2 ring-primary/40"
      )}
      onClick={() => {
        if (bulkMode) {
          onSelectedChange(!selected);
          return;
        }
        if (!card.enabled) return;
        onOpen();
      }}
    >
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start gap-2">
          <div
            className={cn(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-xs font-semibold uppercase text-zinc-200"
            )}
          >
            {card.icon?.slice(0, 2) ?? card.title.slice(0, 2)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-zinc-100">{card.title}</p>
              {card.favourite ? (
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              ) : null}
            </div>
            <p className="line-clamp-2 text-xs text-zinc-400">
              {card.description || card.url}
            </p>
          </div>

          {bulkMode ? (
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelectedChange(checked === true)}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Select ${card.title}`}
            />
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {!card.enabled ? (
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
                Disabled
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            {draggable ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
                {...attributes}
                {...listeners}
                onClick={(event) => event.stopPropagation()}
              >
                <GripVertical />
              </Button>
            ) : null}

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
              onClick={(event) => {
                event.stopPropagation();
                if (!card.enabled) return;
                onOpen();
              }}
            >
              <ExternalLink />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              <Pencil />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavourite();
              }}
            >
              {card.favourite ? <StarOff /> : <Star />}
            </Button>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
              onClick={(event) => {
                event.stopPropagation();
                onToggleEnabled();
              }}
            >
              <Power />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
