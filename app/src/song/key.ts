import type { RangeProfile } from "../practice/exercises";
import type { Note } from "./types";

/** How a song is fitted to the learner: the backing is shifted by `trackShift` semitones and sung `octaveDrop` octaves below. */
export type KeySetting = { trackShift: number; octaveDrop: 0 | 1 };

export type KeyChoice = KeySetting & {
  lowMidi: number;
  highMidi: number;
  /** Share of singing time that falls inside the comfortable range, 0 to 100. */
  inComfortPct: number;
  cost: number;
};

/** The pitch the learner sings for a note written at `midi` in the original. */
export const targetMidi = (midi: number, key: KeySetting): number => midi + key.trackShift - 12 * key.octaveDrop;

const MAX_SHIFT = 6;
/** Beyond this the shifted backing track starts to sound processed. */
const CLEAN_SHIFT = 4;

/**
 * Ranks ways of fitting a song to the learner's range. Notes cost nothing
 * between two semitones above the comfortable bottom and three below the
 * comfortable top (the top is protected more, since straining upward is the
 * common beginner fault), more the further outside they fall, and a great deal
 * beyond two semitones outside the comfortable range.
 */
export function recommendKeys(notes: Note[], profile: RangeProfile, count = 3): KeyChoice[] {
  const sung = notes.filter((note) => note.kind === "normal" && note.d >= 0.15);
  if (sung.length === 0) return [];
  const total = sung.reduce((sum, note) => sum + note.d, 0);
  const easyLow = profile.comfortLow + 2;
  const easyHigh = profile.comfortHigh - 3;

  const choices: KeyChoice[] = [];
  for (const octaveDrop of [0, 1] as const) {
    for (let trackShift = -MAX_SHIFT; trackShift <= MAX_SHIFT; trackShift++) {
      let cost = 0;
      let inComfort = 0;
      let low = Infinity;
      let high = -Infinity;
      for (const note of sung) {
        const midi = targetMidi(note.midi, { trackShift, octaveDrop });
        low = Math.min(low, midi);
        high = Math.max(high, midi);
        if (midi >= profile.comfortLow && midi <= profile.comfortHigh) inComfort += note.d;
        const below = Math.max(0, easyLow - midi);
        const above = Math.max(0, midi - easyHigh);
        const outside = Math.max(0, profile.comfortLow - midi) + 1.5 * Math.max(0, midi - profile.comfortHigh);
        const beyond = Math.max(0, profile.comfortLow - 2 - midi, midi - (profile.comfortHigh + 2));
        cost += note.d * (below + 1.5 * above + 6 * outside + 50 * beyond);
      }
      // The extreme notes count on their own, however briefly they are sung: one strained note spoils a line.
      const extremes = Math.max(0, profile.comfortLow - low) + 1.5 * Math.max(0, high - profile.comfortHigh);
      cost =
        cost / total +
        0.3 * extremes +
        0.05 * Math.abs(trackShift) +
        0.5 * Math.max(0, Math.abs(trackShift) - CLEAN_SHIFT);
      choices.push({ trackShift, octaveDrop, lowMidi: low, highMidi: high, inComfortPct: (100 * inComfort) / total, cost });
    }
  }
  return choices.sort((a, b) => a.cost - b.cost).slice(0, count);
}
