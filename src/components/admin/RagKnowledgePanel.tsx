"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { Database, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  backfillRagSources,
  getRagAdminOverview,
  reindexRagSourceAdmin,
  searchKnowledgeAdmin,
} from "@/server/actions/rag-admin";
import type { RagIndexState } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Overview = Awaited<ReturnType<typeof getRagAdminOverview>>;

export function RagKnowledgePanel({ initialOverview }: { initialOverview: Overview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [searchResult, setSearchResult] = useState<Awaited<
    ReturnType<typeof searchKnowledgeAdmin>
  > | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isBackfillPending, startBackfillTransition] = useTransition();

  async function refreshOverview() {
    const next = await getRagAdminOverview();
    setOverview(next);
  }

  useEffect(() => {
    void refreshOverview();
  }, []);

  function onSearch() {
    startTransition(async () => {
      try {
        const result = await searchKnowledgeAdmin({
          query,
          scopes:
            scope === "all"
              ? undefined
              : [scope as "files" | "notes" | "meetings" | "tasks"],
        });
        setSearchResult(result);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Search failed");
      }
    });
  }

  function onReindex(entry: RagIndexState) {
    startTransition(async () => {
      try {
        await reindexRagSourceAdmin({
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
        });
        toast.success("Reindex queued");
        await refreshOverview();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Reindex failed");
      }
    });
  }

  function onBackfill() {
    startBackfillTransition(async () => {
      try {
        const result = await backfillRagSources();
        toast.success(`Backfill complete (${result.indexed} sources processed)`);
        await refreshOverview();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Backfill failed");
      }
    });
  }

  const stats = overview.analytics.indexStats;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Knowledge base overview
          </CardTitle>
          <CardDescription>
            Indexed content, retrieval analytics, and admin test search across RAG sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Indexed sources" value={stats.indexed_sources} />
          <Stat label="Failed sources" value={stats.failed_sources} />
          <Stat label="Total chunks" value={stats.total_chunks} />
          <Stat label="Tracked sources" value={overview.totalSources} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.analytics.sourceBreakdown.length ? (
              overview.analytics.sourceBreakdown.map((row) => (
                <div key={row.source_type} className="flex items-center justify-between text-sm">
                  <span>{row.source_type}</span>
                  <Badge variant="secondary">{row.count}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No indexed sources yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top retrieved sources (30 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.analytics.topSources.length ? (
              overview.analytics.topSources.map((row) => (
                <div key={`${row.source_type}-${row.source_id}`} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{row.source_type}</span>
                    <Badge>{row.hits} hits</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{row.source_id}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No retrieval activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Test knowledge search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
            <div className="space-y-2">
              <Label htmlFor="rag-admin-query">Query</Label>
              <Input
                id="rag-admin-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search indexed knowledge..."
              />
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="files">Files</SelectItem>
                  <SelectItem value="notes">Notes</SelectItem>
                  <SelectItem value="meetings">Meetings</SelectItem>
                  <SelectItem value="tasks">Tasks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={onSearch} disabled={isPending || !query.trim()} className="gap-2">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
          </div>

          {searchResult ? (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">
                Rewritten query: {searchResult.retrievalQuery}
              </p>
              <p className="text-sm whitespace-pre-wrap">{searchResult.contextPreview}</p>
              {searchResult.citations.length ? (
                <ul className="space-y-1 text-sm">
                  {searchResult.citations.map((citation) => (
                    <li key={citation.chunkId}>
                      <a href={citation.href} className="text-primary hover:underline">
                        {citation.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Index status</CardTitle>
            <CardDescription>Recent sources and re-index controls.</CardDescription>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            disabled={isBackfillPending}
            onClick={onBackfill}
          >
            {isBackfillPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Backfill all
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.recentStates.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={entry.status === "indexed" ? "secondary" : "destructive"}>
                    {entry.status}
                  </Badge>
                  <span className="text-sm font-medium">{entry.sourceType}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.chunkCount} chunks
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{entry.sourceId}</p>
                <p className="text-xs text-muted-foreground">
                  Updated {format(new Date(entry.updatedAt), "MMM d, h:mm a")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => onReindex(entry)}
              >
                Reindex
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
