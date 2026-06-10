"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Check,
  Heart,
  LayoutDashboard,
  Search,
  ServerCrash,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { updateBookmarkPreferences } from "@/server/actions/preferences";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookmarkCard, BookmarkGroup, BookmarkTab } from "@/lib/db/schema";
import {
  DEFAULT_HOME_DASHBOARD,
  parseHomeDashboard,
  type HomeDashboardConfig,
  type HomeWidgetId,
} from "@/lib/preferences/workspace";
import { cn, getGreeting } from "@/lib/utils";
import { AiDrawer } from "./AiDrawer";
import { BoardLinksSection } from "./BoardLinksSection";
import { FavouritesSection } from "./FavouritesSection";
import { HomeDashboardWidget } from "./HomeDashboardWidget";
import { SmartSuggestionsSection } from "@/components/bookmarks/SmartSuggestionsSection";
import { useBookmarkLaunch } from "@/components/bookmarks/useBookmarkLaunch";

type BookmarkItem = {
  card: BookmarkCard;
  group: BookmarkGroup;
  tab: BookmarkTab;
};

type ProjectOption = { id: string; key: string; name: string };

type LandingPageProps = {
  userName: string;
  favourites: BookmarkItem[];
  allBookmarks: BookmarkItem[];
  smartSuggestions?: { frequent: BookmarkItem[]; stale: BookmarkItem[] };
  downDevices: number;
  overdueTasks: number;
  canUseAi?: boolean;
  canViewMonitoring?: boolean;
  canViewTasks?: boolean;
  canViewBookmarks?: boolean;
  isLoading?: boolean;
  initialHomeDashboard?: HomeDashboardConfig | null;
  taskProjects?: ProjectOption[];
};

function normalizePrompt(query: string): string {
  const trimmed = query.trim();
  return trimmed.startsWith("ai:") ? trimmed.slice(3).trim() : trimmed;
}

const WIDGET_LABELS: Record<HomeWidgetId, { title: string; description?: string }> = {
  search: {
    title: "Search & AI",
    description: "Type to filter bookmarks, press Enter to ask AI, or prefix with ai:.",
  },
  operations: { title: "Operations" },
  suggestions: { title: "Smart suggestions" },
  favourites: {
    title: "Favourites",
    description: "Pin up to 5 starred bookmarks. Unlock to rearrange.",
  },
  boardLinks: {
    title: "Board links",
    description: "Quick shortcuts to project kanban boards.",
  },
};

