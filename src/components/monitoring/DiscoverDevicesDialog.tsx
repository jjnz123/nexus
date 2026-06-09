"use client";

import { useEffect, useState, useTransition } from "react";
import { Radar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  bulkCreateMonitorDevices,
  discoverUnmonitoredTargets,
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

type Candidate = { id: string; name: string; target: string };

export function DiscoverDevicesDialog({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checkType, setCheckType] = useState<"http" | "ping" | "tcp">("http");
  const [intervalSec, setIntervalSec] = useState("60");
  const [timeoutMs, setTimeoutMs] = useState("5000");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void discoverUnmonitoredTargets()
      .then((items) => {
        setCandidates(items);
        setSelected(new Set(items.map((item) => item.id)));
      })
      .catch(() => toast.error("Failed to discover targets"))
      .finally(() => setLoading(false));
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function createSelected() {
    const targets = candidates.filter((c) => selected.has(c.id));
    if (!targets.length) return;

    startTransition(async () => {
      try {
        await bulkCreateMonitorDevices({
          targets: targets.map((t) => ({ name: t.name, target: t.target })),
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Radar className="h-4 w-4" />
          Discover targets
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Discover unmonitored targets</DialogTitle>
          <DialogDescription>
            Finds enabled bookmark URLs that are not yet configured as monitor devices.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning bookmarks…
          </div>
        ) : candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            All bookmark URLs appear to be monitored already.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
              {candidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent/50"
                >
                  <Checkbox
                    checked={selected.has(candidate.id)}
                    onCheckedChange={() => toggle(candidate.id)}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{candidate.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{candidate.target}</p>
                  </div>
                </label>
              ))}
            </div>

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
                <Input
                  type="number"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Timeout (ms)</Label>
                <Input
                  type="number"
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={createSelected}
                disabled={selected.size === 0 || isPending}
              >
                {isPending
                  ? "Creating…"
                  : `Create ${selected.size} monitor${selected.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
