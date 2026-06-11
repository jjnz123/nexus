"use client";

import { useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";

const DAY_WIDTH = 16;

function toInputDate(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function parseInputDate(value: string) {
  return startOfDay(new Date(`${value}T12:00:00.000Z`));
}

export function RoadmapTimelineBar({
  startDate,
  endDate,
  rangeStart,
  rangeEnd,
  onChange,
}: {
  startDate: string;
  endDate: string;
  rangeStart: Date;
  rangeEnd: Date;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<"move" | "start" | "end" | null>(null);
  const dragRef = useRef<{ startX: number; initialStart: Date; initialEnd: Date } | null>(null);

  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1);
  const trackWidth = totalDays * DAY_WIDTH;

  if (!startDate || !endDate) {
    return (
      <div
        ref={trackRef}
        className="relative h-8 rounded-md border border-dashed bg-muted/20"
        style={{ width: trackWidth }}
      >
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          Set start/end dates
        </span>
      </div>
    );
  }

  const start = parseInputDate(startDate);
  const end = parseInputDate(endDate);
  const leftDays = differenceInCalendarDays(start, rangeStart);
  const spanDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const left = Math.max(0, leftDays * DAY_WIDTH);
  const width = Math.max(DAY_WIDTH, spanDays * DAY_WIDTH);

  function beginDrag(mode: "move" | "start" | "end", clientX: number) {
    setDragMode(mode);
    dragRef.current = { startX: clientX, initialStart: start, initialEnd: end };
  }

  function handlePointerMove(clientX: number) {
    const drag = dragRef.current;
    if (!drag || !dragMode) return;
    const deltaDays = Math.round((clientX - drag.startX) / DAY_WIDTH);
    if (dragMode === "move") {
      const nextStart = addDays(drag.initialStart, deltaDays);
      const nextEnd = addDays(drag.initialEnd, deltaDays);
      onChange(toInputDate(nextStart), toInputDate(nextEnd));
      return;
    }
    if (dragMode === "start") {
      const nextStart = addDays(drag.initialStart, deltaDays);
      if (nextStart <= drag.initialEnd) onChange(toInputDate(nextStart), toInputDate(drag.initialEnd));
      return;
    }
    const nextEnd = addDays(drag.initialEnd, deltaDays);
    if (nextEnd >= drag.initialStart) onChange(toInputDate(drag.initialStart), toInputDate(nextEnd));
  }

  return (
    <div
      ref={trackRef}
      className="relative h-8 rounded-md bg-muted/20"
      style={{ width: trackWidth }}
      onPointerMove={(event) => {
        if (dragMode) handlePointerMove(event.clientX);
      }}
      onPointerUp={() => {
        setDragMode(null);
        dragRef.current = null;
      }}
      onPointerLeave={() => {
        setDragMode(null);
        dragRef.current = null;
      }}
    >
      <div
        className="absolute top-1 flex h-6 items-center rounded-md bg-primary/80 px-1 text-[10px] text-primary-foreground shadow-sm"
        style={{ left, width }}
      >
        <button
          type="button"
          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-primary"
          onPointerDown={(event) => {
            event.preventDefault();
            beginDrag("start", event.clientX);
          }}
        />
        <button
          type="button"
          className="mx-1 flex-1 cursor-grab truncate text-left active:cursor-grabbing"
          onPointerDown={(event) => {
            event.preventDefault();
            beginDrag("move", event.clientX);
          }}
        >
          {format(start, "d MMM")} – {format(end, "d MMM")}
        </button>
        <button
          type="button"
          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-primary"
          onPointerDown={(event) => {
            event.preventDefault();
            beginDrag("end", event.clientX);
          }}
        />
      </div>
    </div>
  );
}

export function RoadmapTimelineHeader({
  rangeStart,
  rangeEnd,
}: {
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1);
  const trackWidth = totalDays * DAY_WIDTH;
  const ticks: Date[] = [];
  let cursor = startOfDay(rangeStart);
  while (cursor <= rangeEnd) {
    ticks.push(cursor);
    cursor = addDays(cursor, 7);
  }

  return (
    <div className="relative h-6 text-[10px] text-muted-foreground" style={{ width: trackWidth }}>
      {ticks.map((tick) => {
        const left = differenceInCalendarDays(tick, rangeStart) * DAY_WIDTH;
        return (
          <span key={tick.toISOString()} className="absolute top-0" style={{ left }}>
            {format(tick, "d MMM")}
          </span>
        );
      })}
    </div>
  );
}

export const ROADMAP_DAY_WIDTH = DAY_WIDTH;
