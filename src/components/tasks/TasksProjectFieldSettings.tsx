"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { updateProjectFieldSettings } from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_TICKET_FIELD_SETTINGS,
  parseProjectTicketFieldSettings,
  type ProjectTicketFieldSettings,
  type TicketFieldConfig,
} from "@/lib/tasks/ticket-fields";
import { TASK_TYPES, TASK_TYPE_LABELS } from "@/lib/tasks/task-types";
import type { ProjectBoard, TaskType } from "./types";

function SortableFieldRow({
  field,
  onToggle,
}: {
  field: TicketFieldConfig;
  onToggle: (key: TicketFieldConfig["key"], visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: field.key,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 rounded-md border px-2 py-2"
    >
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox
        checked={field.visible}
        onCheckedChange={(checked) => onToggle(field.key, checked === true)}
      />
      <span className="flex-1 text-sm">{field.label}</span>
      {field.visible ? (
        <Eye className="h-4 w-4 text-muted-foreground" />
      ) : (
        <EyeOff className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}

export function TasksProjectFieldSettings({
  board,
  onRefresh,
}: {
  board: ProjectBoard;
  onRefresh: () => Promise<void> | void;
}) {
  const [selectedType, setSelectedType] = useState<TaskType>("story");
  const [settings, setSettings] = useState<ProjectTicketFieldSettings>(() =>
    parseProjectTicketFieldSettings(board.project.settings)
  );
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    setSettings(parseProjectTicketFieldSettings(board.project.settings));
  }, [board.project.settings]);

  const fields = settings[selectedType];

  function toggleField(key: TicketFieldConfig["key"], visible: boolean) {
    setSettings((prev) => ({
      ...prev,
      [selectedType]: prev[selectedType].map((field) =>
        field.key === key ? { ...field, visible } : field
      ),
    }));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((field) => field.key === active.id);
    const newIndex = fields.findIndex((field) => field.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setSettings((prev) => ({
      ...prev,
      [selectedType]: arrayMove(prev[selectedType], oldIndex, newIndex),
    }));
  }

  function resetType() {
    setSettings((prev) => ({
      ...prev,
      [selectedType]: DEFAULT_TICKET_FIELD_SETTINGS[selectedType],
    }));
  }

  function saveSettings() {
    startTransition(async () => {
      try {
        await updateProjectFieldSettings({
          projectId: board.project.id,
          ticketFields: Object.fromEntries(
            TASK_TYPES.map((type) => [
              type,
              settings[type].map(({ key, visible }) => ({ key, visible })),
            ])
          ),
        });
        await onRefresh();
        toast.success("Ticket field settings saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save field settings");
      }
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Ticket fields by type</h3>
          <p className="text-sm text-muted-foreground">
            Control which fields appear in the ticket modal, backlog create form, and roadmap.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedType} onValueChange={(v) => setSelectedType(v as TaskType)}>
            <SelectTrigger className="w-[140px] capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {TASK_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={resetType}>
            Reset type
          </Button>
          <Button onClick={saveSettings} disabled={isPending}>
            Save fields
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={fields.map((field) => field.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {fields.map((field) => (
              <SortableFieldRow key={field.key} field={field} onToggle={toggleField} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
