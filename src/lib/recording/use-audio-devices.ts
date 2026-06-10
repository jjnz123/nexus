"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nexus:recording-audio-device";

export type AudioInputDevice = {
  deviceId: string;
  label: string;
};

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  });
  const [permissionGranted, setPermissionGranted] = useState(false);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    const inputs = list
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${d.deviceId.slice(0, 6) || "default"}`,
      }));
    setDevices(inputs);
    if (!selectedDeviceId && inputs[0]) {
      setSelectedDeviceIdState(inputs[0].deviceId);
    }
  }, [selectedDeviceId]);

  const requestPermission = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermissionGranted(true);
      await refreshDevices();
      return true;
    } catch {
      setPermissionGranted(false);
      return false;
    }
  }, [refreshDevices]);

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const handler = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [refreshDevices]);

  function setSelectedDeviceId(deviceId: string) {
    setSelectedDeviceIdState(deviceId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, deviceId);
    }
  }

  function buildAudioConstraints(): MediaTrackConstraints | boolean {
    if (selectedDeviceId) {
      return { deviceId: { exact: selectedDeviceId } };
    }
    return true;
  }

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    permissionGranted,
    requestPermission,
    buildAudioConstraints,
  };
}
