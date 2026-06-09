"use client";

import { CheckSquare, LayoutGrid, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { TasksSidebarView } from "./TasksSidebar";

const views: {
  id: Exclude<TasksSidebarView, "settings">;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "issues", label: "Issues", icon: CheckSquare },
  { id: "roadmap", label: "Roadmap", icon: Map },
];

export function TasksViewSwitcher({
  activeView,
  onViewChange,
}: {
  activeView: TasksSidebarView;
  onViewChange: (view: TasksSidebarView) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-1">
      {views.map((view) => {
        const Icon = view.icon;
        const active = activeView === view.id;
        return (
          <Button
            key={view.id}
            type="button"
            size="sm"
            variant={active ? "secondary" : "ghost"}
            className={cn("h-8 gap-1.5", active && "shadow-sm")}
            onClick={() => onViewChange(view.id)}
          >
            <Icon className="h-4 w-4" />
            {view.label}
          </Button>
        );
      })}
    </div>
  );
}
