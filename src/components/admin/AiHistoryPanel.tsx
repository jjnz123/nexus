"use client";

import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { Download, Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAdminConversationMessages,
  searchAiHistoryAdmin,
} from "@/server/actions/ai-chat";
import type { AiMessage } from "@/lib/db/schema";

type UserOption = {
  id: string;
  email: string;
  name: string;
};

type ProjectOption = {
  id: string;
  key: string;
  name: string;
};

type SearchResult = Awaited<ReturnType<typeof searchAiHistoryAdmin>>["results"][number];

function snippet(text: string, query: string, radius = 80) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!query.trim()) return normalized.slice(0, radius * 2);
  const idx = normalized.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx < 0) return normalized.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(normalized.length, idx + query.length + radius);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

export function AiHistoryPanel({
  users,
  projects,
}: {
  users: UserOption[];
  projects: ProjectOption[];
}) {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState<string>("all");
  const [projectId, setProjectId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewTitle, setViewTitle] = useState("");
  const [viewMessages, setViewMessages] = useState<AiMessage[]>([]);
  const [viewMeta, setViewMeta] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const filters = useMemo(
    () => ({
      query: query.trim() || undefined,
      userId: userId === "all" ? undefined : userId,
      projectId: projectId === "all" ? undefined : projectId,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
      limit: 100,
    }),
    [query, userId, projectId, dateFrom, dateTo]
  );

  const runSearch = () => {
    startTransition(async () => {
      try {
        const payload = await searchAiHistoryAdmin(filters);
        setResults(payload.results);
        setHasSearched(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Search failed");
      }
    });
  };

  const exportResults = (formatType: "json" | "csv") => {
    if (!results.length) {
      toast.error("No results to export");
      return;
    }

    if (formatType === "json") {
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nexus-ai-history-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = [
        "timestamp",
        "userName",
        "userEmail",
        "projectName",
        "conversationTitle",
        "role",
        "snippet",
        "conversationId",
        "messageId",
      ];
      const rows = results.map((row) =>
        [
          new Date(row.messageCreatedAt).toISOString(),
          row.userName,
          row.userEmail,
          row.projectName ?? "",
          row.conversationTitle,
          row.messageRole,
          snippet(row.messageContent, query).replace(/"/g, '""'),
          row.conversationId,
          row.messageId,
        ]
          .map((cell) => `"${cell}"`)
          .join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nexus-ai-history-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    toast.success(`Exported ${results.length} results`);
  };

  const openConversation = (conversationId: string) => {
    startTransition(async () => {
      try {
        const payload = await getAdminConversationMessages(conversationId);
        setViewTitle(payload.conversation.title);
        setViewMeta(
          `${payload.user.name} · ${payload.user.email}${
            payload.project ? ` · ${payload.project.name}` : ""
          }`
        );
        setViewMessages(payload.messages);
        setViewOpen(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load conversation");
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>AI History Search</CardTitle>
          <CardDescription>
            Search across all users&apos; AI conversations, messages, and projects.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 md:col-span-2 xl:col-span-4">
              <Label htmlFor="ai-history-query">Search</Label>
              <div className="flex gap-2">
                <Input
                  id="ai-history-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Message content, conversation title, user name or email…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") runSearch();
                  }}
                />
                <Button onClick={runSearch} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>User</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.key} — {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-date-from">From</Label>
              <Input
                id="ai-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-date-to">To</Label>
              <Input
                id="ai-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => exportResults("json")} disabled={!results.length}>
              <Download className="mr-1 h-4 w-4" />
              Export JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportResults("csv")} disabled={!results.length}>
              <Download className="mr-1 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasSearched ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results ({results.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches found.</p>
            ) : (
              results.map((row) => (
                <div
                  key={row.messageId}
                  className="rounded-lg border p-4 transition hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{row.conversationTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.userName} · {row.userEmail}
                        {row.projectName ? ` · ${row.projectName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={row.messageRole === "user" ? "default" : "secondary"}>
                        {row.messageRole === "user" ? "User" : "Grok"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(row.messageCreatedAt), "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {snippet(row.messageContent, query)}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-8 px-2"
                    onClick={() => openConversation(row.conversationId)}
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    View conversation
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{viewTitle}</DialogTitle>
            <DialogDescription>{viewMeta} · Read-only</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
            {viewMessages.map((message) => (
              <ChatMessageBubble key={message.id} message={message} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