export function LandingPage({
  userName,
  favourites,
  allBookmarks,
  smartSuggestions,
  downDevices,
  overdueTasks,
  canUseAi = true,
  canViewMonitoring = true,
  canViewTasks = true,
  canViewBookmarks = true,
  isLoading = false,
  initialHomeDashboard,
  taskProjects = [],
}: LandingPageProps) {
  const [query, setQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPromptNonce, setAiPromptNonce] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [dashboard, setDashboard] = useState<HomeDashboardConfig>(() =>
    parseHomeDashboard(initialHomeDashboard)
  );
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

  const persistDashboard = useCallback((next: HomeDashboardConfig) => {
    setDashboard(next);
    void updateBookmarkPreferences({ homeDashboard: next }).catch(() => {
      toast.error("Unable to save dashboard layout");
    });
  }, []);

  const widgetAllowed = useCallback(
    (id: HomeWidgetId) => {
      switch (id) {
        case "search":
          return canUseAi;
        case "operations":
          return canViewMonitoring || canViewTasks;
        case "suggestions":
        case "favourites":
          return canViewBookmarks;
        case "boardLinks":
          return canViewTasks;
        default:
          return false;
      }
    },
    [canUseAi, canViewBookmarks, canViewMonitoring, canViewTasks]
  );

  const orderedWidgets = useMemo(
    () => dashboard.widgetOrder.filter((id) => widgetAllowed(id)),
    [dashboard.widgetOrder, widgetAllowed]
  );

  const updateWidget = (id: HomeWidgetId, patch: Partial<{ visible: boolean; minimized: boolean }>) => {
    persistDashboard({
      ...dashboard,
      widgets: {
        ...dashboard.widgets,
        [id]: { ...dashboard.widgets[id], ...patch },
      },
    });
  };

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
    if (!canUseAi) return;
    const prompt = normalizePrompt(query);
    if (prompt) {
      openAi({ prompt, send: true });
      return;
    }
    openAi({ send: false });
  }

  const renderWidget = (id: HomeWidgetId) => {
    const config = dashboard.widgets[id] ?? DEFAULT_HOME_DASHBOARD.widgets[id];
    const meta = WIDGET_LABELS[id];

    switch (id) {
      case "search":
        return (
          <HomeDashboardWidget
            key={id}
            title={meta.title}
            description={meta.description}
            editMode={editMode}
            config={config}
            onToggleVisible={() => updateWidget(id, { visible: !config.visible })}
            onToggleMinimized={() => updateWidget(id, { minimized: !config.minimized })}
          >
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="space-y-4">
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
                {canViewBookmarks &&
                query.trim() !== "" &&
                !query.trim().toLowerCase().startsWith("ai:") ? (
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
                      {filteredBookmarks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No bookmark matches. Press Enter to ask AI instead.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </HomeDashboardWidget>
        );

      case "operations":
        return (
          <HomeDashboardWidget
            key={id}
            title={meta.title}
            editMode={editMode}
            config={config}
            onToggleVisible={() => updateWidget(id, { visible: !config.visible })}
            onToggleMinimized={() => updateWidget(id, { minimized: !config.minimized })}
          >
            <div className="grid gap-4 md:grid-cols-2">
              {canViewMonitoring ? (
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
              ) : null}
              {canViewTasks ? (
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
              ) : null}
            </div>
          </HomeDashboardWidget>
        );

      case "suggestions":
        return smartSuggestions ? (
          <HomeDashboardWidget
            key={id}
            title={meta.title}
            editMode={editMode}
            config={config}
            onToggleVisible={() => updateWidget(id, { visible: !config.visible })}
            onToggleMinimized={() => updateWidget(id, { minimized: !config.minimized })}
          >
            <SmartSuggestionsSection
              frequent={smartSuggestions.frequent}
              stale={smartSuggestions.stale}
            />
          </HomeDashboardWidget>
        ) : null;

      case "favourites":
        return (
          <HomeDashboardWidget
            key={id}
            title={meta.title}
            description={meta.description}
            editMode={editMode}
            config={config}
            headerExtra={<Heart className="h-4 w-4 text-rose-500" />}
            onToggleVisible={() => updateWidget(id, { visible: !config.visible })}
            onToggleMinimized={() => updateWidget(id, { minimized: !config.minimized })}
          >
            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`fav-skeleton-${index}`} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <FavouritesSection initialItems={favourites} />
            )}
          </HomeDashboardWidget>
        );

      case "boardLinks":
        return (
          <HomeDashboardWidget
            key={id}
            title={meta.title}
            description={meta.description}
            editMode={editMode}
            config={config}
            headerExtra={<LayoutDashboard className="h-4 w-4 text-primary" />}
            onToggleVisible={() => updateWidget(id, { visible: !config.visible })}
            onToggleMinimized={() => updateWidget(id, { minimized: !config.minimized })}
          >
            <BoardLinksSection
              projects={taskProjects}
              boardLinks={dashboard.boardLinks}
              editMode={editMode}
              dashboard={dashboard}
              onChange={persistDashboard}
            />
          </HomeDashboardWidget>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          {isLoading ? (
            <Skeleton className="h-8 w-72" />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{getGreeting(userName)}</h1>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            Quick access to your bookmarks, operations status, and AI assistant.
          </p>
        </div>
        <Button
          type="button"
          variant={editMode ? "secondary" : "outline"}
          size="sm"
          onClick={() => setEditMode((current) => !current)}
        >
          {editMode ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Done editing
            </>
          ) : (
            <>
              <Settings2 className="mr-2 h-4 w-4" />
              Edit dashboard
            </>
          )}
        </Button>
      </motion.div>

      {editMode ? (
        <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Customise your dashboard: show or hide widgets, minimise sections, and add board links to
          project kanban boards. Changes are saved automatically.
        </p>
      ) : null}

      {orderedWidgets.map((widgetId, index) => (
        <motion.div
          key={widgetId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 * (index + 1) }}
        >
          {renderWidget(widgetId)}
        </motion.div>
      ))}

      {canUseAi ? (
        <AiDrawer
          open={aiOpen}
          onOpenChange={setAiOpen}
          initialPrompt={aiPrompt}
          promptNonce={aiPromptNonce}
        />
      ) : null}
      {SearchLaunchModal}
    </div>
  );
}
