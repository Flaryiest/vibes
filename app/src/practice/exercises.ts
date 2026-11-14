import type { TargetNote } from "../scoring/notes";

/** The learner's measured range, in whole MIDI note numbers. */
export type RangeProfile = { speakingMidi: number; comfortLow: number; comfortHigh: number };

export type Level = 1 | 2 | 3 | 4;

export const LEVEL_NAMES: Record<Level, string> = {
  1: "Single notes near your speaking voice",
  2: "Single notes across your range",
  3: "Two-note steps",
  4: "Three-note patterns",
};

/** Note times are seconds from the start of the exercise. */
export type Exercise = { level: Level; notes: TargetNote[]; lengthS: number };

const LEAD_S = 0.3;
const TAIL_S = 0.2;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** A whole number from `low` to `high` inclusive. */
const pick = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1));

function sequence(level: Level, midis: number[], each: number): Exercise {
  const notes = midis.map((midi, id) => ({ id, t: LEAD_S + id * each, d: each, midi }));
  return { level, notes, lengthS: LEAD_S + midis.length * each + TAIL_S };
}

/** Builds one exercise that lies entirely inside the learner's comfortable range. */
export function makeExercise(level: Level, range: RangeProfile, random: () => number = Math.random): Exercise {
  const low = range.comfortLow;
  const high = range.comfortHigh;
  if (level === 1) return sequence(1, [clamp(range.speakingMidi + pick(random, -3, 3), low, high)], 1.6);
  if (level === 2) return sequence(2, [pick(random, low, high)], 1.6);
  if (level === 3 || high - low < 4) {
    const first = pick(random, low, high);
    const step = pick(random, 1, 4) * (random() < 0.5 ? -1 : 1);
    const inRange = first + step >= low && first + step <= high;
    return sequence(3, [first, inRange ? first + step : clamp(first - step, low, high)], 1.0);
  }
  const start = pick(random, low, high - 4);
  const rising = random() < 0.5;
  return sequence(4, rising ? [start, start + 2, start + 4] : [start + 4, start + 2, start], 0.8);
}
