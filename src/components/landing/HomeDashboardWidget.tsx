"use client";

import { Eye, EyeOff, Minimize2, Maximize2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HomeWidgetConfig } from "@/lib/preferences/workspace";

export function HomeDashboardWidget({
  title,
  description,
  editMode,
  config,
  onToggleVisible,
  onToggleMinimized,
  headerExtra,
  children,
  className,
}: {
  title: string;
  description?: string;
  editMode: boolean;
  config: HomeWidgetConfig;
  onToggleVisible: () => void;
  onToggleMinimized: () => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  if (!config.visible && !editMode) return null;

  return (
    <div className={cn("space-y-2", !config.visible && editMode && "opacity-50", className)}>
      {editMode ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
          <span className="font-medium">{title}</span>
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={onToggleVisible}>
            {config.visible ? (
              <>
                <EyeOff className="mr-1 h-3.5 w-3.5" />
                Hide
              </>
            ) : (
              <>
                <Eye className="mr-1 h-3.5 w-3.5" />
                Show
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={onToggleMinimized}
          >
            {config.minimized ? (
              <>
                <Maximize2 className="mr-1 h-3.5 w-3.5" />
                Expand
              </>
            ) : (
              <>
                <Minimize2 className="mr-1 h-3.5 w-3.5" />
                Minimize
              </>
            )}
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader className={cn(config.minimized && "pb-2")}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{title}</CardTitle>
              {description && !config.minimized ? (
                <CardDescription>{description}</CardDescription>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              {headerExtra}
              {!editMode ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={onToggleMinimized}
                  title={config.minimized ? "Expand widget" : "Minimize widget"}
                >
                  {config.minimized ? (
                    <Maximize2 className="h-4 w-4" />
                  ) : (
                    <Minimize2 className="h-4 w-4" />
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        {!config.minimized ? <CardContent>{children}</CardContent> : null}
      </Card>
    </div>
  );
}
