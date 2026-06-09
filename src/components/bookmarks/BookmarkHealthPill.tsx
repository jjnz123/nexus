"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type HealthStatus = "up" | "down" | "unknown" | "degraded";

const statusStyles: Record<HealthStatus, string> = {
  up: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  down: "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse",
  degraded: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  unknown: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
};

const statusLabel: Record<HealthStatus, string> = {
  up: "Up",
  down: "Down",
  degraded: "Degraded",
  unknown: "Unknown",
};

export function BookmarkHealthPill({
  status,
  checkedAt,
  deviceId,
  deviceName,
}: {
  status: HealthStatus;
  checkedAt: Date | string | null;
  deviceId: string;
  deviceName: string;
}) {
  const checkedLabel = checkedAt
    ? formatDistanceToNow(new Date(checkedAt), { addSuffix: true })
    : "never";

  return (
    <Link
      href={`/monitoring/${deviceId}`}
      onClick={(e) => e.stopPropagation()}
      title={`${deviceName} — last checked ${checkedLabel}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-90",
        statusStyles[status]
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel[status]}
    </Link>
  );
}
