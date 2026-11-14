import { describe, expect, it } from "vitest";
import { makeExercise, type RangeProfile } from "./exercises";

/** Repeatable values in [0, 1). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const RANGE: RangeProfile = { speakingMidi: 45, comfortLow: 40, comfortHigh: 57 };
const many = (level: 1 | 2 | 3 | 4, range = RANGE) => {
  const random = seeded(level);
  return Array.from({ length: 300 }, () => makeExercise(level, range, random));
};

describe("makeExercise", () => {
  it("level 1 is one long note within three semitones of the speaking pitch", () => {
    for (const exercise of many(1)) {
      expect(exercise.notes.length).toBe(1);
      expect(exercise.notes[0].d).toBe(1.6);
      expect(Math.abs(exercise.notes[0].midi - 45)).toBeLessThanOrEqual(3);
    }
  });

  it("level 1 stays inside the range when the speaking pitch is near its edge", () => {
    for (const exercise of many(1, { speakingMidi: 41, comfortLow: 40, comfortHigh: 57 })) {
      expect(exercise.notes[0].midi).toBeGreaterThanOrEqual(40);
    }
  });

  it("level 2 uses the whole comfortable range", () => {
    const midis = many(2).map((exercise) => exercise.notes[0].midi);
    expect(Math.min(...midis)).toBe(40);
    expect(Math.max(...midis)).toBe(57);
  });

  it("level 3 is two joined notes one to four semitones apart", () => {
    for (const exercise of many(3)) {
      const [first, second] = exercise.notes;
      expect(exercise.notes.length).toBe(2);
      const interval = Math.abs(second.midi - first.midi);
      expect(interval).toBeGreaterThanOrEqual(1);
      expect(interval).toBeLessThanOrEqual(4);
      expect(second.t).toBeCloseTo(first.t + first.d, 9);
      for (const n of exercise.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(40);
        expect(n.midi).toBeLessThanOrEqual(57);
      }
    }
  });

  it("level 4 is three notes moving by whole steps in one direction", () => {
    for (const exercise of many(4)) {
      const midis = exercise.notes.map((n) => n.midi);
      expect(midis.length).toBe(3);
      const step = midis[1] - midis[0];
      expect(Math.abs(step)).toBe(2);
      expect(midis[2] - midis[1]).toBe(step);
      expect(Math.min(...midis)).toBeGreaterThanOrEqual(40);
      expect(Math.max(...midis)).toBeLessThanOrEqual(57);
      expect(exercise.lengthS).toBeCloseTo(0.3 + 3 * 0.8 + 0.2, 9);
    }
  });

  it("falls back to two notes when the range is too narrow for a pattern", () => {
    const exercise = makeExercise(4, { speakingMidi: 45, comfortLow: 44, comfortHigh: 46 }, seeded(9));
    expect(exercise.notes.length).toBe(2);
  });

  it("numbers the notes in order", () => {
    expect(makeExercise(4, RANGE, seeded(2)).notes.map((n) => n.id)).toEqual([0, 1, 2]);
  });
});
