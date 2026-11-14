/** Harmonic amplitudes of a full voice, strongest at the fundamental. */
export const FULL_VOICE = [1, 0.8, 0.6, 0.45, 0.3, 0.2];

/** The same voice through a microphone that barely picks up the fundamental. */
export const WEAK_FUNDAMENTAL = [0.05, 1, 0.8, 0.6, 0.4, 0.3];

export type ToneOptions = {
  hz: number;
  seconds: number;
  sampleRate: number;
  harmonics?: number[];
  level?: number;
  noise?: number;
  seed?: number;
};

/** Uniform values in [-0.5, 0.5), repeatable for a given seed. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

export function harmonicTone(o: ToneOptions): Float32Array<ArrayBuffer> {
  const { hz, seconds, sampleRate, harmonics = FULL_VOICE, level = 0.5, noise = 0, seed = 1 } = o;
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  const next = random(seed);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 0; h < harmonics.length; h++) {
      v += harmonics[h] * Math.sin((2 * Math.PI * hz * (h + 1) * i) / sampleRate + h * 0.7);
    }
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < n; i++) out[i] = (level * out[i]) / peak + noise * 2 * next();
  return out;
}

export function whiteNoise(samples: number, level: number, seed = 1): Float32Array<ArrayBuffer> {
  const out = new Float32Array(samples);
  const next = random(seed);
  for (let i = 0; i < samples; i++) out[i] = level * 2 * next();
  return out;
}
