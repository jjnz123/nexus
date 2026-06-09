"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Radar, Wifi } from "lucide-react";
import { toast } from "sonner";
import {
  bulkCreateMonitorDevices,
  discoverUnmonitoredTargets,
  scanNetworkForDevices,
} from "@/server/actions/monitoring";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type BookmarkCandidate = { id: string; name: string; target: string };
type NetworkCandidate = {
  id: string;
  name: string;
  target: string;
  ip: string;
  openPorts: number[];
  suggestedCheckType: "http" | "ping" | "tcp";
};

function CandidateList({
  items,
  selected,
  onToggle,
  renderMeta,
}: {
  items: { id: string; name: string; target: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  renderMeta?: (item: { id: string; name: string; target: string }) => React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No new devices found for this scan.
      </p>
    );
  }

  return (
    <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
      {items.map((item) => (
        <label
          key={item.id}
          className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent/50"
        >
          <Checkbox checked={selected.has(item.id)} onCheckedChange={() => onToggle(item.id)} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="truncate text-xs text-muted-foreground">{item.target}</p>
            {renderMeta?.(item)}
          </div>
        </label>
      ))}
    </div>
  );
}

function MonitorOptions({
  checkType,
  setCheckType,
  intervalSec,
  setIntervalSec,
  timeoutMs,
  setTimeoutMs,
}: {
  checkType: "http" | "ping" | "tcp";
  setCheckType: (value: "http" | "ping" | "tcp") => void;
  intervalSec: string;
  setIntervalSec: (value: string) => void;
  timeoutMs: string;
  setTimeoutMs: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label>Check type</Label>
        <Select value={checkType} onValueChange={(v) => setCheckType(v as typeof checkType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="http">HTTP</SelectItem>
            <SelectItem value="ping">Ping</SelectItem>
            <SelectItem value="tcp">TCP</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Interval (sec)</Label>
        <Input type="number" value={intervalSec} onChange={(e) => setIntervalSec(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Timeout (ms)</Label>
        <Input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />
      </div>
    </div>
  );
}

export function DiscoverDevicesDialog({ onComplete }: { onComplete?: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"bookmarks" | "network">("bookmarks");
  const [loading, setLoading] = useState(false);
  const [bookmarkCandidates, setBookmarkCandidates] = useState<BookmarkCandidate[]>([]);
  const [networkCandidates, setNetworkCandidates] = useState<NetworkCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [networkRange, setNetworkRange] = useState("192.168.1.0/24");
  const [checkType, setCheckType] = useState<"http" | "ping" | "tcp">("http");
  const [intervalSec, setIntervalSec] = useState("60");
  const [timeoutMs, setTimeoutMs] = useState("5000");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || tab !== "bookmarks") return;
    setLoading(true);
    void discoverUnmonitoredTargets()
      .then((items) => {
        setBookmarkCandidates(items);
        setSelected(new Set(items.map((item) => item.id)));
      })
      .catch(() => toast.error("Failed to discover bookmark targets"))
      .finally(() => setLoading(false));
  }, [open, tab]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runNetworkScan() {
    setLoading(true);
    void scanNetworkForDevices({ range: networkRange })
      .then((items) => {
        setNetworkCandidates(items);
        setSelected(new Set(items.map((item) => item.id)));
        if (items.length === 0) toast.message("Scan complete — no new hosts with open ports");
        else toast.success(`Found ${items.length} host${items.length === 1 ? "" : "s"}`);
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Network scan failed")
      )
      .finally(() => setLoading(false));
  }

  function createSelected() {
    const bookmarkTargets = bookmarkCandidates.filter((c) => selected.has(c.id));
    const networkTargets = networkCandidates.filter((c) => selected.has(c.id));
    const targets =
      tab === "bookmarks"
        ? bookmarkTargets.map((t) => ({ name: t.name, target: t.target }))
        : networkTargets.map((t) => ({
            name: t.name,
            target: t.target,
          }));

    if (!targets.length) return;

    startTransition(async () => {
      try {
        await bulkCreateMonitorDevices({
          targets,
          checkType,
          intervalSec: Number(intervalSec) || 60,
          timeoutMs: Number(timeoutMs) || 5000,
        });
        toast.success(`Created ${targets.length} monitor${targets.length === 1 ? "" : "s"}`);
        setOpen(false);
        onComplete?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Bulk create failed");
      }
    });
  }

  const activeItems = tab === "bookmarks" ? bookmarkCandidates : networkCandidates;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Radar className="h-4 w-4" />
          Discover devices
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Discover devices</DialogTitle>
          <DialogDescription>
            Review discovered targets and selectively add them to monitoring. Network scans probe
            common ports (80, 443, 22, 8080) within your specified range.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bookmarks">Bookmark URLs</TabsTrigger>
            <TabsTrigger value="network">Network scan</TabsTrigger>
          </TabsList>

          <TabsContent value="bookmarks" className="space-y-4 pt-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning bookmarks…
              </div>
            ) : (
              <>
                <CandidateList
                  items={bookmarkCandidates}
                  selected={selected}
                  onToggle={toggle}
                />
                <MonitorOptions
                  checkType={checkType}
                  setCheckType={setCheckType}
                  intervalSec={intervalSec}
                  setIntervalSec={setIntervalSec}
                  timeoutMs={timeoutMs}
                  setTimeoutMs={setTimeoutMs}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="network" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="network-range">Network range</Label>
              <div className="flex gap-2">
                <Input
                  id="network-range"
                  value={networkRange}
                  onChange={(e) => setNetworkRange(e.target.value)}
                  placeholder="192.168.1.0/24 or 192.168.1.1-50"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 gap-1"
                  disabled={loading}
                  onClick={runNetworkScan}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wifi className="h-4 w-4" />
                  )}
                  Scan
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Limited to 254 hosts. Only hosts not already monitored are listed.
              </p>
            </div>

            {!loading && networkCandidates.length > 0 ? (
              <>
                <CandidateList
                  items={networkCandidates}
                  selected={selected}
                  onToggle={toggle}
                  renderMeta={(item) => {
                    const match = networkCandidates.find((c) => c.id === item.id);
                    if (!match) return null;
                    return (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Open ports: {match.openPorts.join(", ")} · suggested {match.suggestedCheckType}
                      </p>
                    );
                  }}
                />
                <MonitorOptions
                  checkType={checkType}
                  setCheckType={setCheckType}
                  intervalSec={intervalSec}
                  setIntervalSec={setIntervalSec}
                  timeoutMs={timeoutMs}
                  setTimeoutMs={setTimeoutMs}
                />
              </>
            ) : loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning network…
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Enter a range and click Scan to discover devices.
              </p>
            )}
          </TabsContent>
        </Tabs>

        {activeItems.length > 0 && !loading ? (
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createSelected} disabled={selected.size === 0 || isPending}>
              {isPending
                ? "Creating…"
                : `Add ${selected.size} device${selected.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
