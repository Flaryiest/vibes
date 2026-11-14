import { describe, expect, it } from "vitest";
import { midiToHz } from "../dsp/music";
import {
  MIN_NOTE_S,
  measuredPitch,
  mergeWithNext,
  moveEnd,
  moveNote,
  movePitch,
  moveStart,
  normalize,
  phrasesOf,
  pushEdit,
  redoEdit,
  removeNote,
  sameNotes,
  setKind,
  setText,
  shiftOctave,
  snapToMeasuredPitch,
  splitNote,
  startHistory,
  togglePhraseBreakBefore,
  undoEdit,
} from "./edit";
import type { F0, Note } from "./types";

const HOP = 0.01;

const note = (t: number, d: number, midi: number, extra: Partial<Note> = {}): Note => ({
  id: 0,
  t,
  d,
  midi,
  cents: 0,
  text: "la",
  word: 0,
  line: 0,
  phrase: 0,
  kind: "normal",
  ...extra,
});

/**
 * Four notes in two phrases:
 *   0: 1.0–1.5   1: 1.5–2.0   (phrase 0, back to back)
 *   2: 3.0–3.4   3: 3.6–4.0   (phrase 1, with a gap)
 */
const song = (): Note[] =>
  normalize([
    note(1.0, 0.5, 60, { text: "sai", word: 0, cents: 12 }),
    note(1.5, 0.5, 62, { text: "lor", word: 0 }),
    note(3.0, 0.4, 64, { text: "song", word: 1, line: 1, phrase: 1 }),
    note(3.6, 0.4, 65, { text: "~", word: 1, line: 1, phrase: 1, kind: "rap" }),
  ]);

const end = (n: Note) => n.t + n.d;

/** A pitch curve that follows `segments`: [seconds, MIDI pitch] pairs, with 0 for unvoiced. */
function curve(segments: [number, number][]): F0 {
  const hz: number[] = [];
  for (const [seconds, midi] of segments) {
    for (let i = 0; i < Math.round(seconds / HOP); i++) hz.push(midi === 0 ? 0 : midiToHz(midi));
  }
  return { hopS: HOP, hz, conf: hz.map((value) => (value > 0 ? 1 : 0)) };
}

/** Repeatable values in [0, 1). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** What every editing function promises about its result. */
function expectWellFormed(notes: Note[]) {
  notes.forEach((n, i) => {
    expect(n.id).toBe(i);
    expect(n.t).toBeGreaterThanOrEqual(0);
    expect(n.d).toBeGreaterThanOrEqual(MIN_NOTE_S - 1e-6);
    if (i > 0) {
      expect(n.t).toBeGreaterThanOrEqual(end(notes[i - 1]) - 1e-6);
      const step = n.phrase - notes[i - 1].phrase;
      expect(step === 0 || step === 1).toBe(true);
    } else {
      expect(n.phrase).toBe(0);
    }
  });
}

describe("normalize", () => {
  it("sorts by start time and renumbers the ids", () => {
    const notes = normalize([note(2, 0.5, 62, { id: 7 }), note(1, 0.5, 60, { id: 3 }), note(3, 0.5, 64, { id: 3 })]);
    expect(notes.map((n) => n.t)).toEqual([1, 2, 3]);
    expect(notes.map((n) => n.id)).toEqual([0, 1, 2]);
  });

  it("renumbers phrases from zero in order of appearance", () => {
    const notes = normalize([
      note(1, 0.5, 60, { phrase: 7 }),
      note(2, 0.5, 60, { phrase: 7 }),
      note(3, 0.5, 60, { phrase: 3 }),
      note(4, 0.5, 60, { phrase: 9 }),
    ]);
    expect(notes.map((n) => n.phrase)).toEqual([0, 0, 1, 2]);
  });

  it("gives a phrase number that comes back later a phrase of its own", () => {
    const notes = normalize([
      note(1, 0.5, 60, { phrase: 5 }),
      note(2, 0.5, 60, { phrase: 2 }),
      note(3, 0.5, 60, { phrase: 5 }),
    ]);
    expect(notes.map((n) => n.phrase)).toEqual([0, 1, 2]);
  });

  it("keeps the order of notes that start together", () => {
    const notes = normalize([note(1, 0.5, 60, { text: "a" }), note(1, 0.5, 62, { text: "b" })]);
    expect(notes.map((n) => n.text)).toEqual(["a", "b"]);
  });

  it("leaves everything else alone", () => {
    const [only] = normalize([note(1, 0.5, 60, { id: 9, cents: -20, word: 4, line: 2, phrase: 6, kind: "free" })]);
    expect(only).toEqual({
      id: 0,
      t: 1,
      d: 0.5,
      midi: 60,
      cents: -20,
      text: "la",
      word: 4,
      line: 2,
      phrase: 0,
      kind: "free",
    });
  });

  it("returns a new array and does not change its input", () => {
    const input = [note(2, 0.5, 62, { id: 5, phrase: 3 }), note(1, 0.5, 60, { id: 4, phrase: 3 })];
    const before = structuredClone(input);
    const result = normalize(input);
    expect(result).not.toBe(input);
    expect(input).toEqual(before);
    expect(normalize(result)).toEqual(result);
    expect(normalize(result)).not.toBe(result);
  });

  it("handles an empty song", () => {
    expect(normalize([])).toEqual([]);
  });
});

