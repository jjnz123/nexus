"use client";

import { useEffect, useRef, useState } from "react";
import {
  computePeakDbfs,
  dbToMeterPercent,
  updatePeakHold,
} from "@/lib/recording/meters";

export type AudioLevelSnapshot = {
  channels: number;
  peakDbfs: number[];
  peakHoldDbfs: number[];
  levelsPercent: number[];
};

const INITIAL_DBFS = -60;

function emptySnapshot(channels = 1): AudioLevelSnapshot {
  return {
    channels,
    peakDbfs: Array.from({ length: channels }, () => INITIAL_DBFS),
    peakHoldDbfs: Array.from({ length: channels }, () => INITIAL_DBFS),
    levelsPercent: Array.from({ length: channels }, () => 0),
  };
}

export function useAudioLevels(stream: MediaStream | null, active: boolean) {
  const [snapshot, setSnapshot] = useState<AudioLevelSnapshot>(emptySnapshot());
  const peakHoldRef = useRef<number[]>([INITIAL_DBFS]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !stream) {
      peakHoldRef.current = [INITIAL_DBFS];
      setSnapshot(emptySnapshot());
      return;
    }

    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings();
    const channelCount = Math.max(1, settings?.channelCount ?? 1);
    peakHoldRef.current = Array.from({ length: channelCount }, () => INITIAL_DBFS);

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const splitter = ctx.createChannelSplitter(channelCount);
    source.connect(splitter);

    const analysers = Array.from({ length: channelCount }, () => {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      return analyser;
    });

    analysers.forEach((analyser, index) => {
      splitter.connect(analyser, index);
    });

    const buffers = analysers.map((analyser) => new Float32Array(analyser.fftSize));

    const tick = () => {
      const peakDbfs: number[] = [];
      const peakHoldDbfs: number[] = [];
      const levelsPercent: number[] = [];

      for (let index = 0; index < channelCount; index += 1) {
        const analyser = analysers[index]!;
        const buffer = buffers[index]!;
        analyser.getFloatTimeDomainData(buffer);
        const peak = computePeakDbfs(buffer);
        const held = updatePeakHold(peak, peakHoldRef.current[index] ?? INITIAL_DBFS);
        peakHoldRef.current[index] = held;
        peakDbfs.push(peak);
        peakHoldDbfs.push(held);
        levelsPercent.push(dbToMeterPercent(peak));
      }

      setSnapshot({
        channels: channelCount,
        peakDbfs,
        peakHoldDbfs,
        levelsPercent,
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      void ctx.close();
    };
  }, [active, stream]);

  return snapshot;
}

export function maxPeakDbfs(snapshot: AudioLevelSnapshot) {
  if (!snapshot.peakDbfs.length) return INITIAL_DBFS;
  return Math.max(...snapshot.peakDbfs);
}
