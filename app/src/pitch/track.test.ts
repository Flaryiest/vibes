import { describe, expect, it } from "vitest";
import { centsBetween } from "../dsp/music";
import { harmonicTone } from "../dsp/synth";
import { trackPitch } from "./track";

const BAND = { minHz: 55, maxHz: 700 };

describe("trackPitch", () => {
  it("tracks a held note frame by frame", () => {
    const track = trackPitch(harmonicTone({ hz: 98, seconds: 1, sampleRate: 48000 }), 48000, BAND);
    expect(track.hz.length).toBe(Math.floor((48000 - 4096) / 512) + 1);
    for (const hz of track.hz) expect(Math.abs(centsBetween(hz, 98))).toBeLessThan(10);
  });

  it("places frame times at window centers", () => {
    const track = trackPitch(new Float32Array(48000), 48000, BAND);
    expect(track.t0).toBeCloseTo(2048 / 48000, 9);
    expect(track.hopS).toBeCloseTo(512 / 48000, 9);
  });

  it("marks silence and quiet sound as unvoiced", () => {
    const silent = trackPitch(new Float32Array(48000), 48000, BAND);
    expect(Array.from(silent.hz).every((hz) => hz === 0)).toBe(true);
    const quiet = harmonicTone({ hz: 98, seconds: 1, sampleRate: 48000, level: 0.001 });
    const gated = trackPitch(quiet, 48000, BAND, { rmsMin: 0.01 });
    expect(Array.from(gated.hz).every((hz) => hz === 0)).toBe(true);
  });

  it("returns an empty track for a recording shorter than one window", () => {
    expect(trackPitch(new Float32Array(1000), 48000, BAND).hz.length).toBe(0);
  });
});
