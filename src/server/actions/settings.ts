"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";
import { requireSessionPermission } from "@/lib/permissions";
import { getSystemSettings } from "@/server/settings";
import { logAudit } from "@/server/audit";
import { isEmailConfigured, sendEmail } from "@/lib/email";

const updateSettingsSchema = z.object({
  aiModel: z.string().min(1).max(100),
  portalSubtitle: z.string().max(120).optional(),
  portalSubtitleEnabled: z.boolean(),
});

export async function fetchSystemSettings() {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");
  return getSystemSettings();
}

export async function updateSystemSettings(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");
  const data = updateSettingsSchema.parse(input);
  const current = await getSystemSettings();

  const [settings] = await db
    .update(systemSettings)
    .set({
      aiModel: data.aiModel,
      portalSubtitle: data.portalSubtitle ?? current.portalSubtitle,
      portalSubtitleEnabled: data.portalSubtitleEnabled,
      updatedAt: new Date(),
    })
    .where(eq(systemSettings.id, current.id))
    .returning();

  revalidatePath("/", "layout");
  revalidatePath("/admin");

  await logAudit({
    action: "settings.update",
    resource: "system_settings",
    resourceId: settings.id,
    summary: `Updated system settings (AI model: ${settings.aiModel})`,
    details: {
      aiModel: settings.aiModel,
      portalSubtitleEnabled: settings.portalSubtitleEnabled,
    },
  });

  return settings;
}

export async function sendTestEmail(input: unknown) {
  const session = await requireAuth();
  requireSessionPermission(session, "admin:access");

  const data = z
    .object({ to: z.string().email().optional() })
    .parse(input ?? {});

  const to = data.to ?? session.user.email;

  if (!isEmailConfigured()) {
    throw new Error(
      "SMTP2go is not configured. Set SMTP2GO_API_KEY and SMTP2GO_SENDER_EMAIL in the stack environment."
    );
  }

  const result = await sendEmail({
    to,
    subject: "Nexus test email",
    text: [
      "This is a test email from Nexus.",
      "",
      `Sent by: ${session.user.name} (${session.user.email})`,
      `Time: ${new Date().toISOString()}`,
      "",
      "If you received this message, SMTP2go is configured correctly.",
    ].join("\n"),
  });

  if (result.skipped) {
    throw new Error("Email send was skipped — check SMTP2go configuration.");
  }

  await logAudit({
    action: "email.test",
    resource: "email",
    summary: `Sent test email to ${to}`,
    details: { to },
  });

  return { ok: true, to };
}