describe("phrasesOf", () => {
  it("lists each phrase with its span and notes", () => {
    const phrases = phrasesOf(song());
    expect(phrases.length).toBe(2);
    expect(phrases[0]).toEqual({ phrase: 0, startS: 1, endS: 2, noteIds: [0, 1] });
    expect(phrases[1].phrase).toBe(1);
    expect(phrases[1].startS).toBe(3);
    expect(phrases[1].endS).toBeCloseTo(4, 9);
    expect(phrases[1].noteIds).toEqual([2, 3]);
  });

  it("orders phrases and their notes by time whatever order the notes come in", () => {
    const phrases = phrasesOf([
      note(5, 0.5, 60, { id: 12, phrase: 4 }),
      note(1, 0.5, 60, { id: 10, phrase: 8 }),
      note(2, 0.5, 60, { id: 11, phrase: 8 }),
    ]);
    expect(phrases.map((p) => p.phrase)).toEqual([8, 4]);
    expect(phrases[0].noteIds).toEqual([10, 11]);
  });

  it("returns nothing for an empty song", () => {
    expect(phrasesOf([])).toEqual([]);
  });
});

describe("movePitch", () => {
  it("moves one note by semitones", () => {
    const notes = movePitch(song(), 1, 3);
    expect(notes.map((n) => n.midi)).toEqual([60, 65, 64, 65]);
    expect(movePitch(song(), 1, -2)[1].midi).toBe(60);
  });

  it("keeps the measured offset and the timing", () => {
    const moved = movePitch(song(), 0, 1)[0];
    expect(moved).toEqual({ ...song()[0], midi: 61 });
  });

  it("stays inside the MIDI range", () => {
    expect(movePitch(song(), 0, 200)[0].midi).toBe(127);
    expect(movePitch(song(), 0, -200)[0].midi).toBe(0);
  });

  it("keeps the pitch whole", () => {
    expect(movePitch(song(), 0, 1.4)[0].midi).toBe(61);
  });

  it("changes nothing for an id that is not there", () => {
    expect(movePitch(song(), 99, 3)).toEqual(song());
  });

  it("does not change its input", () => {
    const input = song();
    const before = structuredClone(input);
    const result = movePitch(input, 1, 3);
    expect(input).toEqual(before);
    expect(result).not.toBe(input);
  });
});

describe("shiftOctave", () => {
  it("moves a note twelve semitones up or down", () => {
    expect(shiftOctave(song(), 2, 1)[2].midi).toBe(76);
    expect(shiftOctave(song(), 2, -1)[2].midi).toBe(52);
  });

  it("keeps the measured offset, which an octave error does not change", () => {
    expect(shiftOctave(song(), 0, 1)[0].cents).toBe(12);
  });

  it("leaves the note alone when the octave is out of range", () => {
    const high = normalize([note(1, 0.5, 120)]);
    expect(shiftOctave(high, 0, 1)[0].midi).toBe(120);
    const low = normalize([note(1, 0.5, 5)]);
    expect(shiftOctave(low, 0, -1)[0].midi).toBe(5);
  });
});

