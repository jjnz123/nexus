import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/backup/admin-auth";
import { RESTORE_PASSCODE } from "@/lib/backup/constants";
import { restoreNexusBackupArchive } from "@/lib/backup/nexus-backup";
import { logAudit } from "@/server/audit";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const passcode = formData.get("passcode");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Backup file is required" }, { status: 400 });
    }

    if (typeof passcode !== "string" || passcode.trim() !== RESTORE_PASSCODE) {
      return NextResponse.json({ error: "Invalid restore passcode" }, { status: 403 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const manifest = await restoreNexusBackupArchive(buffer);

    await logAudit({
      action: "backup.restore",
      resource: "system_backup",
      summary: "Restored Nexus from backup archive",
      details: {
        filename: file.name,
        size: file.size,
        backupCreatedAt: manifest.createdAt,
        backupNexusVersion: manifest.nexusVersion,
      },
    });

    return NextResponse.json({
      ok: true,
      restoredAt: new Date().toISOString(),
      manifest,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Restore failed" },
      { status: 500 }
    );
  }
}
