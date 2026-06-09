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
import { GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createColumn,
  createLabel,
  deleteColumn,
  reorderColumns,
  updateColumn,
} from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectBoard } from "./types";
import { TasksProjectFieldSettings } from "./TasksProjectFieldSettings";

function SortableColumnRow({
  column,
  onSave,
  onDelete,
}: {
  column: ProjectBoard["columns"][number];
  onSave: (columnId: string, name: string, color: string, wipLimit: string) => void;
  onDelete: (columnId: string, columnName: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: column.id,
  });
  const [name, setName] = useState(column.name);
  const [color, setColor] = useState(column.color);
  const [wipLimit, setWipLimit] = useState(column.wipLimit?.toString() ?? "");

  useEffect(() => {
    setName(column.name);
    setColor(column.color);
    setWipLimit(column.wipLimit?.toString() ?? "");
  }, [column]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="grid gap-2 rounded-lg border p-3 md:grid-cols-[auto_1fr_120px_100px_auto_auto]"
    >
      <button
        type="button"
        className="self-center rounded p-1 text-muted-foreground hover:bg-accent"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder column"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#6366f1" />
      <Input
        value={wipLimit}
        onChange={(e) => setWipLimit(e.target.value)}
        placeholder="WIP"
        type="number"
      />
      {column.isBacklog ? (
        <Badge variant="secondary" className="self-center">
          Backlog
        </Badge>
      ) : (
        <span />
      )}
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => onSave(column.id, name, color, wipLimit)}>
          Save
        </Button>
        {!column.isBacklog ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => onDelete(column.id, column.name)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function TasksProjectSettings({
  board,
  onRefresh,
}: {
  board: ProjectBoard;
  onRefresh: () => Promise<void> | void;
}) {
  const [columns, setColumns] = useState(
    [...board.columns].sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [isPending, startTransition] = useTransition();
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnColor, setNewColumnColor] = useState("#6366f1");
  const [newColumnWip, setNewColumnWip] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#22c55e");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    setColumns([...board.columns].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [board.columns]);

  const saveColumn = (columnId: string, nextName: string, nextColor: string, nextWip: string) => {
    startTransition(async () => {
      try {
        await updateColumn(columnId, {
          name: nextName.trim(),
          color: nextColor,
          wipLimit: nextWip.trim() ? Number(nextWip) : null,
        });
        await onRefresh();
        toast.success("Column updated");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update column");
      }
    });
  };

  const deleteColumnNow = (columnId: string, columnName: string) => {
    if (!window.confirm(`Delete column "${columnName}"?`)) return;
    startTransition(async () => {
      try {
        await deleteColumn(columnId);
        await onRefresh();
        toast.success("Column deleted");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to delete column");
      }
    });
  };

  const createColumnNow = () => {
    if (!newColumnName.trim()) return;
    startTransition(async () => {
      try {
        await createColumn({
          projectId: board.project.id,
          name: newColumnName.trim(),
          color: newColumnColor,
          wipLimit: newColumnWip.trim() ? Number(newColumnWip) : null,
        });
        setNewColumnName("");
        setNewColumnWip("");
        await onRefresh();
        toast.success("Column created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create column");
      }
    });
  };

  const createLabelNow = () => {
    if (!newLabelName.trim()) return;
    startTransition(async () => {
      try {
        await createLabel({
          projectId: board.project.id,
          name: newLabelName.trim(),
          color: newLabelColor,
        });
        setNewLabelName("");
        await onRefresh();
        toast.success("Label created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create label");
      }
    });
  };

  const onColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columns.findIndex((c) => c.id === active.id);
    const newIndex = columns.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(columns, oldIndex, newIndex).map((column, index) => ({
      ...column,
      sortOrder: index,
    }));
    setColumns(next);
    startTransition(async () => {
      try {
        await reorderColumns(next.map((c) => ({ id: c.id, sortOrder: c.sortOrder })));
        await onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to reorder columns");
      }
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Board columns</h3>
          <p className="text-sm text-muted-foreground">
            Drag to reorder columns. The backlog column stays in settings only — it does not appear
            on the kanban board.
          </p>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onColumnDragEnd}>
          <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {columns.map((column) => (
                <SortableColumnRow
                  key={column.id}
                  column={column}
                  onSave={saveColumn}
                  onDelete={deleteColumnNow}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_140px_120px_auto]">
          <Input
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="Column name"
          />
          <Input
            value={newColumnColor}
            onChange={(e) => setNewColumnColor(e.target.value)}
            placeholder="#6366f1"
          />
          <Input
            value={newColumnWip}
            onChange={(e) => setNewColumnWip(e.target.value)}
            placeholder="WIP"
            type="number"
          />
          <Button onClick={createColumnNow} disabled={!newColumnName.trim() || isPending}>
            Add column
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Labels</h3>
        <div className="flex flex-wrap gap-2">
          {board.labels.map((label) => (
            <Badge
              key={label.id}
              variant="outline"
              className="border-transparent"
              style={{ backgroundColor: `${label.color}30`, color: label.color }}
            >
              {label.name}
            </Badge>
          ))}
        </div>
        <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_140px_auto]">
          <Input
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
            placeholder="Label name"
          />
          <Input
            value={newLabelColor}
            onChange={(e) => setNewLabelColor(e.target.value)}
            placeholder="#22c55e"
          />
          <Button onClick={createLabelNow} disabled={!newLabelName.trim() || isPending}>
            Add label
          </Button>
        </div>
      </section>

      <TasksProjectFieldSettings board={board} onRefresh={onRefresh} />
    </div>
  );
}
