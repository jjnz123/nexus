"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nexus:recording-audio-device";

export type AudioInputDevice = {
  deviceId: string;
  label: string;
};

/** Never calls getUserMedia — enumeration only until recording starts. */
export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  });

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    const inputs = list
      .filter((d) => d.kind === "audioinput")
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Audio input ${index + 1}`,
      }));
    setDevices(inputs);
  }, []);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const handler = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [refreshDevices]);

  function setSelectedDeviceId(deviceId: string) {
    setSelectedDeviceIdState(deviceId);
    if (typeof window !== "undefined") {
      if (deviceId) {
        window.localStorage.setItem(STORAGE_KEY, deviceId);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }

  /** Respects macOS system default when no device is selected (e.g. Loopback Audio). */
  function buildAudioConstraints(): MediaTrackConstraints | boolean {
    if (selectedDeviceId) {
      return { deviceId: { ideal: selectedDeviceId } };
    }
    return { deviceId: "default" };
  }

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshDevices,
    buildAudioConstraints,
  };
}
