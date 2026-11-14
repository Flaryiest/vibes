/**
 * Corrections to a song's notes, for the note editor (section 5.11 of the spec).
 *
 * Every function takes the notes and returns a new, normalized array; nothing
 * is changed in place. Notes an edit did not touch are the same objects as
 * before, so keeping every step of an editing session costs little memory.
 *
 * An `id` argument is the id the note has in the array passed in. Because the
 * result is renumbered, ids are positions: note 3 is the fourth note in time.
 */
import { hzToMidi } from "../dsp/music";
import { median } from "../dsp/stats";
import type { F0, Note, NoteKind } from "./types";

/** No edit makes a note shorter than this. */
export const MIN_NOTE_S = 0.05;

const MIDI_MAX = 127;

const endOf = (note: Note) => note.t + note.d;

/** Rounds to a whole microsecond, so repeated small moves do not pile up floating-point error. */
const tidy = (seconds: number) => Math.round(seconds * 1e6) / 1e6;

/**
 * Limits `value` to `low`..`high`. The range is widened to take in `current`,
 * so a note that already breaks a rule can stay as it is but never gets worse.
 */
const within = (value: number, current: number, low: number, high: number) =>
  Math.min(Math.max(value, Math.min(low, current)), Math.max(high, current));

const byStart = (notes: Note[]): Note[] => [...notes].sort((a, b) => a.t - b.t);

/**
 * Sorts by start time and renumbers: `id` becomes the position, and phrases
 * count up from zero in order of appearance. A phrase is one unbroken run of
 * notes, so a phrase number that comes back after another phrase starts a new one.
 */
export function normalize(notes: Note[]): Note[] {
  const sorted = byStart(notes);
  let phrase = -1;
  return sorted.map((note, i) => {
    if (i === 0 || note.phrase !== sorted[i - 1].phrase) phrase++;
    return note.id === i && note.phrase === phrase ? note : { ...note, id: i, phrase };
  });
}

export type Phrase = { phrase: number; startS: number; endS: number; noteIds: number[] };

/** The phrases in order of time, each with the span it covers and the ids of its notes. */
export function phrasesOf(notes: Note[]): Phrase[] {
  const phrases = new Map<number, Phrase>();
  for (const note of byStart(notes)) {
    const found = phrases.get(note.phrase);
    if (found) {
      found.endS = Math.max(found.endS, endOf(note));
      found.noteIds.push(note.id);
    } else {
      phrases.set(note.phrase, { phrase: note.phrase, startS: note.t, endS: endOf(note), noteIds: [note.id] });
    }
  }
  return [...phrases.values()];
}

