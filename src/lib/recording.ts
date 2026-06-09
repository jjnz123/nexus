export const DEFAULT_RECORDING_MIME_TYPE = "audio/webm;codecs=opus";
export const DEFAULT_RECORDING_BITRATE_KBPS = 96;
export const MIN_RECORDING_BITRATE_KBPS = 32;
export const MAX_RECORDING_BITRATE_KBPS = 320;

export const RECORDING_FORMAT_PRESETS = [
  {
    id: "webm-opus",
    label: "WebM — Opus (.webm)",
    mimeType: "audio/webm;codecs=opus",
    extension: "webm",
  },
  {
    id: "webm",
    label: "WebM — browser default (.webm)",
    mimeType: "audio/webm",
    extension: "webm",
  },
  {
    id: "ogg-opus",
    label: "Ogg — Opus (.ogg)",
    mimeType: "audio/ogg;codecs=opus",
    extension: "ogg",
  },
] as const;

export type RecordingSettings = {
  recordingAudioMimeType: string;
  recordingAudioBitrateKbps: number;
};

export function getRecordingExtension(mimeType: string): string {
  const preset = RECORDING_FORMAT_PRESETS.find((item) => item.mimeType === mimeType);
  if (preset) return preset.extension;
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  return "webm";
}

export function buildMediaRecorderOptions(
  settings: RecordingSettings
): MediaRecorderOptions {
  const options: MediaRecorderOptions = {
    audioBitsPerSecond: settings.recordingAudioBitrateKbps * 1000,
  };

  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported(settings.recordingAudioMimeType)
  ) {
    options.mimeType = settings.recordingAudioMimeType;
  }

  return options;
}

export function normalizeRecordingSettings(
  settings: Partial<RecordingSettings> | null | undefined
): RecordingSettings {
  const mimeType = settings?.recordingAudioMimeType?.trim() || DEFAULT_RECORDING_MIME_TYPE;
  const bitrate = settings?.recordingAudioBitrateKbps ?? DEFAULT_RECORDING_BITRATE_KBPS;

  return {
    recordingAudioMimeType: RECORDING_FORMAT_PRESETS.some((p) => p.mimeType === mimeType)
      ? mimeType
      : DEFAULT_RECORDING_MIME_TYPE,
    recordingAudioBitrateKbps: Math.min(
      MAX_RECORDING_BITRATE_KBPS,
      Math.max(MIN_RECORDING_BITRATE_KBPS, Math.round(bitrate))
    ),
  };
}
