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
  /**
   * For notes of `LONG_NOTE_S` or longer: the pitch at the end of the note
   * against the pitch before it. Negative means the note sags. Null for
   * shorter notes and for notes that were not scored.
   */
  endDriftCents?: number | null;
  /**
   * When the note was actually started, against when it should have been, in
   * milliseconds. Positive is late. Null when no start was heard near the target.
   */
  onsetMs?: number | null;
};

/** From this length up a note is long enough to judge how steadily it is held and how it ends. */
export const LONG_NOTE_S = 0.6;
/** The share of the steady portion, at its end, that is compared with the rest. */
const END_SHARE = 0.3;
/** How far before and after the target start a note's start is looked for. */
const ONSET_BEFORE_S = 0.12;
const ONSET_AFTER_S = 0.25;
/** The voice must sound for this long to count as a note starting. */
const ONSET_RUN_S = 0.06;

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

/**
 * When the singer started a note, against the target start, in milliseconds:
 * the first place near the target start where the voice comes in after a
 * silence and then sounds for at least `ONSET_RUN_S`. A voice that was already
 * sounding (a note joined to the one before) has no start to time, so it gives null.
 */
function findOnsetMs(track: F0Track, note: TargetNote, offsetS: number): number | null {
  const target = note.t + offsetS;
  // Frame 0 is never a start: what came before the recording is unknown.
  const first = Math.max(1, Math.ceil((target - ONSET_BEFORE_S - track.t0) / track.hopS));
  const last = Math.min(track.hz.length - 1, Math.floor((target + ONSET_AFTER_S - track.t0) / track.hopS));
  const needed = Math.ceil(ONSET_RUN_S / track.hopS - 1e-9);
  for (let i = first; i <= last; i++) {
    if (!(track.hz[i] > 0) || track.hz[i - 1] > 0) continue;
    let length = 1;
    while (length < needed && track.hz[i + length] > 0) length++;
    if (length >= needed) return (track.t0 + i * track.hopS - target) * 1000;
  }
  return null;
}

/** Scores each target against the track. `offsetS` shifts the targets later (positive) or earlier. */
export function scoreNotes(track: F0Track, targets: TargetNote[], offsetS = 0): NoteResult[] {
  return targets.map((note) => {
    const [start, end] = steadySpan(note);
    const [first, last] = frameSpan(track, note, offsetS);
    const expected = Math.max(1, Math.floor((end - start) / track.hopS));
    const targetHz = midiToHz(note.midi);
    // The end of the steady portion is kept apart, to see whether the note holds its pitch.
    const endFrom = start + (1 - END_SHARE) * (end - start) + offsetS;
    const cents: number[] = [];
    const body: number[] = [];
    const ending: number[] = [];
    for (let i = first; i <= last; i++) {
      if (!(track.hz[i] > 0)) continue;
      const value = 1200 * Math.log2(track.hz[i] / targetHz);
      cents.push(value);
      (track.t0 + i * track.hopS >= endFrom ? ending : body).push(value);
    }
    const voicedFraction = Math.min(1, cents.length / expected);
    const onsetMs = findOnsetMs(track, note, offsetS);
    if (voicedFraction < 0.5) {
      return {
        id: note.id,
        outcome: "unscored",
        cents: null,
        spreadCents: null,
        voicedFraction,
        endDriftCents: null,
        onsetMs,
      };
    }
    const center = median(cents);
    const mean = cents.reduce((sum, c) => sum + c, 0) / cents.length;
    const spreadCents = Math.sqrt(cents.reduce((sum, c) => sum + (c - mean) ** 2, 0) / cents.length);
    const long = note.d >= LONG_NOTE_S && body.length > 0 && ending.length > 0;
    const endDriftCents = long ? median(ending) - median(body) : null;
    return { id: note.id, outcome: classify(center), cents: center, spreadCents, voicedFraction, endDriftCents, onsetMs };
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