describe("moveStart", () => {
  it("moves the start and keeps the end where it was", () => {
    const moved = moveStart(song(), 2, -0.3)[2];
    expect(moved.t).toBeCloseTo(2.7, 9);
    expect(end(moved)).toBeCloseTo(3.4, 9);
    const later = moveStart(song(), 2, 0.1)[2];
    expect(later.t).toBeCloseTo(3.1, 9);
    expect(end(later)).toBeCloseTo(3.4, 9);
  });

  it("stops at the end of the previous note", () => {
    const moved = moveStart(song(), 2, -5)[2];
    expect(moved.t).toBeCloseTo(2.0, 9);
    expect(end(moved)).toBeCloseTo(3.4, 9);
    // Notes 0 and 1 already touch.
    expect(moveStart(song(), 1, -0.2)[1]).toEqual(song()[1]);
  });

  it("does not let the first note start before zero", () => {
    const moved = moveStart(song(), 0, -5)[0];
    expect(moved.t).toBe(0);
    expect(end(moved)).toBeCloseTo(1.5, 9);
  });

  it("leaves at least the shortest allowed note", () => {
    const moved = moveStart(song(), 2, 5)[2];
    expect(moved.d).toBeCloseTo(MIN_NOTE_S, 9);
    expect(end(moved)).toBeCloseTo(3.4, 9);
  });

  it("leaves the other notes untouched", () => {
    const notes = moveStart(song(), 2, -0.3);
    expect([notes[0], notes[1], notes[3]]).toEqual([song()[0], song()[1], song()[3]]);
  });
});

describe("moveEnd", () => {
  it("moves the end and keeps the start", () => {
    const moved = moveEnd(song(), 2, 0.1)[2];
    expect(moved.t).toBe(3);
    expect(moved.d).toBeCloseTo(0.5, 9);
    expect(moveEnd(song(), 2, -0.1)[2].d).toBeCloseTo(0.3, 9);
  });

  it("stops at the start of the next note", () => {
    const moved = moveEnd(song(), 2, 5)[2];
    expect(end(moved)).toBeCloseTo(3.6, 9);
    expect(moveEnd(song(), 0, 0.2)[0]).toEqual(song()[0]);
  });

  it("lets the last note grow freely", () => {
    expect(end(moveEnd(song(), 3, 5)[3])).toBeCloseTo(9, 9);
  });

  it("leaves at least the shortest allowed note", () => {
    const moved = moveEnd(song(), 2, -5)[2];
    expect(moved.t).toBe(3);
    expect(moved.d).toBeCloseTo(MIN_NOTE_S, 9);
  });
});

describe("moveNote", () => {
  it("moves the whole note and keeps its length", () => {
    const moved = moveNote(song(), 2, -0.5)[2];
    expect(moved.t).toBeCloseTo(2.5, 9);
    expect(moved.d).toBe(0.4);
  });

  it("stops against the previous note", () => {
    const moved = moveNote(song(), 2, -5)[2];
    expect(moved.t).toBeCloseTo(2.0, 9);
    expect(moved.d).toBe(0.4);
  });

  it("stops against the next note", () => {
    const moved = moveNote(song(), 2, 5)[2];
    expect(end(moved)).toBeCloseTo(3.6, 9);
    expect(moved.d).toBe(0.4);
  });

  it("does not move a note that is wedged between its neighbours", () => {
    const wedged = normalize([note(1, 0.5, 60), note(1.5, 0.5, 62), note(2, 0.5, 64)]);
    expect(moveNote(wedged, 1, 0.2)).toEqual(wedged);
    expect(moveNote(wedged, 1, -0.2)).toEqual(wedged);
  });

  it("does not let the first note start before zero", () => {
    const moved = moveNote(song(), 0, -5)[0];
    expect(moved.t).toBe(0);
    expect(moved.d).toBe(0.5);
  });

  it("lets the last note move later freely", () => {
    expect(moveNote(song(), 3, 5)[3].t).toBeCloseTo(8.6, 9);
  });

  it("does not pile up rounding error over repeated small moves", () => {
    let notes = song();
    for (let i = 0; i < 3; i++) notes = moveNote(notes, 2, 0.01);
    expect(notes[2].t).toBe(3.03);
    for (let i = 0; i < 3; i++) notes = moveNote(notes, 2, -0.01);
    expect(notes[2].t).toBe(3);
  });

  it("keeps ids stable, because a note cannot pass its neighbours", () => {
    const notes = moveNote(song(), 1, 5);
    expect(notes.map((n) => n.text)).toEqual(["sai", "lor", "song", "~"]);
  });
});

