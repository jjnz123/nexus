import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/backup/admin-auth";
import { MAX_EMAIL_BACKUP_BYTES, formatBackupSize } from "@/lib/backup/constants";
import { createNexusBackupArchive } from "@/lib/backup/nexus-backup";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { logAudit } from "@/server/audit";

export const maxDuration = 300;

const bodySchema = z.object({
  to: z.string().email(),
});

export async function POST(req: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "SMTP2go is not configured. Set SMTP2GO_API_KEY and SMTP2GO_SENDER_EMAIL." },
      { status: 503 }
    );
  }

  try {
    const { to } = bodySchema.parse(await req.json());
    const backup = await createNexusBackupArchive();

    if (backup.size > MAX_EMAIL_BACKUP_BYTES) {
      return NextResponse.json(
        {
          error: `Backup is ${formatBackupSize(backup.size)} — too large for email (max ${formatBackupSize(MAX_EMAIL_BACKUP_BYTES)}). Use Download backup instead.`,
          size: backup.size,
          maxEmailSize: MAX_EMAIL_BACKUP_BYTES,
        },
        { status: 413 }
      );
    }

    await sendEmail({
      to,
      subject: `Nexus backup — ${backup.filename}`,
      text: [
        "Nexus system backup attached.",
        "",
        `Created: ${backup.manifest.createdAt}`,
        `Size: ${formatBackupSize(backup.size)}`,
        `Upload files: ${backup.manifest.uploadsFileCount}`,
        "",
        `Sent by: ${session.user.name} (${session.user.email})`,
      ].join("\n"),
      attachments: [
        {
          filename: backup.filename,
          contentBase64: backup.buffer.toString("base64"),
          mimeType: "application/gzip",
        },
      ],
    });

    await logAudit({
      action: "backup.email",
      resource: "system_backup",
      summary: `Emailed Nexus backup to ${to} (${formatBackupSize(backup.size)})`,
      details: { to, filename: backup.filename, size: backup.size },
    });

    return NextResponse.json({
      ok: true,
      to,
      size: backup.size,
      filename: backup.filename,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email backup failed" },
      { status: 500 }
    );
  }
}
