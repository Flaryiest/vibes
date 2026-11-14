import { describe, expect, it } from "vitest";
import { harmonicTone, whiteNoise } from "./synth";

describe("synth", () => {
  it("makes a tone of the requested length and level", () => {
    const x = harmonicTone({ hz: 110, seconds: 0.5, sampleRate: 48000, level: 0.5 });
    expect(x.length).toBe(24000);
    const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeCloseTo(0.5, 3);
  });

  it("is deterministic for a given seed", () => {
    const a = harmonicTone({ hz: 110, seconds: 0.1, sampleRate: 48000, noise: 0.02, seed: 7 });
    const b = harmonicTone({ hz: 110, seconds: 0.1, sampleRate: 48000, noise: 0.02, seed: 7 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("makes uniform noise at the requested level", () => {
    const x = whiteNoise(48000, 0.1);
    const rms = Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    expect(rms).toBeCloseTo(0.1 / Math.sqrt(3), 2);
  });
});
