import { describe, expect, it } from "vitest";
import { centsBetween } from "../dsp/music";
import { LiveSmoother, type PitchFrame } from "./smoother";

const STEP = 512 / 48000;

/** Push a sequence of pitches, one per hop, and collect the smoothed pitches. */
function run(smoother: LiveSmoother, pitches: (number | null)[], startIndex = 0): (number | null)[] {
  return pitches.map((hz, i) => {
    const frame: PitchFrame = { t: (startIndex + i) * STEP, hz, clarity: 0.95, rms: 0.1 };
    return smoother.push(frame).hz;
  });
}

const near = (hz: number | null, target: number) => hz !== null && Math.abs(centsBetween(hz, target)) < 1;

describe("LiveSmoother", () => {
  it("passes a steady pitch through", () => {
    const out = run(new LiveSmoother(), Array(10).fill(110));
    expect(out.every((hz) => near(hz, 110))).toBe(true);
  });

  it("removes a single-frame spike", () => {
    const out = run(new LiveSmoother(), [110, 110, 110, 140, 110, 110]);
    expect(out.every((hz) => near(hz, 110))).toBe(true);
  });

  it("holds through an octave blip shorter than 60 ms", () => {
    const out = run(new LiveSmoother(), [110, 110, 110, 110, 220, 220, 220, 110, 110]);
    expect(out.every((hz) => near(hz, 110))).toBe(true);
  });

  it("accepts an octave jump that lasts", () => {
    const pitches = [...Array(5).fill(110), ...Array(20).fill(220)];
    const out = run(new LiveSmoother(), pitches);
    // 100 ms after the jump is 10 frames in.
    expect(near(out[5 + 10], 220)).toBe(true);
    expect(near(out[out.length - 1], 220)).toBe(true);
  });

  it("passes unvoiced frames through as null", () => {
    const out = run(new LiveSmoother(), [110, null, 110]);
    expect(out[1]).toBeNull();
  });

  it("starts fresh after a silence longer than 150 ms", () => {
    const smoother = new LiveSmoother();
    run(smoother, Array(6).fill(110));
    const gap = Array(20).fill(null);
    run(smoother, gap, 6);
    const out = run(smoother, [147], 26);
    expect(near(out[0], 147)).toBe(true);
  });
});
