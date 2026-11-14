import { median } from "../dsp/stats";
import { findDelay, makeChirp } from "./chirp";
import type { AudioEngine } from "./engine";

export type ChirpResult = { delayMs: number; score: number };

export type CalibrationResult = {
  roundTripMs: number | null;
  spreadMs: number | null;
  accepted: boolean;
  chirps: ChirpResult[];
};

/** A chirp counts as heard at this correlation or better. */
export const MIN_SCORE = 0.3;
export const MAX_SPREAD_MS = 5;
const MAX_DELAY_S = 0.6;

/** Chirp start times in seconds: irregular, and further apart than the longest delay searched. */
export const CHIRP_OFFSETS_S = [0, 0.71, 1.53, 2.27, 3.09, 3.83, 4.71, 5.47];

/**
 * The round trip is the median delay of the chirps that were heard. The spread
 * is the range of those delays after dropping the lowest and the highest.
 */
export function summarize(chirps: ChirpResult[]): CalibrationResult {
  const delays = chirps
    .filter((chirp) => chirp.score >= MIN_SCORE)
    .map((chirp) => chirp.delayMs)
    .sort((a, b) => a - b);
  if (delays.length < 6) return { roundTripMs: null, spreadMs: null, accepted: false, chirps };
  const core = delays.slice(1, -1);
  const spreadMs = core[core.length - 1] - core[0];
  return { roundTripMs: median(delays), spreadMs, accepted: spreadMs < MAX_SPREAD_MS, chirps };
}

/**
 * Plays chirps and times their arrival at the microphone. The result is the
 * output delay plus the input delay: the amount to subtract from capture times
 * when comparing singing with playback.
 */
export async function runCalibration(engine: AudioEngine, volume = 0.5): Promise<CalibrationResult> {
  const ctx = engine.ctx;
  const sampleRate = ctx.sampleRate;
  const chirp = makeChirp(sampleRate);
  const buffer = ctx.createBuffer(1, chirp.length, sampleRate);
  buffer.copyToChannel(chirp, 0);
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(ctx.destination);

  const capture = engine.beginCapture();
  const firstChirp = ctx.currentTime + 0.3;
  const times = CHIRP_OFFSETS_S.map((offset) => firstChirp + offset);
  for (const time of times) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(time);
  }
  const lastChirp = times[times.length - 1];
  const waitMs = (lastChirp - ctx.currentTime + MAX_DELAY_S + 0.3) * 1000;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const { pcm, startFrame } = capture.end();
  gain.disconnect();

  const maxDelay = Math.round(MAX_DELAY_S * sampleRate);
  const chirps = times.map((time) => {
    const expected = Math.round(time * sampleRate) - startFrame;
    const from = Math.max(0, expected);
    const to = Math.min(pcm.length - chirp.length, expected + maxDelay);
    const { index, score } = findDelay(pcm, chirp, from, to);
    return { delayMs: ((index - expected) / sampleRate) * 1000, score };
  });
  return summarize(chirps);
}
