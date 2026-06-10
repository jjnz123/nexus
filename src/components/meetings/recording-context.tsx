"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  buildMediaRecorderOptions,
  getRecordingExtension,
  normalizeRecordingSettings,
  type RecordingSettings,
} from "@/lib/recording";
import { formatRecordingDuration } from "@/lib/recording/meters";
import { useAudioDevices } from "@/lib/recording/use-audio-devices";
import { useAudioLevels, type AudioLevelSnapshot } from "@/lib/recording/use-audio-levels";

export type ActiveRecording = {
  meetingId: string;
  title: string;
  projectName: string | null;
  projectKey: string | null;
  startedAt: number;
};

type StopHandler = (blob: Blob, mimeType: string) => Promise<void>;

type RecordingContextValue = {
  isRecording: boolean;
  activeRecording: ActiveRecording | null;
  durationMs: number;
  durationLabel: string;
  channelCount: number;
  levels: AudioLevelSnapshot;
  devices: ReturnType<typeof useAudioDevices>["devices"];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  permissionGranted: boolean;
  requestPermission: () => Promise<boolean>;
  recordingSettings: RecordingSettings;
  startRecording: (input: {
    meetingId: string;
    title: string;
    projectName?: string | null;
    projectKey?: string | null;
    onStop: StopHandler;
  }) => Promise<void>;
  stopRecording: () => void;
};

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function RecordingProvider({
  children,
  recordingSettings: initialSettings,
}: {
  children: ReactNode;
  recordingSettings?: Partial<RecordingSettings>;
}) {
  const recordingSettings = useMemo(
    () => normalizeRecordingSettings(initialSettings),
    [initialSettings]
  );
  const audioDevices = useAudioDevices();
  const [activeRecording, setActiveRecording] = useState<ActiveRecording | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [channelCount, setChannelCount] = useState(1);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopHandlerRef = useRef<StopHandler | null>(null);

  const levels = useAudioLevels(stream, Boolean(activeRecording));

  useEffect(() => {
    if (!activeRecording) {
      setDurationMs(0);
      return;
    }
    const tick = () => setDurationMs(Date.now() - activeRecording.startedAt);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeRecording]);

  const cleanupStream = useCallback(() => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  }, [stream]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const startRecording = useCallback(
    async (input: {
      meetingId: string;
      title: string;
      projectName?: string | null;
      projectKey?: string | null;
      onStop: StopHandler;
    }) => {
      if (mediaRecorderRef.current) {
        toast.error("A recording is already in progress");
        return;
      }

      const granted = audioDevices.permissionGranted || (await audioDevices.requestPermission());
      if (!granted) {
        toast.error("Microphone access denied");
        return;
      }

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: audioDevices.buildAudioConstraints(),
        });
        const track = mediaStream.getAudioTracks()[0];
        const settings = track?.getSettings();
        setChannelCount(settings?.channelCount ?? 1);
        setStream(mediaStream);

        const recorder = new MediaRecorder(mediaStream, buildMediaRecorderOptions(recordingSettings));
        chunksRef.current = [];
        stopHandlerRef.current = input.onStop;

        recorder.ondataavailable = (event) => {
          if (event.data.size) chunksRef.current.push(event.data);
        };

        recorder.onstop = () => {
          const mimeType = recorder.mimeType || recordingSettings.recordingAudioMimeType;
          const blob = new Blob(chunksRef.current, { type: mimeType });
          mediaStream.getTracks().forEach((t) => t.stop());
          setStream(null);
          setActiveRecording(null);
          mediaRecorderRef.current = null;
          chunksRef.current = [];
          const handler = stopHandlerRef.current;
          stopHandlerRef.current = null;
          if (handler) {
            void handler(blob, mimeType).catch((error) => {
              toast.error(error instanceof Error ? error.message : "Upload failed");
            });
          }
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setActiveRecording({
          meetingId: input.meetingId,
          title: input.title,
          projectName: input.projectName ?? null,
          projectKey: input.projectKey ?? null,
          startedAt: Date.now(),
        });
      } catch {
        cleanupStream();
        toast.error("Unable to start recording — check your audio input device");
      }
    },
    [audioDevices, cleanupStream, recordingSettings]
  );

  const value: RecordingContextValue = {
    isRecording: Boolean(activeRecording),
    activeRecording,
    durationMs,
    durationLabel: formatRecordingDuration(durationMs),
    channelCount,
    levels,
    devices: audioDevices.devices,
    selectedDeviceId: audioDevices.selectedDeviceId,
    setSelectedDeviceId: audioDevices.setSelectedDeviceId,
    permissionGranted: audioDevices.permissionGranted,
    requestPermission: audioDevices.requestPermission,
    recordingSettings,
    startRecording,
    stopRecording,
  };

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
}

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error("useRecording must be used within RecordingProvider");
  return ctx;
}

export function useRecordingOptional() {
  return useContext(RecordingContext);
}

export { getRecordingExtension };
