import { describe, expect, it } from "vitest";
import type { NoteResult, Outcome } from "../scoring/notes";
import type { RangeProfile } from "./exercises";
import { checkExercises, fourWeeksBack, rollingMedian, summarizeCheck } from "./pitchCheck";

const RANGE: RangeProfile = { speakingMidi: 45, comfortLow: 40, comfortHigh: 57 };
const range = (comfortLow: number, comfortHigh: number): RangeProfile => ({ speakingMidi: comfortLow, comfortLow, comfortHigh });

const midisOf = (profile: RangeProfile) => checkExercises(profile).map((exercise) => exercise.notes.map((note) => note.midi));
const steps = (midis: number[]) => midis.slice(1).map((midi, i) => midi - midis[i]);

describe("checkExercises", () => {
  it("is ten single notes, then six four-note patterns: 34 notes", () => {
    const exercises = checkExercises(RANGE);
    expect(exercises.map((exercise) => exercise.notes.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4]);
    expect(exercises.flatMap((exercise) => exercise.notes).length).toBe(34);
  });

  it("is the same every time for the same range", () => {
    expect(checkExercises(RANGE)).toEqual(checkExercises({ ...RANGE }));
  });

  it("changes when the range changes", () => {
    expect(midisOf(RANGE)).not.toEqual(midisOf(range(43, 60)));
  });

  it("times the single notes like the level 1 drill", () => {
    for (const exercise of checkExercises(RANGE).slice(0, 10)) {
      expect(exercise.notes[0]).toMatchObject({ id: 0, t: 0.3, d: 1.6 });
      expect(exercise.lengthS).toBeCloseTo(0.3 + 1.6 + 0.2, 9);
    }
  });

  it("spreads the single notes evenly from the bottom of the range to the top", () => {
    const singles = midisOf(RANGE)
      .slice(0, 10)
      .map(([midi]) => midi)
      .sort((a, b) => a - b);
    expect(singles[0]).toBe(40);
    expect(singles[9]).toBe(57);
    for (const gap of steps(singles)) {
      expect(gap).toBeGreaterThanOrEqual(1);
      expect(gap).toBeLessThanOrEqual(2);
    }
  });

  it("does not ask for the single notes as a rising scale", () => {
    const singles = midisOf(RANGE)
      .slice(0, 10)
      .map(([midi]) => midi);
    expect(singles).not.toEqual([...singles].sort((a, b) => a - b));
  });

  it("joins the pattern notes, 0.8 seconds each", () => {
    for (const exercise of checkExercises(RANGE).slice(10)) {
      exercise.notes.forEach((note, i) => {
        expect(note.id).toBe(i);
        expect(note.d).toBe(0.8);
        expect(note.t).toBeCloseTo(0.3 + i * 0.8, 9);
      });
      expect(exercise.lengthS).toBeCloseTo(0.3 + 4 * 0.8 + 0.2, 9);
    }
  });

  it("builds the patterns from whole and half steps, three rising and three falling", () => {
    const patterns = midisOf(RANGE).slice(10).map(steps);
    for (const pattern of patterns) {
      for (const step of pattern) expect([1, 2]).toContain(Math.abs(step));
    }
    expect(patterns.filter((pattern) => pattern.every((step) => step > 0)).length).toBe(3);
    expect(patterns.filter((pattern) => pattern.every((step) => step < 0)).length).toBe(3);
  });

  it("uses more than one shape of pattern, low and high in the range", () => {
    const patterns = midisOf(RANGE).slice(10);
    expect(new Set(patterns.map((midis) => steps(midis).join(","))).size).toBeGreaterThanOrEqual(4);
    expect(Math.min(...patterns.flat())).toBe(40);
    expect(Math.max(...patterns.flat())).toBe(57);
  });

  it("keeps every note inside the range, whatever its width", () => {
    for (let width = 0; width <= 24; width++) {
      const profile = range(41, 41 + width);
      const exercises = checkExercises(profile);
      expect(exercises.flatMap((exercise) => exercise.notes).length).toBe(34);
      for (const midi of midisOf(profile).flat()) {
        expect(Number.isInteger(midi)).toBe(true);
        expect(midi).toBeGreaterThanOrEqual(41);
        expect(midi).toBeLessThanOrEqual(41 + width);
      }
    }
  });

  it("falls back to narrower stepwise patterns when the range is under a fourth", () => {
    for (const width of [3, 4]) {
      const patterns = midisOf(range(45, 45 + width)).slice(10).map(steps);
      for (const pattern of patterns) {
        for (const step of pattern) expect([1, 2]).toContain(Math.abs(step));
      }
      expect(patterns.some((pattern) => pattern.every((step) => step > 0))).toBe(true);
      expect(patterns.some((pattern) => pattern.every((step) => step < 0))).toBe(true);
    }
  });

  it("turns back inside a range too narrow for four different notes", () => {
    for (const pattern of midisOf(range(45, 47)).slice(10).map(steps)) {
      for (const step of pattern) expect([1, 2]).toContain(Math.abs(step));
    }
  });

  it("pins everything to one note when the range is a single note", () => {
    expect(new Set(midisOf(range(45, 45)).flat())).toEqual(new Set([45]));
  });
});

