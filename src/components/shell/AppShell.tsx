"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bookmark,
  CheckSquare,
  Home,
  LayoutDashboard,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import type { UserRole } from "@/lib/db/schema";
import { ProfileMenu } from "./ProfileMenu";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark, perm: "bookmarks:view" as const },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, perm: "tasks:view" as const },
  { href: "/monitoring", label: "Monitoring", icon: Activity, perm: "monitoring:view" as const },
];

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: UserRole; avatarPath: string | null };
}) {
  const pathname = usePathname();

  const visibleNav = navItems.filter(
    (item) => !item.perm || hasPermission(user.role, item.perm)
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 border-r bg-card/50 p-4 md:block">
        <div className="mb-8 flex items-center gap-2 px-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">Nexus</span>
        </div>
        <nav className="space-y-1">
          {visibleNav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <span className="font-semibold">Nexus</span>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            Internal Operations Portal
          </div>
          <ProfileMenu user={user} />
        </header>

        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex-1 overflow-auto p-4 md:p-6"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
