export const DBFS_FLOOR = -60;

export function formatRecordingDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function computePeakDbfs(timeDomain: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < timeDomain.length; i += 1) {
    const abs = Math.abs(timeDomain[i] ?? 0);
    if (abs > peak) peak = abs;
  }
  if (peak <= 0.00001) return DBFS_FLOOR;
  return Math.max(DBFS_FLOOR, Math.min(0, 20 * Math.log10(peak)));
}

/** @deprecated Use computePeakDbfs — kept for any legacy callers. */
export function computeRmsDb(analyser: AnalyserNode): number {
  const buffer = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buffer);
  return computePeakDbfs(buffer);
}

export function dbToMeterPercent(db: number) {
  return Math.max(0, Math.min(100, ((db - DBFS_FLOOR) / -DBFS_FLOOR) * 100));
}

export function updatePeakHold(currentDbfs: number, heldDbfs: number, decayPerFrame = 0.15) {
  if (currentDbfs >= heldDbfs) return currentDbfs;
  return Math.max(currentDbfs, heldDbfs - decayPerFrame);
}

export function meterBarColor(dbfs: number) {
  if (dbfs >= -6) return "bg-red-500";
  if (dbfs >= -18) return "bg-yellow-500";
  return "bg-green-500";
}

export function formatDbfs(dbfs: number) {
  return `${dbfs.toFixed(1)} dBFS`;
}

export function channelLabel(index: number, channels: number) {
  if (channels === 1) return "Mono";
  if (channels === 2) return index === 0 ? "L" : "R";
  return `Ch ${index + 1}`;
}
