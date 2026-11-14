import { median } from "../dsp/stats";

/** The loudness gate: 10 dB above the room's median level. */
export function noiseGate(rmsValues: number[]): number {
  return rmsValues.length === 0 ? 0 : median(rmsValues) * 10 ** (10 / 20);
}

/** The share of frames in which a pitch was detected, 0 to 100. */
export function voicedPct(frames: { hz: number | null }[]): number {
  if (frames.length === 0) return 0;
  return (100 * frames.filter((frame) => frame.hz !== null).length) / frames.length;
}