const note = (outcome: Outcome, cents: number | null): NoteResult => ({
  id: 0,
  outcome,
  cents,
  spreadCents: cents === null ? null : 5,
  voicedFraction: cents === null ? 0.1 : 1,
});
const repeat = (count: number, result: NoteResult) => Array.from({ length: count }, () => result);

describe("summarizeCheck", () => {
  it("reports the share of scored notes that were hit", () => {
    const summary = summarizeCheck([note("hit", 10), note("hit", -30), note("close", 80), note("miss", 300)]);
    expect(summary.pctInTune).toBe(50);
    expect(summary.scored).toBe(4);
    expect(summary.total).toBe(4);
  });

  it("averages the size of the error, flat or sharp", () => {
    expect(summarizeCheck([note("hit", 10), note("hit", -30), note("close", 80)]).meanAbsCents).toBeCloseTo(40, 9);
  });

  it("caps each note's error at 600 cents", () => {
    expect(summarizeCheck([note("octave", -1200), note("miss", 900), note("hit", 0)]).meanAbsCents).toBeCloseTo(400, 9);
  });

  it("leaves unscored notes out of both numbers", () => {
    const summary = summarizeCheck([...repeat(9, note("hit", 20)), note("unscored", null)]);
    expect(summary.pctInTune).toBe(100);
    expect(summary.meanAbsCents).toBeCloseTo(20, 9);
    expect(summary.scored).toBe(9);
    expect(summary.total).toBe(10);
  });

  it("is reliable when at least 80% of the notes were scored", () => {
    expect(summarizeCheck([...repeat(28, note("hit", 0)), ...repeat(6, note("unscored", null))]).reliable).toBe(true);
    expect(summarizeCheck([...repeat(8, note("hit", 0)), ...repeat(2, note("unscored", null))]).reliable).toBe(true);
  });

  it("is not reliable when under 80% of the notes were scored", () => {
    expect(summarizeCheck([...repeat(27, note("hit", 0)), ...repeat(7, note("unscored", null))]).reliable).toBe(false);
  });

  it("reports zeros, not reliable, when nothing was heard", () => {
    const nothing = { pctInTune: 0, meanAbsCents: 0, scored: 0, reliable: false };
    expect(summarizeCheck(repeat(34, note("unscored", null)))).toEqual({ ...nothing, total: 34 });
    expect(summarizeCheck([])).toEqual({ ...nothing, total: 0 });
  });
});

describe("rollingMedian", () => {
  it("is the median of each value and the two before it", () => {
    expect(rollingMedian([50, 70, 60, 90, 20])).toEqual([50, 60, 60, 70, 60]);
  });

  it("takes any window", () => {
    expect(rollingMedian([1, 9, 2, 8], 1)).toEqual([1, 9, 2, 8]);
    expect(rollingMedian([1, 9, 2, 8], 2)).toEqual([1, 5, 5.5, 5]);
    expect(rollingMedian([4, 1, 3, 2, 5], 5)).toEqual([4, 2.5, 3, 2.5, 3]);
  });

  it("is empty for no values and leaves its input alone", () => {
    const values = [3, 1, 2];
    expect(rollingMedian([])).toEqual([]);
    rollingMedian(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("fourWeeksBack", () => {
  const on = (...days: string[]) => days.map((day) => ({ at: `2026-${day}T18:00:00.000Z` }));

  it("is the check four weeks before the latest", () => {
    const checks = on("10-03", "10-17", "10-31", "11-14");
    expect(fourWeeksBack(checks)).toBe(checks[1]);
  });

  it("takes the nearest when none is exactly four weeks back", () => {
    const checks = on("10-01", "10-20", "11-03", "11-14");
    expect(fourWeeksBack(checks)).toBe(checks[1]);
  });

  it("accepts a check from three to six weeks back", () => {
    expect(fourWeeksBack(on("10-24", "11-14"))).not.toBeNull();
    expect(fourWeeksBack(on("10-03", "11-14"))).not.toBeNull();
  });

  it("is null when the only earlier checks are too recent or too old", () => {
    expect(fourWeeksBack(on("10-31", "11-14"))).toBeNull();
    expect(fourWeeksBack(on("09-01", "11-14"))).toBeNull();
    expect(fourWeeksBack(on("11-14"))).toBeNull();
    expect(fourWeeksBack([])).toBeNull();
  });
});
