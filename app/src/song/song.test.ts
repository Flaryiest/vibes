import { describe, expect, it } from "vitest";
import { recommendKeys, targetMidi } from "./key";
import { validatePackage } from "./package";
import { buildPhrases, practiceOrder } from "./phrases";
import type { Note } from "./types";

let nextId = 0;
const note = (t: number, midi: number, text: string, phrase: number, d = 0.5): Note => ({
  id: nextId++,
  t,
  d,
  midi,
  cents: 0,
  text,
  word: 0,
  line: phrase,
  phrase,
  kind: "normal",
});

/** Verse, chorus, verse 2 (new words), chorus again a semitone lower in one note. */
const SONG: Note[] = [
  note(0, 60, "one", 0),
  note(0.5, 62, "two", 0),
  note(2, 64, "sing", 1),
  note(2.5, 65, "it", 1),
  note(3, 67, "loud", 1),
  note(5, 60, "three", 2),
  note(5.5, 62, "four", 2),
  note(7, 64, "Sing", 3),
  note(7.5, 65, "it,", 3),
  note(8, 66, "loud!", 3),
];

const base = {
  manifest: { schema: 1, id: "s", title: "S", artist: "A", durationS: 10 },
  notes: SONG,
  lyrics: { offsetS: 0, lines: [] },
  beats: { beats: [0, 0.5], downbeats: [0] },
  f0: { hopS: 0.01, hz: [0], conf: [0] },
};

describe("validatePackage", () => {
  it("accepts a complete package", () => {
    expect(validatePackage(base).notes.length).toBe(10);
  });

  it("says what is wrong", () => {
    expect(() => validatePackage({ ...base, manifest: { ...base.manifest, schema: 2 } })).toThrow(/another version/);
    expect(() => validatePackage({ ...base, notes: [] })).toThrow(/no notes/);
    expect(() => validatePackage({ ...base, notes: [SONG[1], SONG[0]] })).toThrow(/out of order/);
    expect(() => validatePackage({ ...base, f0: null })).toThrow(/pitch curve/);
  });
});

describe("buildPhrases", () => {
  const phrases = buildPhrases(SONG);

  it("splits notes into phrases with their words and times", () => {
    expect(phrases.length).toBe(4);
    expect(phrases[1]).toMatchObject({ index: 1, text: "sing it loud", t0: 2, t1: 3.5 });
  });

  it("groups a repeated phrase despite punctuation, case and a one-semitone difference", () => {
    expect(phrases[3].group).toBe(1);
    expect(phrases[1].copies).toBe(2);
  });

  it("keeps phrases with different words apart", () => {
    expect(phrases[2].group).toBe(2);
  });

  it("orders practice with the most repeated phrase first", () => {
    expect(practiceOrder(phrases).map((p) => p.index)).toEqual([1, 0, 2]);
  });
});

describe("recommendKeys", () => {
  // A melody from G#3 to G#4, like a low female lead.
  const melody = [56, 59, 61, 63, 64, 66, 68].map((midi, i) => note(i, midi, "la", 0, 1));
  const deepVoice = { speakingMidi: 45, comfortLow: 40, comfortHigh: 60 };

  it("sings a high melody an octave down for a deep voice", () => {
    const [best] = recommendKeys(melody, deepVoice);
    expect(best.octaveDrop).toBe(1);
    expect(best.highMidi).toBeLessThanOrEqual(deepVoice.comfortHigh - 3);
    expect(best.lowMidi).toBeGreaterThanOrEqual(deepVoice.comfortLow + 2);
    expect(best.inComfortPct).toBe(100);
  });

  it("leaves a melody that already fits where it is", () => {
    const fits = [45, 47, 48, 50, 52].map((midi, i) => note(i, midi, "la", 0, 1));
    expect(recommendKeys(fits, deepVoice)[0]).toMatchObject({ trackShift: 0, octaveDrop: 0 });
  });

  it("returns distinct choices, best first", () => {
    const choices = recommendKeys(melody, deepVoice, 3);
    expect(choices.length).toBe(3);
    expect(choices[0].cost).toBeLessThanOrEqual(choices[1].cost);
    expect(new Set(choices.map((c) => `${c.trackShift}/${c.octaveDrop}`)).size).toBe(3);
  });

  it("ignores notes that are not sung at pitch", () => {
    const rap: Note[] = [{ ...note(0, 90, "yo", 0), kind: "rap" }, ...melody];
    expect(recommendKeys(rap, deepVoice)[0]).toEqual(recommendKeys(melody, deepVoice)[0]);
  });

  it("computes the pitch to sing", () => {
    expect(targetMidi(68, { trackShift: 3, octaveDrop: 1 })).toBe(59);
  });
});
