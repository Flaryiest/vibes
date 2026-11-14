import { describe, expect, it } from "vitest";
import { whiteNoise } from "../dsp/synth";
import { findDelay, makeChirp } from "./chirp";

describe("makeChirp", () => {
  it("makes a 30 ms chirp that starts and ends at zero", () => {
    const chirp = makeChirp(48000);
    expect(chirp.length).toBe(1440);
    expect(chirp[0]).toBe(0);
    expect(Math.abs(chirp[1439])).toBeLessThan(1e-6);
  });
});

describe("findDelay", () => {
  it("finds a quiet chirp in noise at the exact sample", () => {
    const chirp = makeChirp(48000);
    const captured = whiteNoise(48000, 0.01, 7);
    for (let j = 0; j < chirp.length; j++) captured[9123 + j] += 0.1 * chirp[j];
    const { index, score } = findDelay(captured, chirp, 0, 20000);
    expect(index).toBe(9123);
    expect(score).toBeGreaterThan(0.9);
  });

  it("scores low when there is no chirp", () => {
    const { score } = findDelay(whiteNoise(48000, 0.01, 3), makeChirp(48000), 0, 20000);
    expect(score).toBeLessThan(0.3);
  });

  it("scores below any threshold when the search range is empty", () => {
    const { score } = findDelay(new Float32Array(100), makeChirp(48000), 50, 10);
    expect(score).toBe(-Infinity);
  });
});
