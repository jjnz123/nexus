"use client";

import Link from "next/link";
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
import { cn } from "@/lib/utils";

function LevelMeter({ label, percent, db }: { label: string; percent: number; db: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span>{Math.round(db)} dB</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-green-500 transition-[width] duration-75"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function RecordingHeaderControl() {
  const recording = useRecordingOptional();
  if (!recording?.isRecording || !recording.activeRecording) return null;

  const { activeRecording, durationLabel, channelCount, levels, stopRecording } = recording;
  const projectLabel =
    activeRecording.projectName ??
    (activeRecording.projectKey ? activeRecording.projectKey : "No project");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-red-500 hover:text-red-600"
          aria-label="Recording in progress"
        >
          <Mic className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-red-500" />
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
            {levels.levelsPercent.map((percent, index) => (
              <LevelMeter
                key={index}
                label={levels.channels > 1 ? `Ch ${index + 1}` : "Level"}
                percent={percent}
                db={levels.levelsDb[index] ?? -60}
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
