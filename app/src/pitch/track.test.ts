import { describe, expect, it } from "vitest";
import { centsBetween } from "../dsp/music";
import { harmonicTone } from "../dsp/synth";
import { trackPitch, trackPitchInSlices } from "./track";

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

describe("trackPitchInSlices", () => {
  // Two notes with a gap, so the slices have something to get wrong at their edges.
  const pcm = new Float32Array(48000 * 3);
  pcm.set(harmonicTone({ hz: 110, seconds: 1.2, sampleRate: 48000 }), 4800);
  pcm.set(harmonicTone({ hz: 146.83, seconds: 1, sampleRate: 48000, noise: 0.01 }), 81000);

  it("gives exactly what trackPitch gives, however it is cut up", async () => {
    const whole = trackPitch(pcm, 48000, BAND, { rmsMin: 0.005 });
    expect(whole.hz.some((hz) => hz > 0)).toBe(true);
    for (const sliceS of [0.05, 0.37, 1, 60]) {
      const sliced = await trackPitchInSlices(pcm, 48000, BAND, { rmsMin: 0.005, sliceS });
      expect(sliced).toEqual(whole);
    }
  });

  it("returns an empty track for a recording shorter than one window", async () => {
    const track = await trackPitchInSlices(new Float32Array(1000), 48000, BAND);
    expect(track).toEqual(trackPitch(new Float32Array(1000), 48000, BAND));
  });

  it("gives up with null when it is told to stop", async () => {
    const stop = new AbortController();
    const pending = trackPitchInSlices(pcm, 48000, BAND, { sliceS: 0.1, signal: stop.signal });
    stop.abort();
    expect(await pending).toBeNull();
  });
});
