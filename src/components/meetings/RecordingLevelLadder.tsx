"use client";

import { dbToMeterPercent } from "@/lib/recording/meters";
import { cn } from "@/lib/utils";

const SEGMENT_COUNT = 5;

function segmentColor(dbfs: number, segmentIndex: number, segmentCount: number) {
  const thresholdStart = -60 + (segmentIndex / segmentCount) * 60;
  const thresholdEnd = -60 + ((segmentIndex + 1) / segmentCount) * 60;
  if (dbfs < thresholdStart) return "bg-muted/40";
  if (dbfs >= -6 && segmentIndex >= segmentCount - 2) return "bg-red-500";
  if (dbfs >= -18 && segmentIndex >= segmentCount - 3) return "bg-yellow-500";
  if (dbfs >= thresholdEnd) return "bg-green-500";
  if (dbfs >= thresholdStart) return "bg-green-500/70";
  return "bg-muted/40";
}

export function RecordingLevelLadder({
  peakDbfs,
  className,
}: {
  peakDbfs: number;
  className?: string;
}) {
  const percent = dbToMeterPercent(peakDbfs);
  const litSegments = Math.round((percent / 100) * SEGMENT_COUNT);

  return (
    <div
      className={cn("flex h-5 flex-col-reverse gap-0.5", className)}
      aria-hidden
    >
      {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
        <div
          key={index}
          className={cn(
            "h-0.5 w-2 rounded-sm transition-colors duration-75",
            index < litSegments
              ? segmentColor(peakDbfs, index, SEGMENT_COUNT)
              : "bg-muted/40"
          )}
        />
      ))}
    </div>
  );
}
