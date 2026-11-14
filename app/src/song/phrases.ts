import type { Note } from "./types";

/** A stretch of melody sung on one breath. Phrases with the same words and notes share a `group`. */
export type Phrase = {
  index: number;
  group: number;
  notes: Note[];
  t0: number;
  t1: number;
  text: string;
  /** How many phrases in the song share this phrase's group. */
  copies: number;
};

const wordsOf = (notes: Note[]): string =>
  notes
    .map((note) => note.text.trim())
    .filter((text) => text !== "" && text !== "~")
    .join(" ");

const normalize = (text: string): string => text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

function sameMelody(a: Note[], b: Note[]): boolean {
  return a.length === b.length && a.every((note, i) => Math.abs(note.midi - b[i].midi) <= 1);
}

/**
 * Splits a song's notes into phrases, and groups phrases that repeat (same
 * words, same notes within a semitone), so a chorus line is learned once.
 */
export function buildPhrases(notes: Note[]): Phrase[] {
  const byNumber = new Map<number, Note[]>();
  for (const note of notes) {
    const list = byNumber.get(note.phrase) ?? [];
    list.push(note);
    byNumber.set(note.phrase, list);
  }
  const phrases: Phrase[] = [...byNumber.values()]
    .sort((a, b) => a[0].t - b[0].t)
    .map((list, index) => {
      const last = list[list.length - 1];
      return { index, group: index, notes: list, t0: list[0].t, t1: last.t + last.d, text: wordsOf(list), copies: 1 };
    });

  for (const phrase of phrases) {
    const earlier = phrases.find(
      (other) =>
        other.index < phrase.index &&
        other.group === other.index &&
        normalize(other.text) === normalize(phrase.text) &&
        sameMelody(other.notes, phrase.notes),
    );
    if (earlier) phrase.group = earlier.group;
  }
  for (const phrase of phrases) phrase.copies = phrases.filter((other) => other.group === phrase.group).length;
  return phrases;
}

/**
 * One phrase per group, in the order to learn them: the most repeated first
 * (usually the chorus), then by where they first appear.
 */
export function practiceOrder(phrases: Phrase[]): Phrase[] {
  return phrases.filter((phrase) => phrase.group === phrase.index).sort((a, b) => b.copies - a.copies || a.index - b.index);
}
