"use client";

import { useCallback, useState } from "react";
import { recordBookmarkLaunch } from "@/server/actions/bookmarks";
import { BookmarkLaunchModal } from "./BookmarkLaunchModal";
import type { BookmarkCard } from "@/lib/db/schema";

type LaunchSource = "bookmarks" | "landing" | "search";

export function useBookmarkLaunch(source: LaunchSource = "bookmarks") {
  const [iframeCard, setIframeCard] = useState<BookmarkCard | null>(null);

  const launch = useCallback(
    async (card: Pick<BookmarkCard, "id" | "url" | "title" | "openInIframe" | "enabled">) => {
      if (!card.enabled) return;

      void recordBookmarkLaunch({ cardId: card.id, source }).catch(() => undefined);

      if (card.openInIframe) {
        setIframeCard(card as BookmarkCard);
        return;
      }

      window.open(card.url, "_blank", "noopener,noreferrer");
    },
    [source]
  );

  const LaunchModal = iframeCard ? (
    <BookmarkLaunchModal
      open={Boolean(iframeCard)}
      onOpenChange={(open) => !open && setIframeCard(null)}
      title={iframeCard.title}
      url={iframeCard.url}
    />
  ) : null;

  return { launch, LaunchModal };
}
