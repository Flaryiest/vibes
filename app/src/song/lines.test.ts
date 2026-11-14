import { describe, expect, it } from "vitest";
import { lineAt, songLines } from "./lines";
import type { Note } from "./types";

let nextId = 0;
const note = (t: number, text: string, line: number, d = 0.4): Note => ({
  id: nextId++,
  t,
  d,
  midi: 45,
  cents: 0,
  text,
  word: 0,
  line,
  phrase: line,
  kind: "normal",
});

const notes = [
  note(2, "Oh", 0),
  note(2.5, "won't", 0),
  note(3, "you", 0),
  note(3.4, "~", 0),
  note(4, "kiss", 0, 1),
  note(8, "be", 1),
  note(8.5, "my", 1),
  note(9, "sail", 1),
  note(9.4, "or", 1, 0.8),
];

describe("songLines", () => {
  it("gives one line per lyric line, with its words and the time its notes span", () => {
    expect(songLines(notes)).toEqual([
      { t0: 2, t1: 5, text: "Oh won't you kiss" },
      { t0: 8, t1: 9.4 + 0.8, text: "be my sail or" },
    ]);
  });

  it("leaves out a line with no words", () => {
    expect(songLines([note(1, "~", 0), note(2, "la", 1)])).toEqual([{ t0: 2, t1: 2.4, text: "la" }]);
  });
});

describe("lineAt", () => {
  const lines = songLines(notes);

  it("shows the first line ahead of time, as one to come", () => {
    expect(lineAt(lines, 0)).toEqual({ index: 0, singing: false });
  });

  it("marks a line as being sung from its first note to its last", () => {
    expect(lineAt(lines, 2)).toEqual({ index: 0, singing: true });
    expect(lineAt(lines, 4.9)).toEqual({ index: 0, singing: true });
  });

  it("moves to the next line as soon as one ends", () => {
    expect(lineAt(lines, 5)).toEqual({ index: 1, singing: false });
    expect(lineAt(lines, 8.2)).toEqual({ index: 1, singing: true });
  });

  it("has nothing after the last line", () => {
    expect(lineAt(lines, 10.3)).toBeNull();
    expect(lineAt([], 1)).toBeNull();
  });
});
