import { AdminPanel } from "@/components/admin/AdminPanel";
import { getAuditActions, getAuditLogs } from "@/server/actions/audit";
import { getUsers } from "@/server/actions/users";
import { Suspense } from "react";

export default async function AdminPage() {
  const [users, audit, actions] = await Promise.all([
    getUsers(),
    getAuditLogs({ limit: 100 }),
    getAuditActions(),
  ]);

  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading admin...</div>}>
      <AdminPanel
        users={users}
        auditLogs={audit.logs}
        auditTotal={audit.total}
        auditActions={actions}
      />
    </Suspense>
  );
}
