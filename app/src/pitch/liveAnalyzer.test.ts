import { describe, expect, it } from "vitest";
import { centsBetween } from "../dsp/music";
import { harmonicTone } from "../dsp/synth";
import { LiveAnalyzer, type AnalyzerConfig } from "./liveAnalyzer";
import type { PitchFrame } from "./smoother";

const CONFIG: AnalyzerConfig = {
  sampleRate: 48000,
  windowSize: 2048,
  band: { minHz: 55, maxHz: 700 },
  clarityMin: 0.5,
  rmsMin: 0,
};

/** Feed a signal in 512-sample chunks, starting at clock frame `frame0`. */
function feed(analyzer: LiveAnalyzer, signal: Float32Array, frame0 = 0): (PitchFrame | null)[] {
  const out: (PitchFrame | null)[] = [];
  for (let i = 0; i + 512 <= signal.length; i += 512) out.push(analyzer.push(signal.subarray(i, i + 512), frame0 + i));
  return out;
}

describe("LiveAnalyzer", () => {
  it("returns nothing until one window has arrived", () => {
    const out = feed(new LiveAnalyzer(CONFIG), harmonicTone({ hz: 110, seconds: 0.1, sampleRate: 48000 }));
    expect(out.slice(0, 3)).toEqual([null, null, null]);
    expect(out[3]).not.toBeNull();
  });

  it("reports the pitch of a low tone", () => {
    const out = feed(new LiveAnalyzer(CONFIG), harmonicTone({ hz: 82.41, seconds: 0.5, sampleRate: 48000 }));
    const frames = out.filter((f): f is PitchFrame => f !== null);
    expect(frames.length).toBeGreaterThan(30);
    for (const f of frames) expect(Math.abs(centsBetween(f.hz!, 82.41))).toBeLessThan(10);
  });

  it("stamps each frame at the center of its window", () => {
    const out = feed(new LiveAnalyzer(CONFIG), harmonicTone({ hz: 110, seconds: 0.1, sampleRate: 48000 }), 96000);
    // The fourth chunk ends at frame 96000 + 2048; the window center is 1024 frames earlier.
    expect(out[3]!.t).toBeCloseTo((96000 + 2048 - 1024) / 48000, 9);
  });

  it("reports silence as unvoiced", () => {
    const out = feed(new LiveAnalyzer(CONFIG), new Float32Array(4096));
    expect(out[4]!.hz).toBeNull();
  });

  it("applies the loudness gate", () => {
    const quiet = harmonicTone({ hz: 110, seconds: 0.1, sampleRate: 48000, level: 0.001 });
    const analyzer = new LiveAnalyzer({ ...CONFIG, rmsMin: 0.01 });
    expect(feed(analyzer, quiet)[3]!.hz).toBeNull();
    analyzer.setRmsMin(0);
    expect(feed(analyzer, quiet)[3]!.hz).not.toBeNull();
  });
});
