"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RagSearchScope } from "@/lib/db/schema";

export type RagTimeRangePreset = "7d" | "30d" | "all" | "custom";

export type RagTimeRangeResult = {
  dateFrom: string | null;
  dateTo: string | null;
  preset: RagTimeRangePreset;
};

function startOfDayIso(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function endOfDayIso(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  ).toISOString();
}

export function resolveRagTimeRange(preset: RagTimeRangePreset, customFrom?: string, customTo?: string): RagTimeRangeResult {
  const now = new Date();
  if (preset === "all") {
    return { dateFrom: null, dateTo: null, preset };
  }
  if (preset === "7d") {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 7);
    return { dateFrom: startOfDayIso(from), dateTo: endOfDayIso(now), preset };
  }
  if (preset === "30d") {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 30);
    return { dateFrom: startOfDayIso(from), dateTo: endOfDayIso(now), preset };
  }
  return {
    dateFrom: customFrom ? `${customFrom}T00:00:00.000Z` : null,
    dateTo: customTo ? `${customTo}T23:59:59.999Z` : null,
    preset: "custom",
  };
}

export function RagScopeTimeRangeDialog({
  open,
  scope,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  scope: "meetings" | "tasks" | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: RagSearchScope, range: RagTimeRangeResult) => void;
}) {
  const [preset, setPreset] = useState<RagTimeRangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (open) {
      setPreset("30d");
      setCustomFrom("");
      setCustomTo("");
    }
  }, [open, scope]);

  const label = scope === "meetings" ? "Meetings" : scope === "tasks" ? "Tasks" : "Knowledge";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Include {label} in knowledge search</DialogTitle>
          <DialogDescription>
            Choose which time range to include. Only {label.toLowerCase()} within this period will
            be searched.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["7d", "Last 7 days"],
              ["30d", "Last 30 days"],
              ["all", "All time"],
              ["custom", "Custom range"],
            ] as const
          ).map(([value, text]) => (
            <Button
              key={value}
              type="button"
              variant={preset === value ? "default" : "outline"}
              className="justify-start"
              onClick={() => setPreset(value)}
            >
              {text}
            </Button>
          ))}
        </div>

        {preset === "custom" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!scope) return;
              if (preset === "custom" && (!customFrom || !customTo)) return;
              onConfirm(scope, resolveRagTimeRange(preset, customFrom, customTo));
              onOpenChange(false);
            }}
            disabled={preset === "custom" && (!customFrom || !customTo)}
          >
            Enable search
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
