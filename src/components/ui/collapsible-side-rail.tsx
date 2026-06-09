"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CollapsibleSideRail({
  collapsed,
  onCollapsedChange,
  compactWidth = 56,
  expandedWidth = 256,
  headerIcon,
  headerLabel,
  children,
  className,
  elevatedOnHover = true,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  compactWidth?: number;
  expandedWidth?: number;
  headerIcon: ReactNode;
  headerLabel?: ReactNode;
  children: (props: { showLabels: boolean }) => ReactNode;
  className?: string;
  elevatedOnHover?: boolean;
}) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompact = collapsed && !hoverExpanded;
  const showLabels = !isCompact;
  const width = isCompact ? compactWidth : expandedWidth;

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (!collapsed) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverExpanded(true), 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverExpanded(false);
  };

  return (
    <aside
      style={{ width }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative hidden shrink-0 self-stretch flex-col border-r bg-card/50 transition-[width] duration-200 ease-in-out md:flex",
        collapsed && hoverExpanded && elevatedOnHover && "z-20 shadow-xl",
        className
      )}
    >
      <div
        className={cn(
          "flex h-12 shrink-0 items-center border-b px-2",
          showLabels ? "justify-between gap-2" : "justify-center"
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center",
            showLabels ? "gap-2 px-1" : "h-9 w-9 justify-center"
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center">{headerIcon}</span>
          {showLabels && headerLabel ? (
            <span className="truncate text-lg font-bold tracking-tight">{headerLabel}</span>
          ) : null}
        </div>
        {showLabels ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => onCollapsedChange(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        ) : null}
      </div>

      {!showLabels ? (
        <div className="flex justify-center border-b py-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onCollapsedChange(!collapsed)}
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children({ showLabels })}
      </div>
    </aside>
  );
}

export function SideNavLink({
  href,
  icon: Icon,
  label,
  active,
  showLabels,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  showLabels: boolean;
}) {
  return (
    <a
      href={href}
      title={showLabels ? undefined : label}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium transition-colors",
        showLabels ? "mx-2 gap-3 px-3 py-2" : "mx-auto h-9 w-9 justify-center",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {showLabels ? <span className="truncate">{label}</span> : null}
    </a>
  );
}
