import { createBandMpm, type Band } from "./bandMpm";

/**
 * Pitch over time for a recording. `hz[i]` is 0 where no pitch was found.
 * Frame `i` is centered `t0 + i * hopS` seconds after the start of the recording.
 */
export type F0Track = { hopS: number; t0: number; hz: Float32Array; clarity: Float32Array };

export type TrackOptions = { windowSize?: number; hop?: number; clarityMin?: number; rmsMin?: number };

/** Tracks the pitch of a finished recording. Steadier than the live line because it uses a longer window. */
export function trackPitch(pcm: Float32Array, sampleRate: number, band: Band, options: TrackOptions = {}): F0Track {
  const { windowSize = 4096, hop = 512, clarityMin = 0.5, rmsMin = 0 } = options;
  const detect = createBandMpm(windowSize, sampleRate, band);
  const count = pcm.length >= windowSize ? Math.floor((pcm.length - windowSize) / hop) + 1 : 0;
  const hz = new Float32Array(count);
  const clarity = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const window = pcm.subarray(i * hop, i * hop + windowSize);
    let sum = 0;
    for (let j = 0; j < windowSize; j++) sum += window[j] * window[j];
    const estimate = detect(window);
    clarity[i] = estimate.clarity;
    const loudEnough = Math.sqrt(sum / windowSize) >= rmsMin;
    if (estimate.hz !== null && estimate.clarity >= clarityMin && loudEnough) hz[i] = estimate.hz;
  }
  return { hopS: hop / sampleRate, t0: windowSize / 2 / sampleRate, hz, clarity };
}
