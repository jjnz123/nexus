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

  const { devices, selectedDeviceId, setSelectedDeviceId, permissionGranted, requestPermission } =
    recording;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Audio input</Label>
      {devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {permissionGranted
            ? "No microphones detected"
            : "Allow microphone access to choose an input device"}
        </p>
      ) : (
        <Select value={selectedDeviceId || devices[0]?.deviceId} onValueChange={setSelectedDeviceId}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Select microphone" />
          </SelectTrigger>
          <SelectContent>
            {devices.map((device) => (
              <SelectItem key={device.deviceId} value={device.deviceId}>
                {device.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!permissionGranted ? (
        <button
          type="button"
          className="text-xs text-primary underline-offset-4 hover:underline"
          onClick={() => void requestPermission()}
        >
          Grant microphone access
        </button>
      ) : null}
    </div>
  );
}
