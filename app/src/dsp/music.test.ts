import { describe, expect, it } from "vitest";
import { centsBetween, describePitch, hzToMidi, midiToHz, midiToName } from "./music";

describe("music", () => {
  it("converts between Hz and MIDI", () => {
    expect(hzToMidi(440)).toBeCloseTo(69, 6);
    expect(hzToMidi(65.406)).toBeCloseTo(36, 2);
    expect(midiToHz(60)).toBeCloseTo(261.626, 2);
  });

  it("measures cents", () => {
    expect(centsBetween(440 * 2 ** (50 / 1200), 440)).toBeCloseTo(50, 6);
    expect(centsBetween(220, 440)).toBeCloseTo(-1200, 6);
  });

  it("names notes", () => {
    expect(midiToName(36)).toBe("C2");
    expect(midiToName(45)).toBe("A2");
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(61)).toBe("C♯4");
  });

  it("describes a pitch as the nearest note plus cents", () => {
    expect(describePitch(110)).toEqual({ name: "A2", cents: 0 });
    expect(describePitch(446)).toEqual({ name: "A4", cents: 23 });
  });
});
