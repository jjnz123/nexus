"use client";

import type { BookmarkCard, BookmarkGroup, BookmarkTab } from "@/lib/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookmarkIcon } from "./BookmarkIcon";
import { useBookmarkLaunch } from "./useBookmarkLaunch";

type BookmarkItem = {
  card: BookmarkCard;
  group: BookmarkGroup;
  tab: BookmarkTab;
};

export function SmartSuggestionsSection({
  frequent,
  stale,
  title = "Smart suggestions",
}: {
  frequent: BookmarkItem[];
  stale: BookmarkItem[];
  title?: string;
}) {
  const { launch, LaunchModal } = useBookmarkLaunch("suggestions");

  if (frequent.length === 0 && stale.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>Based on your recent bookmark activity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {frequent.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Most used (7 days)
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {frequent.map(({ card, group, tab }) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => void launch(card)}
                    className="flex items-start gap-3 rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:bg-accent hover:shadow-sm"
                  >
                    <BookmarkIcon
                      title={card.title}
                      icon={card.icon}
                      iconType={card.iconType}
                      iconValue={card.faviconPath ?? card.iconValue}
                      accentColor={card.accentColor}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{card.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {tab.name} / {group.name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {stale.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Haven&apos;t used in a while
              </p>
              <div className="flex flex-wrap gap-2">
                {stale.map(({ card }) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => void launch(card)}
                    className="rounded-full border px-3 py-1 text-xs transition hover:bg-accent"
                  >
                    {card.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {LaunchModal}
    </>
  );
}
