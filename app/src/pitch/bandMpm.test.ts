import { describe, expect, it } from "vitest";
import { centsBetween } from "../dsp/music";
import { FULL_VOICE, WEAK_FUNDAMENTAL, harmonicTone, whiteNoise } from "../dsp/synth";
import { createBandMpm } from "./bandMpm";

const BAND = { minHz: 55, maxHz: 700 };
// C2, D2, E2, G2, A2, C3, G3, C4, E4, A4, E5
const NOTES = [65.41, 73.42, 82.41, 98, 110, 130.81, 196, 261.63, 329.63, 440, 659.25];

describe("createBandMpm", () => {
  for (const sampleRate of [48000, 44100]) {
    for (const windowSize of [2048, 4096]) {
      it(`tracks low and high notes within 10 cents at ${sampleRate} Hz, window ${windowSize}`, () => {
        const detect = createBandMpm(windowSize, sampleRate, BAND);
        for (const harmonics of [FULL_VOICE, WEAK_FUNDAMENTAL]) {
          for (const noise of [0, 0.02, 0.05]) {
            for (const hz of NOTES) {
              const x = harmonicTone({ hz, seconds: 0.6, sampleRate, harmonics, noise });
              for (let start = 0; start + windowSize <= x.length; start += 512) {
                const r = detect(x.subarray(start, start + windowSize));
                expect(r.hz, `${hz} Hz`).not.toBeNull();
                expect(Math.abs(centsBetween(r.hz!, hz)), `${hz} Hz`).toBeLessThan(10);
                expect(r.clarity, `${hz} Hz`).toBeGreaterThan(0.9);
              }
            }
          }
        }
      });
    }
  }

  it("gives white noise a low clarity", () => {
    const detect = createBandMpm(2048, 48000, BAND);
    const x = whiteNoise(2048 * 200, 0.05, 99);
    let highest = 0;
    for (let i = 0; i < 200; i++) highest = Math.max(highest, detect(x.subarray(i * 2048, (i + 1) * 2048)).clarity);
    expect(highest).toBeLessThan(0.3);
  });

  it("returns null for silence", () => {
    const detect = createBandMpm(2048, 48000, BAND);
    expect(detect(new Float32Array(2048))).toEqual({ hz: null, clarity: 0 });
  });

  it("returns null for a tone below the band", () => {
    const detect = createBandMpm(2048, 48000, BAND);
    const x = harmonicTone({ hz: 40, seconds: 0.1, sampleRate: 48000 });
    expect(detect(x.subarray(0, 2048)).hz).toBeNull();
  });
});
