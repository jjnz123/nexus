"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CollapsibleSideRail({
  collapsed,
  onCollapsedChange,
  compactWidth = 56,
  expandedWidth = 256,
  header,
  compactContent,
  children,
  className,
  elevatedOnHover = true,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  compactWidth?: number;
  expandedWidth?: number;
  header?: ReactNode;
  compactContent: ReactNode;
  children: ReactNode;
  className?: string;
  elevatedOnHover?: boolean;
}) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const isCompact = collapsed && !hoverExpanded;
  const showLabels = !isCompact;

  return (
    <motion.aside
      animate={{ width: isCompact ? compactWidth : expandedWidth }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      onMouseEnter={() => collapsed && setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      className={cn(
        "relative hidden h-full shrink-0 flex-col border-r bg-card/50 md:flex",
        collapsed && hoverExpanded && elevatedOnHover && "z-20 shadow-xl",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center border-b p-2",
          showLabels ? "justify-between px-3" : "justify-center"
        )}
      >
        {showLabels ? header : null}
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
      </div>

      <AnimatePresence initial={false} mode="wait">
        {showLabels ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="compact"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2"
          >
            {compactContent}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
