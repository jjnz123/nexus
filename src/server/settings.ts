import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import {
  DEFAULT_RECORDING_BITRATE_KBPS,
  DEFAULT_RECORDING_MIME_TYPE,
  normalizeRecordingSettings,
  type RecordingSettings,
} from "@/lib/recording";

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
      showVersionInHeader: true,
      recordingAudioMimeType: DEFAULT_RECORDING_MIME_TYPE,
      recordingAudioBitrateKbps: DEFAULT_RECORDING_BITRATE_KBPS,
    })
    .returning();

  return created;
}

export async function getRecordingSettings(): Promise<RecordingSettings> {
  const settings = await getSystemSettings();
  return normalizeRecordingSettings({
    recordingAudioMimeType: settings.recordingAudioMimeType,
    recordingAudioBitrateKbps: settings.recordingAudioBitrateKbps,
  });
}

export async function getAiModel() {
  const settings = await getSystemSettings();
  return settings.aiModel || DEFAULT_MODEL;
}
