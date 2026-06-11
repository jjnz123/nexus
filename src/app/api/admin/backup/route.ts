import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/backup/admin-auth";
import { createNexusBackupArchive } from "@/lib/backup/nexus-backup";
import { logAudit } from "@/server/audit";

export const maxDuration = 300;

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backup = await createNexusBackupArchive();

    await logAudit({
      action: "backup.download",
      resource: "system_backup",
      summary: `Downloaded Nexus backup (${Math.round(backup.size / 1024 / 1024)}MB)`,
      details: {
        filename: backup.filename,
        size: backup.size,
        uploadsFileCount: backup.manifest.uploadsFileCount,
      },
    });

    return new NextResponse(new Uint8Array(backup.buffer), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
        "Content-Length": String(backup.size),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backup failed" },
      { status: 500 }
    );
  }
}
