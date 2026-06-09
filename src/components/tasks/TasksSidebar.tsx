"use client";

import { CheckSquare, LayoutGrid, Map, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapsibleSideRail } from "@/components/ui/collapsible-side-rail";
import { Button } from "@/components/ui/button";

export type TasksSidebarView = "board" | "issues" | "roadmap" | "settings";

const items: { id: TasksSidebarView; label: string; icon: typeof LayoutGrid }[] = [
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "issues", label: "Issues", icon: CheckSquare },
  { id: "roadmap", label: "Roadmap", icon: Map },
  { id: "settings", label: "Project settings", icon: Settings2 },
];

export function TasksSidebar({
  activeView,
  onViewChange,
  collapsed,
  onCollapsedChange,
}: {
  activeView: TasksSidebarView;
  onViewChange: (view: TasksSidebarView) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  return (
    <CollapsibleSideRail
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      expandedWidth={220}
      headerIcon={<CheckSquare className="h-5 w-5 text-primary" />}
      headerLabel="Tasks"
    >
      {({ showLabels }) => (
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                title={showLabels ? undefined : item.label}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "w-full justify-start font-normal",
                  showLabels ? "mx-2 px-3" : "mx-auto h-9 w-9 justify-center px-0",
                  active && "bg-primary/15 text-primary hover:bg-primary/15 hover:text-primary"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {showLabels ? <span className="truncate">{item.label}</span> : null}
              </Button>
            );
          })}
        </nav>
      )}
    </CollapsibleSideRail>
  );
}
