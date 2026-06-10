"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRecordingOptional } from "@/components/meetings/recording-context";

export function AudioInputSelect({ id = "audio-input" }: { id?: string }) {
  const recording = useRecordingOptional();

  if (!recording) return null;

  const { devices, selectedDeviceId, setSelectedDeviceId, isRecording } = recording;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Audio input</Label>
      <Select
        value={selectedDeviceId || "default"}
        onValueChange={(value) => setSelectedDeviceId(value === "default" ? "" : value)}
        disabled={isRecording}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="System default" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">System default (macOS input setting)</SelectItem>
          {devices.map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {device.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Microphone access is requested only when you click Start recording. Device names may appear
        as generic labels until after your first recording.
      </p>
    </div>
  );
}
