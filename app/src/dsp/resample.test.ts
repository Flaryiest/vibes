import { describe, expect, it } from "vitest";
import { toPcm16 } from "./resample";

describe("toPcm16", () => {
  it("scales samples to the 16-bit range", () => {
    expect([...toPcm16(Float32Array.from([0, 0.25, -0.25, 1, -1]), 16000, 16000)]).toEqual([0, 8192, -8192, 32767, -32767]);
  });

  it("clips what is too loud", () => {
    expect([...toPcm16(Float32Array.from([1.5, -1.5, 40, -40]), 16000, 16000)]).toEqual([32767, -32768, 32767, -32768]);
  });

  it("averages each group of samples when the ratio is a whole number", () => {
    const samples = Float32Array.from([0.1, 0.2, 0.3, -0.3, -0.3, -0.3, 0.5, 0.5]);
    const out = toPcm16(samples, 48000, 16000);
    expect(out).toBeInstanceOf(Int16Array);
    // The two left-over samples do not make a whole group and are dropped.
    expect([...out]).toEqual([Math.round(0.2 * 32767), Math.round(-0.3 * 32767)]);
  });

  it("interpolates between samples when the ratio is not a whole number", () => {
    // A straight ramp stays a straight ramp at any rate.
    const ramp = Float32Array.from({ length: 441 }, (_, i) => i / 441);
    const out = toPcm16(ramp, 44100, 16000);
    expect(out).toHaveLength(160);
    for (let i = 0; i < out.length; i++) {
      expect(Math.abs(out[i] - ((i * 44100) / 16000 / 441) * 32767)).toBeLessThan(1);
    }
  });

  it("keeps the length of the sound", () => {
    expect(toPcm16(new Float32Array(48000), 48000, 16000)).toHaveLength(16000);
    expect(toPcm16(new Float32Array(44100), 44100, 16000)).toHaveLength(16000);
    expect(toPcm16(new Float32Array(8000), 8000, 16000)).toHaveLength(16000);
  });

  it("keeps a tone at its pitch and level", () => {
    for (const from of [48000, 44100]) {
      // One second of 110 Hz.
      const tone = Float32Array.from({ length: from }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 110 * i) / from));
      const out = toPcm16(tone, from, 16000);
      // One upward zero crossing per cycle.
      let cycles = 0;
      let peak = 0;
      for (let i = 1; i < out.length; i++) {
        if (out[i - 1] < 0 && out[i] >= 0) cycles++;
        peak = Math.max(peak, Math.abs(out[i]));
      }
      expect(Math.abs(cycles - 110)).toBeLessThanOrEqual(1);
      expect(peak / 32767).toBeGreaterThan(0.49);
      expect(peak / 32767).toBeLessThan(0.51);
    }
  });

  it("returns nothing for nothing", () => {
    expect(toPcm16(new Float32Array(0), 48000, 16000)).toHaveLength(0);
  });
});
