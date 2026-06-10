"use client";

import { useEffect, useRef, useState } from "react";
import { computeRmsDb, dbToMeterPercent } from "@/lib/recording/meters";

export type AudioLevelSnapshot = {
  channels: number;
  levelsDb: number[];
  levelsPercent: number[];
};

export function useAudioLevels(stream: MediaStream | null, active: boolean) {
  const [snapshot, setSnapshot] = useState<AudioLevelSnapshot>({
    channels: 1,
    levelsDb: [-60],
    levelsPercent: [0],
  });
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !stream) {
      setSnapshot({ channels: 1, levelsDb: [-60], levelsPercent: [0] });
      return;
    }

    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings();
    const channelCount = settings?.channelCount ?? 1;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const tick = () => {
      const db = computeRmsDb(analyser);
      const percent = dbToMeterPercent(db);
      const channels = Math.max(1, channelCount);
      setSnapshot({
        channels,
        levelsDb: Array.from({ length: channels }, () => db),
        levelsPercent: Array.from({ length: channels }, () => percent),
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      void ctx.close();
      audioContextRef.current = null;
    };
  }, [active, stream]);

  return snapshot;
}