describe("notes that already break the rules", () => {
  it("are not changed by a move of zero", () => {
    const overlapping = [note(1, 0.5, 60, { id: 0 }), note(1.2, 0.02, 62, { id: 1 }), note(1.21, 0.5, 64, { id: 2 })];
    expect(moveNote(overlapping, 1, 0)).toEqual(normalize(overlapping));
    expect(moveStart(overlapping, 1, 0)).toEqual(normalize(overlapping));
    expect(moveEnd(overlapping, 1, 0)).toEqual(normalize(overlapping));
  });

  it("are never made worse", () => {
    const overlapping = [note(1, 0.5, 60, { id: 0 }), note(1.2, 0.02, 62, { id: 1 }), note(1.21, 0.5, 64, { id: 2 })];
    // Further into the previous note, or shorter still: refused.
    expect(moveNote(overlapping, 1, -0.1)[1].t).toBe(1.2);
    expect(moveStart(overlapping, 1, 0.01)[1].d).toBe(0.02);
    expect(moveEnd(overlapping, 1, -0.01)[1].d).toBe(0.02);
    // Out of the overlap: allowed.
    expect(moveStart(overlapping, 2, 0.1)[2].t).toBeCloseTo(1.31, 9);
  });
});

describe("splitNote", () => {
  it("cuts a note in two at the given time", () => {
    const notes = splitNote(song(), 0, 1.2);
    expect(notes.length).toBe(5);
    expect(notes.map((n) => n.id)).toEqual([0, 1, 2, 3, 4]);
    expect(notes[0].t).toBe(1);
    expect(notes[0].d).toBeCloseTo(0.2, 9);
    expect(notes[1].t).toBeCloseTo(1.2, 9);
    expect(notes[1].d).toBeCloseTo(0.3, 9);
  });

  it("marks the second half as a continuation of the syllable", () => {
    const [first, second] = splitNote(song(), 0, 1.2);
    expect(first.text).toBe("sai");
    expect(second.text).toBe("~");
    expect(second).toEqual({ ...first, id: 1, t: second.t, d: second.d, text: "~" });
  });

  it("keeps both halves at least the shortest allowed length", () => {
    const early = splitNote(song(), 0, 1.01);
    expect(early[0].d).toBeCloseTo(MIN_NOTE_S, 9);
    expect(end(early[1])).toBeCloseTo(1.5, 9);
    const late = splitNote(song(), 0, 1.49);
    expect(late[1].d).toBeCloseTo(MIN_NOTE_S, 9);
    expect(late[0].t).toBe(1);
  });

  it("does nothing when the time is outside the note", () => {
    expect(splitNote(song(), 0, 0.5)).toEqual(song());
    expect(splitNote(song(), 0, 1)).toEqual(song());
    expect(splitNote(song(), 0, 1.5)).toEqual(song());
    expect(splitNote(song(), 0, 2.5)).toEqual(song());
  });

  it("does nothing to a note too short to make two", () => {
    const short = normalize([note(1, 0.08, 60)]);
    expect(splitNote(short, 0, 1.04)).toEqual(short);
  });

  it("splits a note of exactly twice the shortest length down the middle", () => {
    const notes = splitNote(normalize([note(1, 2 * MIN_NOTE_S, 60)]), 0, 1.02);
    expect(notes.length).toBe(2);
    expect(notes[0].d).toBeCloseTo(MIN_NOTE_S, 9);
    expect(notes[1].d).toBeCloseTo(MIN_NOTE_S, 9);
  });

  it("keeps the phrases as they were", () => {
    expect(splitNote(song(), 2, 3.2).map((n) => n.phrase)).toEqual([0, 0, 1, 1, 1]);
  });
});

describe("mergeWithNext", () => {
  it("joins a note to the next, keeping the first note's pitch and text", () => {
    const notes = mergeWithNext(song(), 2);
    expect(notes.length).toBe(3);
    expect(notes[2]).toEqual({ ...song()[2], d: notes[2].d });
    expect(notes[2].t).toBe(3);
    expect(end(notes[2])).toBeCloseTo(4, 9);
    expect(notes[2].kind).toBe("normal");
  });

  it("does nothing on the last note", () => {
    expect(mergeWithNext(song(), 3)).toEqual(song());
  });

  it("undoes a split, apart from the lost text of the second half", () => {
    expect(mergeWithNext(splitNote(song(), 0, 1.2), 0)).toEqual(song());
  });

  it("merges across a phrase break and closes up the phrase numbers", () => {
    const notes = normalize([
      note(1, 0.5, 60, { phrase: 0 }),
      note(2, 0.5, 62, { phrase: 1 }),
      note(3, 0.5, 64, { phrase: 2 }),
    ]);
    const merged = mergeWithNext(notes, 0);
    expect(merged.map((n) => n.phrase)).toEqual([0, 1]);
    expect(merged.map((n) => n.id)).toEqual([0, 1]);
    expect(end(merged[0])).toBeCloseTo(2.5, 9);
  });
});

