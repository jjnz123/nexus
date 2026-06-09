"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Database,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  backfillRagSources,
  deleteRagChunkAdmin,
  getRagAdminOverview,
  reindexRagSourceAdmin,
  searchKnowledgeAdmin,
  searchRagChunksAdminAction,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Overview = Awaited<ReturnType<typeof getRagAdminOverview>>;
type SearchResult = Awaited<ReturnType<typeof searchKnowledgeAdmin>>;
type ChunkSearchResult = Awaited<ReturnType<typeof searchRagChunksAdminAction>>;

export function RagKnowledgePanel({ initialOverview }: { initialOverview: Overview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [chunkQuery, setChunkQuery] = useState("");
  const [chunkSourceType, setChunkSourceType] = useState<string>("all");
  const [chunkResults, setChunkResults] = useState<ChunkSearchResult | null>(null);
  const [backfillStages, setBackfillStages] = useState<
    Awaited<ReturnType<typeof backfillRagSources>>["stages"] | null
  >(null);
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

  function onChunkSearch(offset = 0) {
    startTransition(async () => {
      try {
        const result = await searchRagChunksAdminAction({
          query: chunkQuery || undefined,
          sourceType: chunkSourceType === "all" ? undefined : chunkSourceType,
          offset,
        });
        setChunkResults(result);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Chunk search failed");
      }
    });
  }

  function onDeleteChunk(chunkId: string) {
    if (!confirm("Delete this indexed chunk? The source can be reindexed later.")) return;
    startTransition(async () => {
      try {
        await deleteRagChunkAdmin({ chunkId });
        toast.success("Chunk deleted");
        onChunkSearch(0);
        await refreshOverview();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete failed");
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
        toast.success("Reindex complete");
        await refreshOverview();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Reindex failed");
      }
    });
  }

  function onBackfill() {
    setBackfillStages(null);
    startBackfillTransition(async () => {
      try {
        const result = await backfillRagSources();
        setBackfillStages(result.stages ?? []);
        toast.success(`Backfill complete (${result.indexed} sources processed)`);
        await refreshOverview();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Backfill failed");
      }
    });
  }

  const stats = overview.analytics.indexStats;
  const retrievalStats = overview.analytics.retrievalStats;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Knowledge base overview
          </CardTitle>
          <CardDescription>
            Indexed content, retrieval analytics, chunk browser, and admin test search.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Indexed sources" value={stats.indexed_sources} />
          <Stat label="Failed sources" value={stats.failed_sources} />
          <Stat label="Total chunks" value={stats.total_chunks} />
          <Stat
            label="Retrieval success (30d)"
            value={
              retrievalStats.total_runs
                ? Math.round((retrievalStats.successful_runs / retrievalStats.total_runs) * 100)
                : 0
            }
            suffix="%"
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="analytics">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="chunks">Chunks</TabsTrigger>
          <TabsTrigger value="search">Test search</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6 pt-4">
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
                <CardTitle>Retrieval pipeline (30 days)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Total runs" value={retrievalStats.total_runs} />
                <Row label="Successful runs" value={retrievalStats.successful_runs} />
                <Row
                  label="Avg duration"
                  value={
                    retrievalStats.avg_duration_ms != null
                      ? `${Math.round(retrievalStats.avg_duration_ms)} ms`
                      : "—"
                  }
                />
                <Row
                  label="Avg chunks used"
                  value={
                    retrievalStats.avg_used_count != null
                      ? retrievalStats.avg_used_count.toFixed(1)
                      : "—"
                  }
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopSourcesCard title="Top sources (7 days)" rows={overview.analytics.topSources7Days} />
            <TopSourcesCard title="Top sources (30 days)" rows={overview.analytics.topSources} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Low-relevance queries (30 days)
              </CardTitle>
              <CardDescription>
                Queries where fused scores were weak — may indicate gaps in indexed content.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {overview.analytics.lowRelevanceQueries.length ? (
                overview.analytics.lowRelevanceQueries.map((row) => (
                  <div key={row.query} className="rounded border p-2 text-sm">
                    <p className="font-medium">{row.query}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.hits} hits · avg fused{" "}
                      {row.avg_fused != null ? row.avg_fused.toFixed(4) : "—"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No low-relevance queries logged yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chunks" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Chunk browser
              </CardTitle>
              <CardDescription>
                Search and inspect individual indexed chunks. Delete stale chunks if needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
                <div className="space-y-2">
                  <Label htmlFor="chunk-search">Search content</Label>
                  <Input
                    id="chunk-search"
                    value={chunkQuery}
                    onChange={(event) => setChunkQuery(event.target.value)}
                    placeholder="Title or content…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source type</Label>
                  <Select value={chunkSourceType} onValueChange={setChunkSourceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="user_note">Notes</SelectItem>
                      <SelectItem value="meeting_transcript">Meeting transcript</SelectItem>
                      <SelectItem value="meeting_summary">Meeting summary</SelectItem>
                      <SelectItem value="task">Tasks</SelectItem>
                      <SelectItem value="ai_project_file">Project files</SelectItem>
                      <SelectItem value="ai_conversation_file">Conversation files</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={() => onChunkSearch(0)} disabled={isPending} className="gap-2">
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Search
                  </Button>
                </div>
              </div>

              {chunkResults ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {chunkResults.total} chunk{chunkResults.total === 1 ? "" : "s"} found
                  </p>
                  {chunkResults.chunks.map((chunk) => (
                    <div key={chunk.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{chunk.sourceType}</Badge>
                        <span className="text-sm font-medium">{chunk.title}</span>
                        <span className="text-xs text-muted-foreground">#{chunk.chunkIndex}</span>
                      </div>
                      <p className="mt-2 text-sm whitespace-pre-wrap">{chunk.contentPreview}</p>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          Source {chunk.sourceId} · indexed{" "}
                          {format(new Date(chunk.indexedAt), "MMM d, h:mm a")}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive"
                          disabled={isPending}
                          onClick={() => onDeleteChunk(chunk.id)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Test knowledge search
              </CardTitle>
              <CardDescription>
                Full hybrid pipeline with vector/keyword scores, fusion rank, and context selection.
              </CardDescription>
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
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Search
                  </Button>
                </div>
              </div>

              {searchResult?.debug ? (
                <div className="rounded-lg border p-4 text-sm space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                    <Metric label="Rewrite" value={`${searchResult.debug.timingsMs.rewrite} ms`} />
                    <Metric label="Embed" value={`${searchResult.debug.timingsMs.embed} ms`} />
                    <Metric
                      label="Vector search"
                      value={`${searchResult.debug.timingsMs.vectorSearch} ms`}
                    />
                    <Metric
                      label="Keyword search"
                      value={`${searchResult.debug.timingsMs.keywordSearch} ms`}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Original: {searchResult.debug.originalQuery} · Rewritten:{" "}
                    {searchResult.debug.retrievalQuery}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Retrieved {searchResult.debug.counts.vector} vector +{" "}
                    {searchResult.debug.counts.keyword} keyword → {searchResult.debug.counts.fused}{" "}
                    fused → {searchResult.debug.counts.used} in context
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-1 pr-2">Rank</th>
                          <th className="py-1 pr-2">Title</th>
                          <th className="py-1 pr-2">Vector</th>
                          <th className="py-1 pr-2">Keyword</th>
                          <th className="py-1 pr-2">Fused</th>
                          <th className="py-1">Context</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResult.debug.chunks.map((chunk) => (
                          <tr key={chunk.chunkId} className="border-b align-top">
                            <td className="py-2 pr-2">{chunk.rankAfterFusion}</td>
                            <td className="py-2 pr-2 max-w-[200px]">
                              <p className="font-medium truncate">{chunk.title}</p>
                              <p className="text-muted-foreground line-clamp-2">
                                {chunk.contentPreview}
                              </p>
                            </td>
                            <td className="py-2 pr-2">
                              {chunk.vectorScore != null ? chunk.vectorScore.toFixed(3) : "—"}
                            </td>
                            <td className="py-2 pr-2">
                              {chunk.keywordScore != null ? chunk.keywordScore.toFixed(3) : "—"}
                            </td>
                            <td className="py-2 pr-2">
                              {chunk.fusedScore != null ? chunk.fusedScore.toFixed(4) : "—"}
                            </td>
                            <td className="py-2">
                              {chunk.usedInContext ? (
                                <Badge>Used</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : searchResult ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">
                    Rewritten query: {searchResult.retrievalQuery}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{searchResult.contextPreview}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4 pt-4">
          {overview.failedStates.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Failed sources ({overview.failedStates.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.failedStates.map((entry) => (
                  <SourceRow
                    key={entry.id}
                    entry={entry}
                    isPending={isPending}
                    onReindex={onReindex}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}

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
              {backfillStages?.length ? (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium">Backfill progress</p>
                  {backfillStages.map((stage) => (
                    <div key={stage.name} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{stage.name.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">
                        {stage.processed}/{stage.total}
                        {stage.failed ? ` (${stage.failed} failed)` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {overview.recentStates.map((entry) => (
                <SourceRow
                  key={entry.id}
                  entry={entry}
                  isPending={isPending}
                  onReindex={onReindex}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SourceRow({
  entry,
  isPending,
  onReindex,
}: {
  entry: RagIndexState;
  isPending: boolean;
  onReindex: (entry: RagIndexState) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={entry.status === "indexed" ? "secondary" : "destructive"}>
            {entry.status}
          </Badge>
          <span className="text-sm font-medium">{entry.sourceType}</span>
          <span className="text-xs text-muted-foreground">{entry.chunkCount} chunks</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{entry.sourceId}</p>
        {entry.errorMessage ? (
          <p className="text-xs text-destructive">{entry.errorMessage}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Updated {format(new Date(entry.updatedAt), "MMM d, h:mm a")}
        </p>
      </div>
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => onReindex(entry)}>
        Reindex
      </Button>
    </div>
  );
}

function TopSourcesCard({
  title,
  rows,
}: {
  title: string;
  rows: Overview["analytics"]["topSources"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length ? (
          rows.map((row) => (
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
  );
}

function Stat({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        {value}
        {suffix}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border px-2 py-1">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
