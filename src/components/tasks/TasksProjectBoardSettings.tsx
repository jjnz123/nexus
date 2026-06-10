"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProjectBoardSettings } from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  BOARD_CARD_FIELD_LABELS,
  DEFAULT_BOARD_CARD_FIELDS,
  DEFAULT_BOARD_VISIBLE_TYPES,
  DEFAULT_STALE_DAYS,
  parseProjectBoardSettings,
  type BoardCardFieldKey,
  type ProjectBoardSettings,
} from "@/lib/tasks/project-settings";
import {
  BUG_BOARD_MODE_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  type BugBoardMode,
} from "@/lib/tasks/task-types";
import type { ProjectBoard, TaskType } from "./types";

const CARD_FIELDS: BoardCardFieldKey[] = ["parent", "dueDate", "stale", "subtasks"];

export function TasksProjectBoardSettings({
  board,
  onRefresh,
}: {
  board: ProjectBoard;
  onRefresh: () => Promise<void> | void;
}) {
  const [settings, setSettings] = useState<ProjectBoardSettings>(() =>
    parseProjectBoardSettings(board.project.settings)
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSettings(parseProjectBoardSettings(board.project.settings));
  }, [board.project.settings]);

  function toggleVisibleType(type: TaskType, checked: boolean) {
    setSettings((prev) => {
      const next = checked
        ? [...new Set([...prev.visibleTypes, type])]
        : prev.visibleTypes.filter((value) => value !== type);
      return {
        ...prev,
        visibleTypes: next.length ? next : [...DEFAULT_BOARD_VISIBLE_TYPES],
      };
    });
  }

  function toggleCardField(key: BoardCardFieldKey, checked: boolean) {
    setSettings((prev) => ({
      ...prev,
      cardFields: { ...prev.cardFields, [key]: checked },
    }));
  }

  function resetDefaults() {
    setSettings({
      visibleTypes: [...DEFAULT_BOARD_VISIBLE_TYPES],
      cardFields: { ...DEFAULT_BOARD_CARD_FIELDS },
      staleDays: DEFAULT_STALE_DAYS,
      bugBoardMode: "hide_bugs",
    });
  }

  function save() {
    startTransition(async () => {
      try {
        await updateProjectBoardSettings({
          projectId: board.project.id,
          boardSettings: settings,
        });
        await onRefresh();
        toast.success("Board settings saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save board settings");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h4 className="font-medium">Default ticket types on board</h4>
          <p className="text-sm text-muted-foreground">
            Choose which ticket types appear on the kanban board when the filter is set to All or
            Other tickets. Roadmap and Issues always show all types.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {TASK_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Checkbox
                checked={settings.visibleTypes.includes(type)}
                onCheckedChange={(checked) => toggleVisibleType(type, checked === true)}
              />
              <span>{TASK_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h4 className="font-medium">Bug visibility on board</h4>
          <p className="text-sm text-muted-foreground">
            Controls the default board filter for new sessions. Users can still switch between All,
            Other tickets, and Bugs only on the board.
          </p>
        </div>
        <Select
          value={settings.bugBoardMode}
          onValueChange={(value) =>
            setSettings((prev) => ({ ...prev, bugBoardMode: value as BugBoardMode }))
          }
        >
          <SelectTrigger className="max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(BUG_BOARD_MODE_LABELS) as BugBoardMode[]).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {BUG_BOARD_MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h4 className="font-medium">Board card fields</h4>
          <p className="text-sm text-muted-foreground">
            Toggle optional fields shown on kanban cards for this project.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {CARD_FIELDS.map((key) => (
            <label key={key} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Checkbox
                checked={settings.cardFields[key]}
                onCheckedChange={(checked) => toggleCardField(key, checked === true)}
              />
              <span>{BOARD_CARD_FIELD_LABELS[key]}</span>
            </label>
          ))}
        </div>
        {settings.cardFields.stale ? (
          <div className="space-y-1">
            <Label htmlFor="stale-days">Stale after (days without updates)</Label>
            <Input
              id="stale-days"
              type="number"
              min={1}
              max={365}
              value={settings.staleDays}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  staleDays: Number(event.target.value) || DEFAULT_STALE_DAYS,
                }))
              }
              className="w-[120px]"
            />
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={resetDefaults}>
          Reset defaults
        </Button>
        <Button type="button" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save board settings"}
        </Button>
      </div>
    </div>
  );
}
