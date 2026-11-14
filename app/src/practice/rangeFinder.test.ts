import { describe, expect, it } from "vitest";
import { midiToHz } from "../dsp/music";
import type { F0Track } from "../pitch/track";
import { buildProfile, highestHeld, lowestHeld, speakingPitch } from "./rangeFinder";

const HOP = 512 / 48000;

/** A track that follows `segments`: [seconds, MIDI note] pairs, with null for silence. */
function track(segments: [number, number | null][]): F0Track {
  const hz: number[] = [];
  for (const [seconds, midi] of segments) {
    for (let i = 0; i < Math.round(seconds / HOP); i++) hz.push(midi === null ? 0 : midiToHz(midi));
  }
  return { hopS: HOP, t0: 0, hz: Float32Array.from(hz), clarity: new Float32Array(hz.length).fill(1) };
}

describe("speakingPitch", () => {
  it("is the typical pitch of the voiced parts", () => {
    const spoken = track([
      [0.4, 46],
      [0.3, null],
      [0.6, 45],
      [0.2, 43],
    ]);
    expect(speakingPitch(spoken)).toBeCloseTo(45, 3);
  });

  it("is null when too little was voiced", () => {
    expect(speakingPitch(track([[0.3, 45]]))).toBeNull();
  });
});

describe("lowestHeld and highestHeld", () => {
  const glide = track([
    [1, 50],
    [1, 45],
    [0.4, 40],
    [0.1, 36],
    [1, null],
  ]);

  it("finds the lowest note held for a quarter of a second", () => {
    expect(lowestHeld(glide)).toBeCloseTo(40, 3);
  });

  it("ignores a brief dip below it", () => {
    expect(lowestHeld(glide)).not.toBeCloseTo(36, 3);
  });

  it("finds the highest note held", () => {
    expect(highestHeld(glide)).toBeCloseTo(50, 3);
  });

  it("is null without enough sound", () => {
    expect(lowestHeld(track([[0.1, 45]]))).toBeNull();
    expect(highestHeld(track([[1, null]]))).toBeNull();
  });
});

describe("buildProfile", () => {
  it("rounds to whole notes", () => {
    expect(buildProfile(45.3, 39.6, 57.4)).toEqual({
      ok: true,
      profile: { speakingMidi: 45, comfortLow: 40, comfortHigh: 57 },
    });
  });

  it("keeps the speaking pitch inside the range", () => {
    const result = buildProfile(38, 40, 57);
    expect(result.ok && result.profile.speakingMidi).toBe(40);
  });

  it("rejects a range under five semitones", () => {
    const result = buildProfile(45, 44, 47);
    expect(result.ok).toBe(false);
  });
});
