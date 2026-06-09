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
  isLoading?: boolean;
};

export function LandingPage({
  userName,
  favourites,
  allBookmarks,
  downDevices,
  overdueTasks,
  isLoading = false,
}: LandingPageProps) {
  const [query, setQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPromptNonce, setAiPromptNonce] = useState(0);

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

  function openAiFromSearch(triggerSend: boolean) {
    const trimmed = query.trim();
    const prompt = trimmed.startsWith("ai:") ? trimmed.slice(3).trim() : trimmed;
    setAiPrompt(prompt);
    if (triggerSend) {
      setAiPromptNonce((current) => current + 1);
    }
    setAiOpen(true);
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

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>How can I help you today?</CardTitle>
            <CardDescription>
              Search bookmarks instantly, or start with <code>ai:</code> to chat with AI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && query.trim().toLowerCase().startsWith("ai:")) {
                        event.preventDefault();
                        openAiFromSearch(true);
                      }
                    }}
                    className="pl-9"
                    placeholder="How can I help you today?"
                  />
                </div>
                <Button type="button" onClick={() => openAiFromSearch(Boolean(query.trim()))}>
                  <Bot className="mr-2 h-4 w-4" />
                  Ask AI
                </Button>
              </div>
            )}

            {!isLoading && query.trim() !== "" && !query.trim().toLowerCase().startsWith("ai:") && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Bookmark matches ({filteredBookmarks.length})
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredBookmarks.slice(0, 6).map(({ card, group, tab }) => (
                    <a
                      key={card.id}
                      href={card.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border bg-card p-3 text-sm transition-colors hover:bg-accent"
                    >
                      <div className="font-medium">{card.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {tab.name} / {group.name}
                      </div>
                    </a>
                  ))}
                  {filteredBookmarks.length === 0 && (
                    <p className="text-sm text-muted-foreground">No bookmark matches found.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      <motion.section
        className="grid gap-4 md:grid-cols-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
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
      </motion.section>

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
            <CardDescription>Your most-used bookmarked tools.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`fav-skeleton-${index}`} className="h-24 w-full" />
                ))
              : favourites.map(({ card, group, tab }) => (
                  <a
                    key={card.id}
                    href={card.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                  >
                    <p className="font-medium">{card.title}</p>
                    {card.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {card.description}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {tab.name} / {group.name}
                    </p>
                  </a>
                ))}
            {!isLoading && favourites.length === 0 && (
              <p className="text-sm text-muted-foreground">No favourites yet.</p>
            )}
          </CardContent>
        </Card>
      </motion.section>

      <AiDrawer
        open={aiOpen}
        onOpenChange={setAiOpen}
        initialPrompt={aiPrompt}
        promptNonce={aiPromptNonce}
      />
    </div>
  );
}