describe("removeNote", () => {
  it("removes the note and renumbers the rest", () => {
    const notes = removeNote(song(), 1);
    expect(notes.map((n) => n.text)).toEqual(["sai", "song", "~"]);
    expect(notes.map((n) => n.id)).toEqual([0, 1, 2]);
  });

  it("closes up the phrase numbers when a phrase disappears", () => {
    const notes = removeNote(removeNote(song(), 0), 0);
    expect(notes.map((n) => n.phrase)).toEqual([0, 0]);
  });

  it("can empty the song", () => {
    expect(removeNote(normalize([note(1, 0.5, 60)]), 0)).toEqual([]);
  });

  it("changes nothing for an id that is not there", () => {
    expect(removeNote(song(), -1)).toEqual(song());
  });
});

describe("setKind and setText", () => {
  it("sets how a note is scored", () => {
    const notes = setKind(song(), 1, "free");
    expect(notes.map((n) => n.kind)).toEqual(["normal", "free", "normal", "rap"]);
  });

  it("sets the syllable", () => {
    const notes = setText(song(), 3, "ah");
    expect(notes.map((n) => n.text)).toEqual(["sai", "lor", "song", "ah"]);
    expect(notes[3]).toEqual({ ...song()[3], text: "ah" });
  });
});

describe("measuredPitch", () => {
  it("is the median of the voiced frames inside the note, as a whole pitch and cents", () => {
    const f0 = curve([
      [1, 0],
      [0.5, 62.2],
    ]);
    expect(measuredPitch(note(1, 0.5, 60), f0)).toEqual({ midi: 62, cents: 20 });
  });

  it("reports a flat note with negative cents", () => {
    const f0 = curve([[2, 61.7]]);
    expect(measuredPitch(note(1, 0.5, 60), f0)).toEqual({ midi: 62, cents: -30 });
  });

  it("counts the frame at the note's start but not the one at its end", () => {
    // Frames 100 to 104 are voiced. A note from 1.0 to 1.1 covers frames 100 to 109: exactly half.
    const f0 = curve([
      [1, 0],
      [0.05, 67],
      [1, 0],
    ]);
    expect(measuredPitch(note(1, 0.1, 60), f0)).toEqual({ midi: 67, cents: 0 });
    // One more unvoiced frame at either end tips it under half.
    expect(measuredPitch(note(0.99, 0.11, 60), f0)).toBeNull();
    expect(measuredPitch(note(1, 0.11, 60), f0)).toBeNull();
  });

  it("is null when there is nothing to measure", () => {
    expect(measuredPitch(note(1, 0.5, 60), curve([[2, 0]]))).toBeNull();
    expect(measuredPitch(note(5, 0.5, 60), curve([[2, 62]]))).toBeNull();
    expect(measuredPitch(note(1, 0.5, 60), { hopS: 0, hz: [], conf: [] })).toBeNull();
  });
});

