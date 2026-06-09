"use client";

import { useSearchParams } from "next/navigation";
import type { AuditLog } from "@/lib/db/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagement } from "./UserManagement";
import { AuditLogViewer } from "./AuditLogViewer";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: import("@/lib/db/schema").UserRole;
  disabled: boolean;
  avatarPath: string | null;
  createdAt: Date;
};

export function AdminPanel({
  users,
  auditLogs,
  auditTotal,
  auditActions,
}: {
  users: UserRow[];
  auditLogs: AuditLog[];
  auditTotal: number;
  auditActions: string[];
}) {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "audit" ? "audit" : "users";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Manage users, roles, and review detailed audit activity.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UserManagement users={users} />
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
