"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bookmark,
  Bot,
  CheckSquare,
  Home,
  LayoutDashboard,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasPermission, type UserPermissionOverrides } from "@/lib/permissions";
import type { UserRole } from "@/lib/db/schema";
import { CollapsibleSideRail } from "@/components/ui/collapsible-side-rail";
import { ProfileMenu } from "./ProfileMenu";
import { updateBookmarkPreferences } from "@/server/actions/preferences";

const navItems: {
  href: string;
  label: string;
  icon: LucideIcon;
  perm?: "ai:use" | "bookmarks:view" | "tasks:view" | "monitoring:view";
}[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chat", label: "AI Chat", icon: Bot, perm: "ai:use" },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark, perm: "bookmarks:view" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, perm: "tasks:view" },
  { href: "/monitoring", label: "Monitoring", icon: Activity, perm: "monitoring:view" },
];

function NavLink({
  item,
  active,
  showLabels,
}: {
  item: (typeof navItems)[number];
  active: boolean;
  showLabels: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={showLabels ? undefined : item.label}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium transition-colors",
        showLabels ? "mx-2 gap-3 px-3 py-2" : "mx-auto h-9 w-9 justify-center",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {showLabels ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

export function AppShell({
  children,
  user,
  portalSubtitle,
  portalSubtitleEnabled,
  initialAppSidebarCollapsed,
}: {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    role: UserRole;
    avatarPath: string | null;
    permissions: UserPermissionOverrides | null;
  };
  portalSubtitle: string;
  portalSubtitleEnabled: boolean;
  initialAppSidebarCollapsed: boolean;
}) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialAppSidebarCollapsed);

  const visibleNav = navItems.filter(
    (item) => !item.perm || hasPermission(user.role, item.perm, user.permissions)
  );

  const handleSidebarCollapsedChange = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    void updateBookmarkPreferences({ appSidebarCollapsed: collapsed });
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <CollapsibleSideRail
        collapsed={sidebarCollapsed}
        onCollapsedChange={handleSidebarCollapsedChange}
        expandedWidth={256}
        headerIcon={<LayoutDashboard className="h-5 w-5 text-primary" />}
        headerLabel="Nexus"
      >
        {({ showLabels }) => (
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto py-2">
            {visibleNav.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <NavLink key={item.href} item={item} active={active} showLabels={showLabels} />
              );
            })}
          </nav>
        )}
      </CollapsibleSideRail>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <span className="font-semibold">Nexus</span>
          </div>
          {portalSubtitleEnabled && portalSubtitle ? (
            <div className="hidden text-sm text-muted-foreground md:block">
              {portalSubtitle}
            </div>
          ) : (
            <div className="hidden md:block" />
          )}
          <ProfileMenu
            user={user}
            navItems={visibleNav.map((item) => ({ href: item.href, label: item.label }))}
          />
        </header>

        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="min-h-0 flex-1 overflow-auto p-4 md:p-6"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
