import { median } from "../dsp/stats";
import type { NoteResult } from "../scoring/notes";
import type { Exercise, Level, RangeProfile } from "./exercises";

/** The first checks mostly measure getting used to the check, so they are labeled as calibration. */
export const CALIBRATION_RUNS = 2;

const SINGLES = 10;
const PATTERNS = 6;
const SINGLE_S = 1.6;
const PATTERN_NOTE_S = 0.8;
/** The same lead-in and tail as the drills in `exercises.ts`. */
const LEAD_S = 0.3;
const TAIL_S = 0.2;
/** Fixed, so the check asks for the same notes every time it is run. */
const SEED = 20261113;
/** A wrong octave or a wild miss counts as this much and no more, so one note cannot swamp the average. */
const MAX_ERROR_CENTS = 600;
/** Under this share of notes heard, the percent says more about the microphone than the singing. */
const MIN_SCORED = 0.8;
const DAY_MS = 24 * 3600 * 1000;

/**
 * Rising four-note patterns, as semitones above their lowest note, by the
 * distance they span. The first choice is a fourth, climbed by whole and half
 * steps; narrower ranges get narrower patterns, and under three semitones the
 * pattern turns back on itself. Falling patterns are these upside down.
 */
const SHAPES: number[][][] = [
  [[0, 0, 0, 0]],
  [[0, 1, 0, 1]],
  [[0, 1, 2, 1]],
  [[0, 1, 2, 3]],
  [
    [0, 2, 3, 4],
    [0, 1, 3, 4],
    [0, 1, 2, 4],
  ],
  [
    [0, 2, 4, 5],
    [0, 2, 3, 5],
    [0, 1, 3, 5],
  ],
];

/** Repeatable values in [0, 1). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** `count` whole numbers from `low` to `high`, evenly spaced, ends included. */
const spread = (count: number, low: number, high: number): number[] =>
  Array.from({ length: count }, (_, i) => low + Math.round((i * (high - low)) / (count - 1)));

function sequence(level: Level, midis: number[], each: number): Exercise {
  const notes = midis.map((midi, id) => ({ id, t: LEAD_S + id * each, d: each, midi }));
  return { level, notes, lengthS: LEAD_S + midis.length * each + TAIL_S };
}

/**
 * The pitch check: ten single notes spread across the comfortable range, then
 * six four-note patterns, 34 notes in all. The same range always gives the
 * same exercises in the same order, so one check can be compared with the next.
 */
export function checkExercises(profile: RangeProfile): Exercise[] {
  const low = profile.comfortLow;
  const width = Math.max(0, profile.comfortHigh - low);
  const random = seeded(SEED);

  // Out of order, so the single notes are not sung as a scale.
  const singles = shuffled(spread(SINGLES, low, low + width), random).map((midi) => sequence(2, [midi], SINGLE_S));

  const span = Math.min(width, SHAPES.length - 1);
  const shapes = SHAPES[span];
  const bottoms = shuffled(spread(PATTERNS, low, low + width - span), random);
  const patterns = shuffled(
    bottoms.map((bottom, i) => {
      const rising = shapes[Math.floor(i / 2) % shapes.length];
      const offsets = i % 2 === 0 ? rising : rising.map((offset) => span - offset);
      return sequence(4, offsets.map((offset) => bottom + offset), PATTERN_NOTE_S);
    }),
    random,
  );
  return [...singles, ...patterns];
}

export type CheckSummary = {
  /** Percent of the scored notes within ±50 cents. */
  pctInTune: number;
  /** Average size of the error over the scored notes, in cents. */
  meanAbsCents: number;
  scored: number;
  total: number;
  /** False when too few notes were heard for the numbers to mean anything. */
  reliable: boolean;
};

export function summarizeCheck(results: NoteResult[]): CheckSummary {
  const errors = results.flatMap((result) =>
    result.outcome === "unscored" || result.cents === null ? [] : [Math.min(MAX_ERROR_CENTS, Math.abs(result.cents))],
  );
  const total = results.length;
  const scored = errors.length;
  if (scored === 0) return { pctInTune: 0, meanAbsCents: 0, scored, total, reliable: false };
  const hits = results.filter((result) => result.outcome === "hit").length;
  return {
    pctInTune: (100 * hits) / scored,
    meanAbsCents: errors.reduce((sum, cents) => sum + cents, 0) / scored,
    scored,
    total,
    reliable: scored / total >= MIN_SCORED,
  };
}

/** For each value, the median of it and up to `window - 1` values before it. */
export function rollingMedian(values: number[], window = 3): number[] {
  return values.map((_, i) => median(values.slice(Math.max(0, i - window + 1), i + 1)));
}

/**
 * The check to measure the latest one against: the one nearest to four weeks
 * before it, as long as that is between three and six weeks back. Null when
 * there is none. `checks` are oldest first.
 */
export function fourWeeksBack<T extends { at: string }>(checks: T[]): T | null {
  const latest = checks.at(-1);
  if (!latest) return null;
  const daysBefore = (check: T) => Math.round((Date.parse(latest.at) - Date.parse(check.at)) / DAY_MS);
  let best: T | null = null;
  for (const check of checks.slice(0, -1)) {
    const days = daysBefore(check);
    if (days < 21 || days > 42) continue;
    if (!best || Math.abs(days - 28) < Math.abs(daysBefore(best) - 28)) best = check;
  }
  return best;
}