/** Whether two songs hold the same notes, field for field. */
export function sameNotes(a: Note[], b: Note[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((note, i) => {
    const other = b[i];
    return note === other || (Object.keys(note) as (keyof Note)[]).every((key) => note[key] === other[key]);
  });
}

/** Replaces one note, given the notes on either side of it in time. */
function editNote(
  notes: Note[],
  id: number,
  change: (note: Note, previous: Note | undefined, next: Note | undefined) => Note,
): Note[] {
  const sorted = byStart(notes);
  const i = sorted.findIndex((note) => note.id === id);
  if (i >= 0) sorted[i] = change(sorted[i], sorted[i - 1], sorted[i + 1]);
  return normalize(sorted);
}

/**
 * Moves a note up or down by semitones. `cents`, the original singer's offset,
 * is kept: use `snapToMeasuredPitch` to measure it again.
 */
export function movePitch(notes: Note[], id: number, semitones: number): Note[] {
  return editNote(notes, id, (note) => ({
    ...note,
    midi: Math.min(MIDI_MAX, Math.max(0, note.midi + Math.round(semitones))),
  }));
}

/** Moves a note one octave up (1) or down (-1), to fix an octave error. */
export function shiftOctave(notes: Note[], id: number, direction: 1 | -1): Note[] {
  return editNote(notes, id, (note) => {
    const midi = note.midi + 12 * direction;
    return midi < 0 || midi > MIDI_MAX ? note : { ...note, midi };
  });
}

/** Moves where a note starts; its end stays put. Stops at the previous note, at zero and at the shortest length. */
export function moveStart(notes: Note[], id: number, deltaS: number): Note[] {
  return editNote(notes, id, (note, previous) => {
    const end = endOf(note);
    const earliest = previous ? Math.max(0, endOf(previous)) : 0;
    const start = within(note.t + deltaS, note.t, earliest, end - MIN_NOTE_S);
    if (start === note.t) return note;
    const t = tidy(start);
    return { ...note, t, d: tidy(end - t) };
  });
}

/** Moves where a note ends; its start stays put. Stops at the next note and at the shortest length. */
export function moveEnd(notes: Note[], id: number, deltaS: number): Note[] {
  return editNote(notes, id, (note, _previous, next) => {
    const end = within(endOf(note) + deltaS, endOf(note), note.t + MIN_NOTE_S, next ? next.t : Infinity);
    return end === endOf(note) ? note : { ...note, d: tidy(end - note.t) };
  });
}

/** Moves a whole note earlier or later, keeping its length. Stops at the notes on either side and at zero. */
export function moveNote(notes: Note[], id: number, deltaS: number): Note[] {
  return editNote(notes, id, (note, previous, next) => {
    const earliest = previous ? Math.max(0, endOf(previous)) : 0;
    const start = within(note.t + deltaS, note.t, earliest, next ? next.t - note.d : Infinity);
    return start === note.t ? note : { ...note, t: tidy(start) };
  });
}

/**
 * Cuts a note in two at `atS`, a time in the song. The second half continues
 * the syllable, so its text is "~". Nothing happens when `atS` is not inside
 * the note or the note is too short to make two.
 */
export function splitNote(notes: Note[], id: number, atS: number): Note[] {
  const sorted = byStart(notes);
  const i = sorted.findIndex((note) => note.id === id);
  const note = sorted[i];
  if (note && note.d >= 2 * MIN_NOTE_S && atS > note.t && atS < endOf(note)) {
    const end = endOf(note);
    const at = tidy(Math.min(Math.max(atS, note.t + MIN_NOTE_S), end - MIN_NOTE_S));
    sorted.splice(i, 1, { ...note, d: tidy(at - note.t) }, { ...note, t: at, d: tidy(end - at), text: "~" });
  }
  return normalize(sorted);
}

/** Joins a note to the one after it. The result keeps the first note's pitch, text and phrase. */
export function mergeWithNext(notes: Note[], id: number): Note[] {
  const sorted = byStart(notes);
  const i = sorted.findIndex((note) => note.id === id);
  const note = sorted[i];
  const next = sorted[i + 1];
  if (note && next) sorted.splice(i, 2, { ...note, d: tidy(endOf(next) - note.t) });
  return normalize(sorted);
}

export function removeNote(notes: Note[], id: number): Note[] {
  return normalize(notes.filter((note) => note.id !== id));
}

export function setKind(notes: Note[], id: number, kind: NoteKind): Note[] {
  return editNote(notes, id, (note) => ({ ...note, kind }));
}

export function setText(notes: Note[], id: number, text: string): Note[] {
  return editNote(notes, id, (note) => ({ ...note, text }));
}

/**
 * The pitch the original singer held during a note: the median of the voiced
 * frames of the curve that fall inside it, as a whole MIDI pitch plus cents.
 * Null when under half of those frames are voiced, or the curve does not reach the note.
 */
export function measuredPitch(note: Pick<Note, "t" | "d">, f0: F0): { midi: number; cents: number } | null {
  if (!(f0.hopS > 0)) return null;
  // Frame i is at i * hopS. The small allowance keeps a note that starts exactly on a frame from losing it to rounding.
  // A frame that falls exactly on the note's end belongs to whatever comes next.
  const first = Math.max(0, Math.ceil(note.t / f0.hopS - 1e-6));
  const last = Math.min(f0.hz.length, Math.ceil((note.t + note.d) / f0.hopS - 1e-6));
  const voiced: number[] = [];
  for (let i = first; i < last; i++) {
    if (f0.hz[i] > 0) voiced.push(hzToMidi(f0.hz[i]));
  }
  if (last <= first || voiced.length * 2 < last - first) return null;
  const pitch = median(voiced);
  const midi = Math.round(pitch);
  // "+ 0" turns a negative zero into zero.
  return { midi, cents: Math.round((pitch - midi) * 100) + 0 };
}

/** Sets a note's pitch and offset from the original singer's curve. Leaves it alone when that cannot be measured. */
export function snapToMeasuredPitch(notes: Note[], id: number, f0: F0): Note[] {
  return editNote(notes, id, (note) => {
    const measured = measuredPitch(note, f0);
    return measured ? { ...note, ...measured } : note;
  });
}

/**
 * Starts a new phrase at this note, taking the rest of its phrase along. If the
 * note already starts a phrase, joins that phrase to the one before instead.
 * The first note always starts a phrase, so nothing happens there.
 */
export function togglePhraseBreakBefore(notes: Note[], id: number): Note[] {
  const sorted = byStart(notes);
  const at = sorted.findIndex((note) => note.id === id);
  if (at <= 0) return normalize(sorted);
  const starts = sorted.map((note, i) => i === 0 || note.phrase !== sorted[i - 1].phrase);
  starts[at] = !starts[at];
  let phrase = -1;
  return normalize(
    sorted.map((note, i) => {
      if (starts[i]) phrase++;
      return { ...note, phrase };
    }),
  );
}

/** Every state of an editing session: the notes now, the steps before them, and the steps undone. */
export type EditHistory = { past: Note[][]; present: Note[]; future: Note[][] };

export function startHistory(notes: Note[]): EditHistory {
  return { past: [], present: normalize(notes), future: [] };
}

/**
 * Records `notes` as the next step. An edit that changed nothing is not
 * recorded. With `fold`, the edit joins the step before it instead of adding
 * one, so a run of small moves or a typed word is undone in one go.
 */
export function pushEdit(history: EditHistory, notes: Note[], fold = false): EditHistory {
  if (sameNotes(notes, history.present)) return history;
  if (fold && history.past.length > 0) {
    const before = history.past[history.past.length - 1];
    // A folded step that ends where it began is no step at all.
    if (sameNotes(notes, before)) return { past: history.past.slice(0, -1), present: before, future: [] };
    return { past: history.past, present: notes, future: [] };
  }
  return { past: [...history.past, history.present], present: notes, future: [] };
}

export function undoEdit(history: EditHistory): EditHistory {
  if (history.past.length === 0) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  };
}

export function redoEdit(history: EditHistory): EditHistory {
  if (history.future.length === 0) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}
