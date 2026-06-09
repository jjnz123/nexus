"use client";

import { useMemo, useState, useTransition } from "react";
import { Bot, Download, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { AuditLog } from "@/lib/db/schema";
import { exportAuditLogs, getAuditLogs } from "@/server/actions/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AuditLogViewerProps = {
  initialLogs: AuditLog[];
  initialTotal: number;
  actions: string[];
};

export function AuditLogViewer({
  initialLogs,
  initialTotal,
  actions,
}: AuditLogViewerProps) {
  const [logs, setLogs] = useState(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [action, setAction] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState(
    "Summarize recent activity, flag anomalies, and suggest follow-ups."
  );
  const [aiResult, setAiResult] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      userEmail: userEmail || undefined,
      action: action || undefined,
      limit: 100,
      offset: 0,
    }),
    [search, userEmail, action]
  );

  const refresh = () => {
    startTransition(async () => {
      try {
        const result = await getAuditLogs(filters);
        setLogs(result.logs);
        setTotal(result.total);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load audit logs");
      }
    });
  };

  const handleExport = () => {
    startTransition(async () => {
      try {
        const payload = await exportAuditLogs(filters);
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `nexus-audit-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${payload.count} log entries`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Export failed");
      }
    });
  };

  const analyzeWithAi = async () => {
    setIsAnalyzing(true);
    setAiResult("");
    try {
      const response = await fetch("/api/ai/audit-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logs: logs.map((log) => ({
            createdAt: log.createdAt.toISOString(),
            userName: log.userName,
            userEmail: log.userEmail,
            action: log.action,
            summary: log.summary,
            details: log.details ?? {},
          })),
          question: aiQuestion,
        }),
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(text || "AI analysis failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event
            .split("\n")
            .map((part) => part.trim())
            .find((part) => part.startsWith("data:"));
          if (!line) continue;
          const data = line.replace(/^data:\s*/, "");
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) setAiResult((current) => current + delta);
          } catch {
            // ignore malformed chunks
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
          <CardDescription>
            Track user actions across Nexus. Export logs or send them to AI for analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="audit-search">Search</Label>
              <Input
                id="audit-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Summary, user, resource..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-email">User email</Label>
              <Input
                id="audit-email"
                value={userEmail}
                onChange={(event) => setUserEmail(event.target.value)}
                placeholder="joel@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audit-action">Action</Label>
              <Input
                id="audit-action"
                value={action}
                onChange={(event) => setAction(event.target.value)}
                placeholder="bookmarks.card.create"
                list="audit-actions"
              />
              <datalist id="audit-actions">
                {actions.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={refresh} disabled={isPending} className="flex-1">
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExport} disabled={isPending}>
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
            <Button onClick={() => setAiOpen(true)} disabled={logs.length === 0}>
              <Bot className="mr-2 h-4 w-4" />
              Analyze with AI
            </Button>
            <Badge variant="secondary">{total} total entries</Badge>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div>{log.userName ?? "System"}</div>
                      <div className="text-xs text-muted-foreground">{log.userEmail ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{log.action}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div>{log.summary}</div>
                      {log.resourceId && (
                        <div className="text-xs text-muted-foreground">
                          {log.resource}:{log.resourceId}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      No audit log entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Audit Analysis</DialogTitle>
            <DialogDescription>
              Analyze the currently loaded audit log entries ({logs.length} rows).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="ai-question">Question for AI</Label>
              <Textarea
                id="ai-question"
                value={aiQuestion}
                onChange={(event) => setAiQuestion(event.target.value)}
                rows={3}
              />
            </div>
            <Button onClick={analyzeWithAi} disabled={isAnalyzing}>
              {isAnalyzing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              Run analysis
            </Button>
            {aiResult && (
              <div className="max-h-80 overflow-y-auto rounded-lg border bg-muted/20 p-3 text-sm whitespace-pre-wrap">
                {aiResult}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
