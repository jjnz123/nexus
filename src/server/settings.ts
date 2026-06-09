import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";

const DEFAULT_MODEL = process.env.XAI_MODEL ?? "grok-3";

export async function getSystemSettings() {
  const [existing] = await db.select().from(systemSettings).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(systemSettings)
    .values({
      aiModel: DEFAULT_MODEL,
      portalSubtitle: "Internal Operations Portal",
      portalSubtitleEnabled: true,
    })
    .returning();

  return created;
}

export async function getAiModel() {
  const settings = await getSystemSettings();
  return settings.aiModel || DEFAULT_MODEL;
}
