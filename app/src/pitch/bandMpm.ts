import { Autocorrelator } from "pitchy";

export type Band = { minHz: number; maxHz: number };
export type Estimate = { hz: number | null; clarity: number };

/**
 * McLeod pitch method, searching only the lags that correspond to `band`.
 *
 * Limiting the lag range matters: at lags near the window length almost no
 * samples overlap, so the normalized difference function can hit 1.0 by chance
 * and noise gets reported as a confident very low pitch.
 *
 * A tone above `band.maxHz` can be reported one octave down. Keep the band wide
 * enough to cover the singer.
 */
export function createBandMpm(
  windowSize: number,
  sampleRate: number,
  band: Band,
  k = 0.9,
): (input: Float32Array) => Estimate {
  const autocorrelator = Autocorrelator.forFloat32Array(windowSize);
  const nsdf = new Float32Array(windowSize);
  const minLag = Math.max(2, Math.floor(sampleRate / band.maxHz));
  const maxLag = Math.min(Math.ceil(sampleRate / band.minHz), Math.floor(windowSize / 2) - 1);

  return (input) => {
    autocorrelator.autocorrelate(input, nsdf);
    let m = 2 * nsdf[0];
    if (!(m > 0)) return { hz: null, clarity: 0 };

    // Normalized square difference function, for the lags that are needed.
    for (let i = 0; i <= maxLag + 1; i++) {
      const r = nsdf[i];
      nsdf[i] = m > 0 ? (2 * r) / m : 0;
      m -= input[i] ** 2 + input[windowSize - 1 - i] ** 2;
    }

    // Key maxima: the highest point between each upward and downward zero crossing.
    const keys: number[] = [];
    let highest = 0;
    let looking = false;
    let peak = -Infinity;
    let peakIndex = -1;
    for (let i = 1; i <= maxLag; i++) {
      if (nsdf[i - 1] <= 0 && nsdf[i] > 0) {
        looking = true;
        peak = nsdf[i];
        peakIndex = i;
      } else if (nsdf[i - 1] > 0 && nsdf[i] <= 0) {
        if (looking && peakIndex >= minLag) {
          keys.push(peakIndex);
          highest = Math.max(highest, peak);
        }
        looking = false;
      } else if (looking && nsdf[i] > peak) {
        peak = nsdf[i];
        peakIndex = i;
      }
    }
    if (looking && peakIndex >= minLag && peakIndex < maxLag) {
      keys.push(peakIndex);
      highest = Math.max(highest, peak);
    }
    if (keys.length === 0) return { hz: null, clarity: 0 };

    // The first key maximum close to the highest one is the fundamental period.
    const index = keys.find((i) => nsdf[i] >= k * highest)!;
    const y0 = nsdf[index - 1];
    const y1 = nsdf[index];
    const y2 = nsdf[index + 1];
    const curvature = y0 - 2 * y1 + y2;
    const shift = curvature === 0 ? 0 : (0.5 * (y0 - y2)) / curvature;
    const clarity = Math.min(1, Math.max(0, y1 - 0.25 * (y0 - y2) * shift));
    return { hz: sampleRate / (index + shift), clarity };
  };
}
