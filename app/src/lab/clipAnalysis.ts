import { centsBetween } from "../dsp/music";
import { median, percentile } from "../dsp/stats";
import { createBandMpm, type Band } from "../pitch/bandMpm";

export type DetectorStats = {
  windowSize: number;
  frames: number;
  voicedPct: number;
  medianHz: number | null;
  octaveErrorPct: number;
  spreadCents: number | null;
};

/** Runs the detector over a clip of one held note and reports how steadily it tracked. */
export function analyzeSustained(
  pcm: Float32Array,
  sampleRate: number,
  windowSize: number,
  band: Band,
  hop = 512,
): DetectorStats {
  const detect = createBandMpm(windowSize, sampleRate, band);
  const voiced: number[] = [];
  let frames = 0;
  for (let start = 0; start + windowSize <= pcm.length; start += hop) {
    frames++;
    const estimate = detect(pcm.subarray(start, start + windowSize));
    if (estimate.hz !== null && estimate.clarity >= 0.5) voiced.push(estimate.hz);
  }
  if (voiced.length === 0) {
    return { windowSize, frames, voicedPct: 0, medianHz: null, octaveErrorPct: 0, spreadCents: null };
  }
  const medianHz = median(voiced);
  const cents = voiced.map((hz) => centsBetween(hz, medianHz));
  const octaveErrors = cents.filter((c) => Math.abs(c) >= 1100 && Math.abs(c) <= 1300).length;
  const nearMedian = cents.filter((c) => Math.abs(c) < 600);
  return {
    windowSize,
    frames,
    voicedPct: (100 * voiced.length) / frames,
    medianHz,
    octaveErrorPct: (100 * octaveErrors) / voiced.length,
    spreadCents: percentile(nearMedian, 0.9) - percentile(nearMedian, 0.1),
  };
}

/** Power at one frequency, using a Hann window. */
function powerAt(samples: Float32Array, sampleRate: number, hz: number): number {
  const coefficient = 2 * Math.cos((2 * Math.PI * hz) / sampleRate);
  const n = samples.length;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    const s0 = samples[i] * window + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coefficient * s1 * s2;
}

function loudestSegment(pcm: Float32Array, size: number): Float32Array {
  let bestStart = 0;
  let bestEnergy = -1;
  for (let start = 0; start + size <= pcm.length; start += size / 4) {
    let energy = 0;
    for (let i = start; i < start + size; i++) energy += pcm[i] * pcm[i];
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestStart = start;
    }
  }
  return pcm.subarray(bestStart, bestStart + size);
}

/**
 * For each of the first `harmonics` harmonics of `f0`: its level in dB above
 * the level halfway to the neighboring harmonics. Shows whether the microphone
 * picks up the low part of a voice.
 */
export function harmonicSnrDb(pcm: Float32Array, sampleRate: number, f0: number, harmonics = 5, size = 8192): number[] {
  if (pcm.length < size) return [];
  const segment = loudestSegment(pcm, size);
  const result: number[] = [];
  for (let k = 1; k <= harmonics; k++) {
    const signal = powerAt(segment, sampleRate, k * f0);
    const below = powerAt(segment, sampleRate, (k - 0.5) * f0);
    const above = powerAt(segment, sampleRate, (k + 0.5) * f0);
    result.push(10 * Math.log10(signal / Math.max((below + above) / 2, 1e-20)));
  }
  return result;
}