describe("snapToMeasuredPitch", () => {
  it("sets the pitch and the offset from the curve", () => {
    const f0 = curve([
      [1, 0],
      [0.5, 62.2],
      [3, 50],
    ]);
    const notes = snapToMeasuredPitch(song(), 0, f0);
    expect(notes[0]).toEqual({ ...song()[0], midi: 62, cents: 20 });
    expect(notes.slice(1)).toEqual(song().slice(1));
  });

  it("uses only the frames inside the note", () => {
    // Note 2 runs from 3.0 to 3.4; the curve is far away on both sides of it.
    const f0 = curve([
      [3, 40],
      [0.4, 66.1],
      [1, 80],
    ]);
    const snapped = snapToMeasuredPitch(song(), 2, f0)[2];
    expect(snapped.midi).toBe(66);
    expect(snapped.cents).toBe(10);
  });

  it("ignores unvoiced frames and stray octave jumps", () => {
    // Note 0 runs from 1.0 to 1.5: 30 frames on pitch, 10 an octave up, 10 unvoiced.
    const f0 = curve([
      [1, 0],
      [0.3, 62.2],
      [0.1, 74.2],
      [0.1, 0],
    ]);
    const snapped = snapToMeasuredPitch(song(), 0, f0)[0];
    expect(snapped.midi).toBe(62);
    expect(snapped.cents).toBe(20);
  });

  it("snaps when exactly half the frames are voiced", () => {
    const f0 = curve([
      [1, 0],
      [0.25, 67],
      [0.25, 0],
    ]);
    expect(snapToMeasuredPitch(song(), 0, f0)[0].midi).toBe(67);
  });

  it("leaves the note alone when under half the frames are voiced", () => {
    const f0 = curve([
      [1, 0],
      [0.2, 67],
      [0.3, 0],
    ]);
    expect(snapToMeasuredPitch(song(), 0, f0)).toEqual(song());
  });

  it("leaves the note alone when the curve does not reach it", () => {
    expect(snapToMeasuredPitch(song(), 3, curve([[2, 67]]))).toEqual(song());
  });
});

describe("togglePhraseBreakBefore", () => {
  it("starts a new phrase at the note", () => {
    const notes = togglePhraseBreakBefore(song(), 1);
    expect(notes.map((n) => n.phrase)).toEqual([0, 1, 2, 2]);
  });

  it("takes the rest of the phrase along", () => {
    const one = normalize([note(1, 0.5, 60), note(2, 0.5, 60), note(3, 0.5, 60), note(4, 0.5, 60)]);
    expect(togglePhraseBreakBefore(one, 2).map((n) => n.phrase)).toEqual([0, 0, 1, 1]);
  });

  it("joins the note to the previous phrase when it already starts one", () => {
    const notes = togglePhraseBreakBefore(song(), 2);
    expect(notes.map((n) => n.phrase)).toEqual([0, 0, 0, 0]);
  });

  it("is undone by doing it again", () => {
    expect(togglePhraseBreakBefore(togglePhraseBreakBefore(song(), 1), 1)).toEqual(song());
    expect(togglePhraseBreakBefore(togglePhraseBreakBefore(song(), 2), 2)).toEqual(song());
  });

  it("does nothing on the first note, which always starts a phrase", () => {
    expect(togglePhraseBreakBefore(song(), 0)).toEqual(song());
  });

  it("changes only phrase numbers", () => {
    const strip = (notes: Note[]) => notes.map((n) => ({ ...n, phrase: 0 }));
    expect(strip(togglePhraseBreakBefore(song(), 3))).toEqual(strip(song()));
  });
});

describe("every editing function", () => {
  const f0 = curve([[6, 61.3]]);
  const edits: ((notes: Note[], id: number, amount: number) => Note[])[] = [
    (notes, id, amount) => movePitch(notes, id, Math.round(amount * 6)),
    (notes, id, amount) => shiftOctave(notes, id, amount > 0 ? 1 : -1),
    (notes, id, amount) => moveStart(notes, id, amount),
    (notes, id, amount) => moveEnd(notes, id, amount),
    (notes, id, amount) => moveNote(notes, id, amount),
    (notes, id, amount) => splitNote(notes, id, (notes[id]?.t ?? 0) + Math.abs(amount)),
    (notes, id) => mergeWithNext(notes, id),
    (notes, id) => removeNote(notes, id),
    (notes, id, amount) => setKind(notes, id, amount > 0 ? "rap" : "free"),
    (notes, id) => setText(notes, id, "na"),
    (notes, id) => snapToMeasuredPitch(notes, id, f0),
    (notes, id) => togglePhraseBreakBefore(notes, id),
  ];

  it("accepts notes in any order with any ids, and returns them normalized", () => {
    const scrambled = [
      note(3.6, 0.4, 65, { id: 40, phrase: 9 }),
      note(1.0, 0.5, 60, { id: 10, phrase: 5 }),
      note(3.0, 0.4, 64, { id: 30, phrase: 9 }),
      note(1.5, 0.5, 62, { id: 20, phrase: 5 }),
    ];
    for (const edit of edits) expectWellFormed(edit(scrambled, 30, 0.1));
    // The id is the one the note had on the way in.
    expect(movePitch(scrambled, 30, 1).map((n) => n.midi)).toEqual([60, 62, 65, 65]);
    expect(removeNote(scrambled, 10).map((n) => n.midi)).toEqual([62, 64, 65]);
    expect(togglePhraseBreakBefore(scrambled, 20).map((n) => n.phrase)).toEqual([0, 1, 2, 2]);
  });

  it("keeps the song well formed through a long run of random edits", () => {
    const random = seeded(7);
    let notes = normalize(
      Array.from({ length: 24 }, (_, i) => note(1 + i * 0.5, 0.2 + (i % 3) * 0.1, 55 + (i % 9), { phrase: i >> 2 })),
    );
    for (let step = 0; step < 3000; step++) {
      const edit = edits[Math.floor(random() * edits.length)];
      const id = Math.floor(random() * (notes.length + 1));
      const before = structuredClone(notes);
      const result = edit(notes, id, (random() - 0.5) * 2);
      expect(notes).toEqual(before);
      expect(result).not.toBe(notes);
      expectWellFormed(result);
      // Keep the song from running out of notes.
      notes = result.length >= 8 ? result : notes;
    }
    expect(notes.length).toBeGreaterThanOrEqual(8);
  });
});

