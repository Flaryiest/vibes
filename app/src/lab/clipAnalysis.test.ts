import { describe, expect, it } from "vitest";
import { centsBetween } from "../dsp/music";
import { WEAK_FUNDAMENTAL, harmonicTone } from "../dsp/synth";
import { analyzeSustained, harmonicSnrDb } from "./clipAnalysis";

const BAND = { minHz: 55, maxHz: 700 };

describe("analyzeSustained", () => {
  it("summarizes a clean low note", () => {
    const clip = harmonicTone({ hz: 82.41, seconds: 2, sampleRate: 48000, harmonics: WEAK_FUNDAMENTAL, noise: 0.02 });
    const stats = analyzeSustained(clip, 48000, 2048, BAND);
    expect(stats.voicedPct).toBe(100);
    expect(Math.abs(centsBetween(stats.medianHz!, 82.41))).toBeLessThan(5);
    expect(stats.octaveErrorPct).toBe(0);
    expect(stats.spreadCents!).toBeLessThan(10);
  });

  it("counts frames an octave away from the median", () => {
    const low = harmonicTone({ hz: 82.41, seconds: 1.8, sampleRate: 48000 });
    const high = harmonicTone({ hz: 164.82, seconds: 0.2, sampleRate: 48000 });
    const clip = new Float32Array(low.length + high.length);
    clip.set(low);
    clip.set(high, low.length);
    const stats = analyzeSustained(clip, 48000, 2048, BAND);
    expect(Math.abs(centsBetween(stats.medianHz!, 82.41))).toBeLessThan(5);
    expect(stats.octaveErrorPct).toBeGreaterThan(5);
    expect(stats.octaveErrorPct).toBeLessThan(15);
  });

  it("reports silence as unvoiced", () => {
    const stats = analyzeSustained(new Float32Array(48000), 48000, 2048, BAND);
    expect(stats).toMatchObject({ voicedPct: 0, medianHz: null, octaveErrorPct: 0, spreadCents: null });
  });
});

describe("harmonicSnrDb", () => {
  it("measures each harmonic against the noise between harmonics", () => {
    const clip = harmonicTone({ hz: 82.41, seconds: 1, sampleRate: 48000, harmonics: WEAK_FUNDAMENTAL, noise: 0.005 });
    const snr = harmonicSnrDb(clip, 48000, 82.41);
    expect(snr.length).toBe(5);
    for (const db of snr) expect(db).toBeGreaterThan(20);
    // The second harmonic is far stronger than the attenuated fundamental.
    expect(snr[1]).toBeGreaterThan(snr[0]);
  });

  it("returns nothing for a clip shorter than the analysis size", () => {
    expect(harmonicSnrDb(new Float32Array(4000), 48000, 82.41)).toEqual([]);
  });
});
