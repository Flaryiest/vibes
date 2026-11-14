import { createStretch } from "../playback/stretch";

const BURST_S = 0.02;

/** Repeatable values in [-1, 1). */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 2 ** 32) * 2 - 1;
  };
}

/** Silence with a short burst of noise every `everyS` seconds, the first at `everyS`. */
export function burstTrack(sampleRate: number, seconds: number, everyS: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const next = noise(11);
  const length = Math.round(BURST_S * sampleRate);
  for (let start = Math.round(everyS * sampleRate); start + length < out.length; start += Math.round(everyS * sampleRate)) {
    for (let i = 0; i < length; i++) out[start + i] = 0.6 * next() * Math.sin((Math.PI * i) / length);
  }
  return out;
}

/**
 * Where the energy near each expected time is centered. One value per expected
 * time, or NaN where nothing was heard within `searchS` of it.
 */
export function energyCenters(pcm: Float32Array, sampleRate: number, expectedS: number[], searchS = 0.2): number[] {
  return expectedS.map((expected) => {
    const first = Math.max(0, Math.round((expected - searchS) * sampleRate));
    const last = Math.min(pcm.length - 1, Math.round((expected + searchS) * sampleRate));
    let energy = 0;
    let weighted = 0;
    for (let i = first; i <= last; i++) {
      const e = pcm[i] * pcm[i];
      energy += e;
      weighted += e * i;
    }
    return energy < 1e-6 ? NaN : weighted / energy / sampleRate;
  });
}

export type StretchResult = {
  rate: number;
  semitones: number;
  /** Largest timing error of any burst, ms. */
  worstTimingMs: number;
  /** Largest difference between the two tracks, which should be none. */
  worstSyncDifference: number;
};

/**
 * Plays a burst track through two stretch nodes at once, off-line, and checks
 * (a) that each burst comes out when the clock arithmetic says it should and
 * (b) that the two nodes produce the same output, so two tracks stay in sync.
 */
export async function runStretchCheck(rate: number, semitones: number): Promise<StretchResult> {
  const sampleRate = 48000;
  const everyS = 0.5;
  const inputS = 5;
  const startAt = 0.5;
  const ctx = new OfflineAudioContext(2, Math.round((startAt + inputS / rate + 0.5) * sampleRate), sampleRate);
  const buffer = ctx.createBuffer(1, inputS * sampleRate, sampleRate);
  buffer.copyToChannel(burstTrack(sampleRate, inputS, everyS), 0);

  const merger = ctx.createChannelMerger(2);
  merger.connect(ctx.destination);
  for (const channel of [0, 1]) {
    const node = await createStretch(ctx, buffer);
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = "explicit";
    node.connect(mono).connect(merger, 0, channel);
    node.schedule({ output: startAt, active: true, input: 0, rate, semitones });
  }
  const rendered = await ctx.startRendering();
  const a = rendered.getChannelData(0);
  const b = rendered.getChannelData(1);

  // A burst at input time t should come out at startAt + t / rate.
  const expected: number[] = [];
  for (let t = everyS; t + BURST_S < inputS; t += everyS) expected.push(startAt + (t + BURST_S / 2) / rate);
  const centers = energyCenters(a, sampleRate, expected);
  const worstTimingMs = Math.max(...centers.map((center, i) => Math.abs(center - expected[i]) * 1000));
  let worstSyncDifference = 0;
  for (let i = 0; i < a.length; i++) worstSyncDifference = Math.max(worstSyncDifference, Math.abs(a[i] - b[i]));
  return { rate, semitones, worstTimingMs, worstSyncDifference };
}
