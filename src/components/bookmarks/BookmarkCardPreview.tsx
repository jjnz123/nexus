"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BookmarkIcon } from "./BookmarkIcon";
import type { BookmarkIconType } from "@/lib/db/schema";

type BookmarkCardPreviewProps = {
  title: string;
  description?: string;
  url: string;
  iconType: BookmarkIconType;
  iconValue: string;
  accentColor: string;
  enabled: boolean;
  className?: string;
};

export function BookmarkCardPreview({
  title,
  description,
  url,
  iconType,
  iconValue,
  accentColor,
  enabled,
  className,
}: BookmarkCardPreviewProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-zinc-800 bg-zinc-900/60 transition hover:-translate-y-0.5 hover:shadow-lg",
        !enabled && "opacity-60",
        className
      )}
    >
      <div className="h-1" style={{ backgroundColor: accentColor }} />
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <BookmarkIcon
            title={title}
            iconType={iconType}
            iconValue={iconValue}
            accentColor={accentColor}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{title || "Bookmark title"}</p>
              {!enabled ? <Badge variant="secondary">Disabled</Badge> : null}
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {description || url || "https://example.com"}
            </p>
          </div>
        </div>
        <p className="truncate text-xs text-muted-foreground">{url || "Preview URL"}</p>
      </CardContent>
    </Card>
  );
}
