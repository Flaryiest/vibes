import { createBandMpm, type Band } from "./bandMpm";

/**
 * Pitch over time for a recording. `hz[i]` is 0 where no pitch was found.
 * Frame `i` is centered `t0 + i * hopS` seconds after the start of the recording.
 */
export type F0Track = { hopS: number; t0: number; hz: Float32Array; clarity: Float32Array };

export type TrackOptions = { windowSize?: number; hop?: number; clarityMin?: number; rmsMin?: number };

/** An empty track for a recording, and `fill`, which works out its frames from `from` up to `to`. */
function prepare(pcm: Float32Array, sampleRate: number, band: Band, options: TrackOptions) {
  const { windowSize = 4096, hop = 512, clarityMin = 0.5, rmsMin = 0 } = options;
  const detect = createBandMpm(windowSize, sampleRate, band);
  const count = pcm.length >= windowSize ? Math.floor((pcm.length - windowSize) / hop) + 1 : 0;
  const hz = new Float32Array(count);
  const clarity = new Float32Array(count);
  const fill = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      const window = pcm.subarray(i * hop, i * hop + windowSize);
      let sum = 0;
      for (let j = 0; j < windowSize; j++) sum += window[j] * window[j];
      const estimate = detect(window);
      clarity[i] = estimate.clarity;
      const loudEnough = Math.sqrt(sum / windowSize) >= rmsMin;
      if (estimate.hz !== null && estimate.clarity >= clarityMin && loudEnough) hz[i] = estimate.hz;
    }
  };
  const track: F0Track = { hopS: hop / sampleRate, t0: windowSize / 2 / sampleRate, hz, clarity };
  return { track, count, fill };
}

/** Tracks the pitch of a finished recording. Steadier than the live line because it uses a longer window. */
export function trackPitch(pcm: Float32Array, sampleRate: number, band: Band, options: TrackOptions = {}): F0Track {
  const { track, count, fill } = prepare(pcm, sampleRate, band, options);
  fill(0, count);
  return track;
}

/**
 * The same track as `trackPitch`, worked out `sliceS` seconds of sound at a
 * time with a pause before each slice, so a recording of a whole song does not
 * freeze the page while it is tracked. Resolves with null if `signal` aborts.
 */
export async function trackPitchInSlices(
  pcm: Float32Array,
  sampleRate: number,
  band: Band,
  options: TrackOptions & { sliceS?: number; signal?: AbortSignal } = {},
): Promise<F0Track | null> {
  const { sliceS = 2, signal } = options;
  const { track, count, fill } = prepare(pcm, sampleRate, band, options);
  const step = Math.max(1, Math.round(sliceS / track.hopS));
  for (let from = 0; from < count; from += step) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) return null;
    fill(from, Math.min(count, from + step));
  }
  return signal?.aborted ? null : track;
}
