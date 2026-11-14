import { midiToHz } from "../dsp/music";
import { median } from "../dsp/stats";
import type { F0Track } from "../pitch/track";

/** A note to sing. `t` and `d` are seconds, on the same time axis as the track being scored. */
export type TargetNote = { id: number; t: number; d: number; midi: number };

export type Outcome = "hit" | "close" | "miss" | "octave" | "unscored";

export type NoteResult = {
  id: number;
  outcome: Outcome;
  /** Signed median error against the target. Negative is flat. */
  cents: number | null;
  /** How much the pitch wandered while the note was held. */
  spreadCents: number | null;
  voicedFraction: number;
};

/** The part of a note that is judged: after the start has settled, before the release. */
function steadySpan(note: TargetNote): [number, number] {
  return [note.t + Math.max(0.08, 0.15 * note.d), note.t + 0.9 * note.d];
}

/** Indexes of the track frames inside a note's steady span, clamped to the track. */
function frameSpan(track: F0Track, note: TargetNote, offsetS: number): [number, number] {
  const [start, end] = steadySpan(note);
  const first = Math.max(0, Math.ceil((start + offsetS - track.t0) / track.hopS));
  const last = Math.min(track.hz.length - 1, Math.floor((end + offsetS - track.t0) / track.hopS));
  return [first, last];
}

function classify(cents: number): Outcome {
  const size = Math.abs(cents);
  if (size <= 50) return "hit";
  if (size <= 100) return "close";
  if (Math.abs(size - 1200) <= 50) return "octave";
  return "miss";
}

/** Scores each target against the track. `offsetS` shifts the targets later (positive) or earlier. */
export function scoreNotes(track: F0Track, targets: TargetNote[], offsetS = 0): NoteResult[] {
  return targets.map((note) => {
    const [start, end] = steadySpan(note);
    const [first, last] = frameSpan(track, note, offsetS);
    const expected = Math.max(1, Math.floor((end - start) / track.hopS));
    const targetHz = midiToHz(note.midi);
    const cents: number[] = [];
    for (let i = first; i <= last; i++) {
      if (track.hz[i] > 0) cents.push(1200 * Math.log2(track.hz[i] / targetHz));
    }
    const voicedFraction = Math.min(1, cents.length / expected);
    if (voicedFraction < 0.5) {
      return { id: note.id, outcome: "unscored", cents: null, spreadCents: null, voicedFraction };
    }
    const center = median(cents);
    const mean = cents.reduce((sum, c) => sum + c, 0) / cents.length;
    const spreadCents = Math.sqrt(cents.reduce((sum, c) => sum + (c - mean) ** 2, 0) / cents.length);
    return { id: note.id, outcome: classify(center), cents: center, spreadCents, voicedFraction };
  });
}

/** How well the targets line up with the singing at a given shift: frames near the target count most. */
function overlap(track: F0Track, targets: TargetNote[], offsetS: number): number {
  let matching = 0;
  let voiced = 0;
  for (const note of targets) {
    const [first, last] = frameSpan(track, note, offsetS);
    const targetHz = midiToHz(note.midi);
    for (let i = first; i <= last; i++) {
      if (track.hz[i] <= 0) continue;
      voiced++;
      if (Math.abs(1200 * Math.log2(track.hz[i] / targetHz)) <= 100) matching++;
    }
  }
  return matching * 1000 + voiced;
}

/**
 * The shift, within ±`maxShiftS`, at which the targets best line up with the
 * singing. A singer who starts slightly early or late is not marked wrong for
 * it. Ties go to the smallest shift.
 */
export function bestOffset(track: F0Track, targets: TargetNote[], maxShiftS = 0.15, stepS = 0.01): number {
  let best = 0;
  let bestScore = -1;
  const steps = Math.round(maxShiftS / stepS);
  for (let k = 0; k <= steps; k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const shift = sign * k * stepS;
      const score = overlap(track, targets, shift);
      if (score > bestScore) {
        bestScore = score;
        best = shift;
      }
    }
  }
  return best;
}

export function scoreResponse(
  track: F0Track,
  targets: TargetNote[],
  maxShiftS = 0.15,
): { offsetS: number; notes: NoteResult[] } {
  const offsetS = bestOffset(track, targets, maxShiftS);
  return { offsetS, notes: scoreNotes(track, targets, offsetS) };
}

/** True when every note was hit; null when any note was not scored, so the attempt does not count. */
export function isSuccess(results: NoteResult[]): boolean | null {
  if (results.some((r) => r.outcome === "unscored")) return null;
  return results.every((r) => r.outcome === "hit");
}
