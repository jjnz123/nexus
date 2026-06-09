"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Heart, Search, ServerCrash, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookmarkCard, BookmarkGroup, BookmarkTab } from "@/lib/db/schema";
import { cn, getGreeting } from "@/lib/utils";
import { AiDrawer } from "./AiDrawer";
import { FavouritesSection } from "./FavouritesSection";
import { useBookmarkLaunch } from "@/components/bookmarks/useBookmarkLaunch";

type BookmarkItem = {
  card: BookmarkCard;
  group: BookmarkGroup;
  tab: BookmarkTab;
};

type LandingPageProps = {
  userName: string;
  favourites: BookmarkItem[];
  allBookmarks: BookmarkItem[];
  downDevices: number;
  overdueTasks: number;
  canUseAi?: boolean;
  canViewMonitoring?: boolean;
  canViewTasks?: boolean;
  canViewBookmarks?: boolean;
  isLoading?: boolean;
};

function normalizePrompt(query: string): string {
  const trimmed = query.trim();
  return trimmed.startsWith("ai:") ? trimmed.slice(3).trim() : trimmed;
}

export function LandingPage({
  userName,
  favourites,
  allBookmarks,
  downDevices,
  overdueTasks,
  canUseAi = true,
  canViewMonitoring = true,
  canViewTasks = true,
  canViewBookmarks = true,
  isLoading = false,
}: LandingPageProps) {
  const [query, setQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPromptNonce, setAiPromptNonce] = useState(0);
  const { launch: launchBookmark, LaunchModal: SearchLaunchModal } = useBookmarkLaunch("search");

  const filteredBookmarks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized || normalized.startsWith("ai:")) return [];
    return allBookmarks.filter(({ card, group, tab }) =>
      [card.title, card.description ?? "", group.name, tab.name]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [allBookmarks, query]);

  function openAi(options?: { prompt?: string; send?: boolean }) {
    const prompt = normalizePrompt(options?.prompt ?? query);
    setAiPrompt(prompt);
    if (options?.send && prompt) {
      setAiPromptNonce((current) => current + 1);
    }
    setAiOpen(true);
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canUseAi) {
      return;
    }
    const prompt = normalizePrompt(query);
    if (prompt) {
      openAi({ prompt, send: true });
      return;
    }
    openAi({ send: false });
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {isLoading ? (
          <Skeleton className="h-8 w-72" />
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">{getGreeting(userName)}</h1>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          Quick access to your bookmarks, operations status, and AI assistant.
        </p>
      </motion.div>

      {canUseAi && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>How can I help you today?</CardTitle>
              <CardDescription>
                Type to filter bookmarks, press Enter to ask AI, or prefix with <code>ai:</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearchSubmit}>
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-9"
                      placeholder="How can I help you today?"
                    />
                  </div>
                  <Button type="submit">
                    <Bot className="mr-2 h-4 w-4" />
                    Ask AI
                  </Button>
                </form>
              )}

              {canViewBookmarks &&
                !isLoading &&
                query.trim() !== "" &&
                !query.trim().toLowerCase().startsWith("ai:") && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Bookmark matches ({filteredBookmarks.length})
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {filteredBookmarks.slice(0, 6).map(({ card, group, tab }) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => void launchBookmark(card)}
                          className="rounded-md border bg-card p-3 text-left text-sm transition-colors hover:bg-accent"
                        >
                          <div className="font-medium">{card.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {tab.name} / {group.name}
                          </div>
                        </button>
                      ))}
                      {filteredBookmarks.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No bookmark matches. Press Enter to ask AI instead.
                        </p>
                      )}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>
        </motion.section>
      )}

      {(canViewMonitoring || canViewTasks) && (
        <motion.section
          className="grid gap-4 md:grid-cols-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
        >
          {canViewMonitoring && (
            <Link href="/monitoring">
              <Card className="h-full transition-colors hover:bg-accent">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <ServerCrash className="h-4 w-4" />
                    Devices Down
                  </CardDescription>
                  <CardTitle className={cn("text-2xl", downDevices > 0 && "text-destructive")}>
                    {isLoading ? <Skeleton className="h-8 w-20" /> : downDevices}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          )}
          {canViewTasks && (
            <Link href="/tasks">
              <Card className="h-full transition-colors hover:bg-accent">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <TriangleAlert className="h-4 w-4" />
                    Overdue Tasks
                  </CardDescription>
                  <CardTitle className={cn("text-2xl", overdueTasks > 0 && "text-amber-500")}>
                    {isLoading ? <Skeleton className="h-8 w-20" /> : overdueTasks}
                  </CardTitle>
                </CardHeader>
              </Card>
            </Link>
          )}
        </motion.section>
      )}

      {canViewBookmarks && (
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.15 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-rose-500" />
              Favourites
            </CardTitle>
            <CardDescription>Drag to rearrange your pinned tools on the home screen.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`fav-skeleton-${index}`} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <FavouritesSection initialItems={favourites} />
            )}
          </CardContent>
        </Card>
      </motion.section>
      )}

      {canUseAi && (
      <AiDrawer
        open={aiOpen}
        onOpenChange={setAiOpen}
        initialPrompt={aiPrompt}
        promptNonce={aiPromptNonce}
      />
      )}
      {SearchLaunchModal}
    </div>
  );
}