describe("sameNotes", () => {
  it("compares songs note by note", () => {
    expect(sameNotes(song(), song())).toBe(true);
    expect(sameNotes(song(), movePitch(song(), 0, 1))).toBe(false);
    expect(sameNotes(song(), setText(song(), 0, "x"))).toBe(false);
    expect(sameNotes(song(), removeNote(song(), 3))).toBe(false);
    expect(sameNotes([], [])).toBe(true);
  });
});

describe("edit history", () => {
  const a = song();
  const b = movePitch(a, 0, 1);
  const c = movePitch(b, 0, 1);
  const d = movePitch(c, 0, 1);

  it("starts from the normalized notes with nothing to undo", () => {
    const history = startHistory([note(2, 0.5, 62, { id: 5 }), note(1, 0.5, 60, { id: 9 })]);
    expect(history.present.map((n) => n.id)).toEqual([0, 1]);
    expect(history.present.map((n) => n.t)).toEqual([1, 2]);
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
    expect(undoEdit(history)).toBe(history);
    expect(redoEdit(history)).toBe(history);
  });

  it("undoes and redoes every step back to the start", () => {
    let history = pushEdit(pushEdit(pushEdit(startHistory(a), b), c), d);
    expect(history.present).toBe(d);
    history = undoEdit(history);
    expect(history.present).toBe(c);
    history = undoEdit(undoEdit(history));
    expect(history.present).toEqual(a);
    expect(undoEdit(history)).toBe(history);
    history = redoEdit(redoEdit(redoEdit(history)));
    expect(history.present).toBe(d);
    expect(redoEdit(history)).toBe(history);
  });

  it("drops the redo steps when a new edit is made", () => {
    let history = undoEdit(pushEdit(pushEdit(startHistory(a), b), c));
    history = pushEdit(history, d);
    expect(history.future).toEqual([]);
    expect(redoEdit(history)).toBe(history);
    expect(undoEdit(history).present).toBe(b);
  });

  it("does not record an edit that changed nothing", () => {
    const history = pushEdit(startHistory(a), b);
    expect(pushEdit(history, movePitch(b, 0, 0))).toBe(history);
    const undone = undoEdit(history);
    expect(pushEdit(undone, song()).future.length).toBe(1);
  });

  it("can fold an edit into the step before it", () => {
    let history = pushEdit(startHistory(a), b);
    history = pushEdit(history, c, true);
    history = pushEdit(history, d, true);
    expect(history.present).toBe(d);
    expect(history.past.length).toBe(1);
    expect(undoEdit(history).present).toEqual(a);
  });

  it("removes a folded step that ends where it began", () => {
    let history = pushEdit(startHistory(a), b);
    const start = history.past[0];
    history = pushEdit(history, c, true);
    history = pushEdit(history, song(), true);
    expect(history.present).toBe(start);
    expect(history.past).toEqual([]);
  });

  it("records a folded edit as a step of its own when there is nothing to fold into", () => {
    const history = pushEdit(startHistory(a), b, true);
    expect(history.past.length).toBe(1);
    expect(undoEdit(history).present).toEqual(a);
  });
});
