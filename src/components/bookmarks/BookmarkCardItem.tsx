"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Power,
  Star,
  StarOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { BookmarkCard } from "@/lib/db/schema";
import { BookmarkIcon } from "./BookmarkIcon";
import { BookmarkHealthPill } from "./BookmarkHealthPill";

type ClickStats = {
  total: number;
  lastAt: Date | string | null;
};

type HealthInfo = {
  status: "up" | "down" | "unknown" | "degraded";
  checkedAt: Date | string | null;
  deviceId: string;
  deviceName: string;
};

type BookmarkCardItemProps = {
  card: BookmarkCard;
  draggable: boolean;
  bulkMode: boolean;
  browseMode?: boolean;
  selected: boolean;
  isFavourited?: boolean;
  layoutMode?: "grid" | "list";
  clickStats?: ClickStats;
  healthInfo?: HealthInfo;
  statusFlash?: boolean;
  onSelectedChange: (checked: boolean) => void;
  onLaunch: () => void;
  onEdit: () => void;
  onDuplicate?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onToggleFavourite?: () => void;
  onToggleEnabled?: () => void;
};

export function BookmarkCardItem({
  card,
  draggable,
  bulkMode,
  browseMode = false,
  selected,
  isFavourited = false,
  layoutMode = "grid",
  clickStats,
  healthInfo,
  statusFlash = false,
  onSelectedChange,
  onLaunch,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleFavourite,
  onToggleEnabled,
}: BookmarkCardItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !draggable,
  });

  const totalOpens = clickStats?.total ?? card.clickCount ?? 0;
  const lastOpened = clickStats?.lastAt ?? card.lastClickedAt;
  const lastOpenedLabel = lastOpened
    ? formatDistanceToNow(new Date(lastOpened), { addSuffix: true })
    : null;

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "w-full",
        layoutMode === "grid" && "max-w-[320px]",
        layoutMode === "list" && "max-w-2xl"
      )}
    >
      <Card
        className={cn(
          "group relative overflow-hidden border-zinc-800/80 bg-zinc-900/60 transition-all duration-200",
          "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20",
          !card.enabled && "opacity-60",
          isDragging && "z-10 ring-2 ring-primary/40",
          statusFlash && "ring-2 ring-amber-500/50",
          layoutMode === "list" && "flex-row"
        )}
      >
        <div className="h-1" style={{ backgroundColor: card.accentColor }} />
        <CardContent className={cn("space-y-3 p-3", layoutMode === "list" && "flex w-full items-center gap-3")}>
          <div className="flex items-start gap-2">
            <div
              className={cn(
                "min-w-0 flex-1",
                card.enabled && !bulkMode ? "cursor-pointer" : "",
                !card.enabled && "pointer-events-none"
              )}
              onClick={() => {
                if (!bulkMode && card.enabled) onLaunch();
              }}
              role="button"
              tabIndex={card.enabled && !bulkMode ? 0 : -1}
              title={
                lastOpenedLabel
                  ? `Last opened ${lastOpenedLabel} · Opened ${totalOpens} time${totalOpens === 1 ? "" : "s"}`
                  : totalOpens > 0
                    ? `Opened ${totalOpens} time${totalOpens === 1 ? "" : "s"}`
                    : undefined
              }
            >
              <div className="flex items-start gap-2">
                <BookmarkIcon
                  title={card.title}
                  icon={card.icon}
                  iconType={card.iconType}
                  iconValue={card.faviconPath ?? card.iconValue}
                  accentColor={card.accentColor}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-100">{card.title}</p>
                    {isFavourited ? (
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    ) : null}
                    {healthInfo ? (
                      <BookmarkHealthPill
                        status={healthInfo.status}
                        checkedAt={healthInfo.checkedAt}
                        deviceId={healthInfo.deviceId}
                        deviceName={healthInfo.deviceName}
                      />
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-xs text-zinc-400">
                    {card.description || card.url}
                  </p>
                  {(lastOpenedLabel || totalOpens > 0) && (
                    <p className="mt-1 hidden text-[10px] text-zinc-500 group-hover:block">
                      {lastOpenedLabel ? `Last opened ${lastOpenedLabel}` : null}
                      {lastOpenedLabel && totalOpens > 0 ? " · " : null}
                      {totalOpens > 0 ? `${totalOpens} opens` : null}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {bulkMode ? (
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) => onSelectedChange(checked === true)}
                aria-label={`Select ${card.title}`}
              />
            ) : null}
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-1">
              {!card.enabled ? (
                <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
                  Disabled
                </Badge>
              ) : null}
              {(card.tags ?? []).slice(0, 2).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              {!browseMode && draggable ? (
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

              {!browseMode ? (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "h-7 w-7 text-zinc-400 hover:text-zinc-100",
                      !card.enabled && "pointer-events-none opacity-40"
                    )}
                    disabled={!card.enabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLaunch();
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

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={onLaunch} disabled={!card.enabled}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Launch
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onEdit}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      {onToggleFavourite ? (
                        <DropdownMenuItem onClick={onToggleFavourite}>
                          {isFavourited ? (
                            <>
                              <StarOff className="mr-2 h-4 w-4" />
                              Remove favourite
                            </>
                          ) : (
                            <>
                              <Star className="mr-2 h-4 w-4" />
                              Add favourite
                            </>
                          )}
                        </DropdownMenuItem>
                      ) : null}
                      {onToggleEnabled ? (
                        <DropdownMenuItem onClick={onToggleEnabled}>
                          <Power className="mr-2 h-4 w-4" />
                          {card.enabled ? "Disable" : "Enable"}
                        </DropdownMenuItem>
                      ) : null}
                      {onDuplicate ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={onDuplicate}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {onArchive ? <DropdownMenuItem onClick={onArchive}>Archive</DropdownMenuItem> : null}
                      {onDelete ? (
                        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                          Delete permanently
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-7 w-7 text-zinc-400 hover:text-zinc-100",
                    !card.enabled && "pointer-events-none opacity-40"
                  )}
                  disabled={!card.enabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    onLaunch();
                  }}
                  title="Open link"
                >
                  <ExternalLink />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
