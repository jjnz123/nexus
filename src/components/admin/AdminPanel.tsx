"use client";

import { useSearchParams } from "next/navigation";
import type { AuditLog, SystemSettings } from "@/lib/db/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiHistoryPanel } from "./AiHistoryPanel";
import { UserManagement } from "./UserManagement";
import { AuditLogViewer } from "./AuditLogViewer";
import { SystemSettingsPanel } from "./SystemSettingsPanel";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: import("@/lib/db/schema").UserRole;
  status: import("@/lib/db/schema").UserStatus;
  disabled: boolean;
  avatarPath: string | null;
  permissions: import("@/lib/permissions").UserPermissionOverrides | null;
  createdAt: Date;
};

type AiProjectOption = {
  id: string;
  name: string;
  userId: string;
  userName: string;
};

export function AdminPanel({
  users,
  auditLogs,
  auditTotal,
  auditActions,
  settings,
  aiProjects,
  emailConfigured,
  defaultTestEmail,
}: {
  users: UserRow[];
  auditLogs: AuditLog[];
  auditTotal: number;
  auditActions: string[];
  settings: SystemSettings;
  aiProjects: AiProjectOption[];
  emailConfigured: boolean;
  defaultTestEmail: string;
}) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const defaultTab =
    tabParam === "ai-history"
      ? "ai-history"
      : tabParam === "audit"
        ? "audit"
        : tabParam === "settings"
          ? "settings"
          : "users";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Manage users, system settings, AI history, and review audit activity.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="ai-history">AI History</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UserManagement users={users} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SystemSettingsPanel
            settings={settings}
            emailConfigured={emailConfigured}
            defaultTestEmail={defaultTestEmail}
          />
        </TabsContent>
        <TabsContent value="ai-history" className="mt-4">
          <AiHistoryPanel
            users={users.map((user) => ({
              id: user.id,
              email: user.email,
              name: user.name,
            }))}
            projects={aiProjects}
          />
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
