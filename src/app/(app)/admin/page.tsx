import { auth } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { getAiProjectsForAdminFilter } from "@/server/actions/ai-chat";
import { getAuditActions, getAuditLogs } from "@/server/actions/audit";
import { fetchSystemSettings } from "@/server/actions/settings";
import { getUsers } from "@/server/actions/users";
import { getRagAdminOverview } from "@/server/actions/rag-admin";
import { Suspense } from "react";

export default async function AdminPage() {
  const session = await auth();
  const [users, audit, actions, settings, aiProjects, ragOverview] = await Promise.all([
    getUsers(),
    getAuditLogs({ limit: 100 }),
    getAuditActions(),
    fetchSystemSettings(),
    getAiProjectsForAdminFilter(),
    getRagAdminOverview(),
  ]);

  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading admin...</div>}>
      <AdminPanel
        users={users}
        auditLogs={audit.logs}
        auditTotal={audit.total}
        auditActions={actions}
        settings={settings}
        aiProjects={aiProjects}
        emailConfigured={isEmailConfigured()}
        defaultTestEmail={session?.user?.email ?? ""}
        ragOverview={ragOverview}
      />
    </Suspense>
  );
}
