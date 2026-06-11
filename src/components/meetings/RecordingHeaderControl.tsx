"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Mic, Square } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRecordingOptional } from "@/components/meetings/recording-context";
import { RecordingLevelLadder } from "@/components/meetings/RecordingLevelLadder";
import { getLatestMeeting } from "@/server/actions/meetings";
import {
  channelLabel,
  formatDbfs,
  meterBarColor,
} from "@/lib/recording/meters";
import { maxPeakDbfs } from "@/lib/recording/use-audio-levels";
import { cn } from "@/lib/utils";

function DbfsMeter({
  label,
  peakDbfs,
  peakHoldDbfs,
  percent,
}: {
  label: string;
  peakDbfs: number;
  peakHoldDbfs: number;
  percent: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">
          {formatDbfs(peakDbfs)}
          {peakHoldDbfs > peakDbfs + 0.5 ? (
            <span className="ml-1 text-muted-foreground/80">H {formatDbfs(peakHoldDbfs)}</span>
          ) : null}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-75", meterBarColor(peakDbfs))}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/70">
        <span>-60</span>
        <span>0 dBFS</span>
      </div>
    </div>
  );
}

export function RecordingHeaderControl() {
  const recording = useRecordingOptional();
  const isRecording = Boolean(recording?.isRecording && recording.activeRecording);

  const { data: latestMeeting } = useQuery({
    queryKey: ["latest-meeting"],
    queryFn: getLatestMeeting,
    enabled: !isRecording,
    staleTime: 60_000,
  });

  if (!recording) return null;

  const { activeRecording, durationLabel, channelCount, levels, stopRecording } = recording;

  if (isRecording && activeRecording) {
    const projectLabel =
      activeRecording.projectName ??
      (activeRecording.projectKey ? activeRecording.projectKey : "No project");
    const headerPeakDbfs = maxPeakDbfs(levels);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="relative h-9 gap-1.5 px-2 text-red-500 hover:text-red-600"
            aria-label="Recording in progress"
          >
            <Mic className="h-5 w-5 shrink-0" />
            <RecordingLevelLadder peakDbfs={headerPeakDbfs} />
            <span className="absolute right-0.5 top-0.5 h-2 w-2 animate-pulse rounded-full bg-red-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Recording
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="space-y-3 px-2 py-1 text-sm">
            <div>
              <p className="font-medium">{activeRecording.title}</p>
              <p className="text-xs text-muted-foreground">{projectLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{durationLabel}</Badge>
              <Badge variant="outline">
                {channelCount} channel{channelCount === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="space-y-2">
              {levels.peakDbfs.map((peakDbfs, index) => (
                <DbfsMeter
                  key={index}
                  label={channelLabel(index, levels.channels)}
                  peakDbfs={peakDbfs}
                  peakHoldDbfs={levels.peakHoldDbfs[index] ?? -60}
                  percent={levels.levelsPercent[index] ?? 0}
                />
              ))}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={`/meetings/${activeRecording.meetingId}`}>Open meeting</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn("gap-2 text-destructive focus:text-destructive")}
            onClick={() => stopRecording()}
          >
            <Square className="h-4 w-4" />
            Stop recording
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground/60 hover:text-muted-foreground"
          aria-label="Recording status"
        >
          <Mic className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Recording</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="space-y-3 px-2 py-2 text-sm">
          <p className="text-muted-foreground">Nothing is currently recording</p>
          {latestMeeting ? (
            <Link
              href={`/meetings/${latestMeeting.id}`}
              className="block rounded-md border bg-muted/30 p-3 transition hover:bg-muted/50"
            >
              <p className="text-xs font-medium text-muted-foreground">Last meeting</p>
              <p className="font-medium">{latestMeeting.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(latestMeeting.meetingAt), { addSuffix: true })}
              </p>
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">
              No meetings yet.{" "}
              <Link href="/meetings" className="text-primary underline-offset-4 hover:underline">
                Open Meeting Assistant
              </Link>
            </p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
