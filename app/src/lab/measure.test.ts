import { describe, expect, it } from "vitest";
import { noiseGate, voicedPct } from "./measure";

describe("noiseGate", () => {
  it("sits 10 dB above the median room level", () => {
    expect(noiseGate([0.001, 0.001, 0.002, 0.0005, 0.001])).toBeCloseTo(0.001 * 10 ** 0.5, 9);
  });

  it("is zero when nothing was measured", () => {
    expect(noiseGate([])).toBe(0);
  });
});

describe("voicedPct", () => {
  it("counts frames that have a pitch", () => {
    expect(voicedPct([{ hz: 110 }, { hz: null }, { hz: null }, { hz: 112 }])).toBe(50);
  });

  it("is zero for no frames", () => {
    expect(voicedPct([])).toBe(0);
  });
});
