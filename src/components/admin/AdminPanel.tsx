"use client";

import { useSearchParams } from "next/navigation";
import type { AuditLog, SystemSettings } from "@/lib/db/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagement } from "./UserManagement";
import { AuditLogViewer } from "./AuditLogViewer";
import { SystemSettingsPanel } from "./SystemSettingsPanel";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: import("@/lib/db/schema").UserRole;
  disabled: boolean;
  avatarPath: string | null;
  permissions: import("@/lib/permissions").UserPermissionOverrides | null;
  createdAt: Date;
};

export function AdminPanel({
  users,
  auditLogs,
  auditTotal,
  auditActions,
  settings,
}: {
  users: UserRow[];
  auditLogs: AuditLog[];
  auditTotal: number;
  auditActions: string[];
  settings: SystemSettings;
}) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const defaultTab =
    tabParam === "audit" ? "audit" : tabParam === "settings" ? "settings" : "users";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Manage users, system settings, and review audit activity.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UserManagement users={users} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SystemSettingsPanel settings={settings} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditLogViewer
            initialLogs={auditLogs}
            initialTotal={auditTotal}
            actions={auditActions}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
