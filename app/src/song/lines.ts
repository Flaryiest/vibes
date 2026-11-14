import type { Note } from "./types";

/** One lyric line as it is sung: its words, and the song time its notes span. */
export type SongLine = { t0: number; t1: number; text: string };

/**
 * The song's lyric lines, in order. Words and timing both come from the notes,
 * so the lines follow any corrections made in the note editor.
 */
export function songLines(notes: Note[]): SongLine[] {
  const byLine = new Map<number, Note[]>();
  for (const note of notes) {
    const list = byLine.get(note.line) ?? [];
    list.push(note);
    byLine.set(note.line, list);
  }
  return [...byLine.values()]
    .map((list) => ({
      t0: Math.min(...list.map((note) => note.t)),
      t1: Math.max(...list.map((note) => note.t + note.d)),
      text: list
        .map((note) => note.text.trim())
        .filter((text) => text !== "" && text !== "~")
        .join(" "),
    }))
    .filter((line) => line.text !== "")
    .sort((a, b) => a.t0 - b.t0);
}

/**
 * The line to show at song time `t`: the one being sung, or else the next one
 * to come, so it can be read before it starts. Null once the last line is over.
 */
export function lineAt(lines: SongLine[], t: number): { index: number; singing: boolean } | null {
  const index = lines.findIndex((line) => t < line.t1);
  return index < 0 ? null : { index, singing: t >= lines[index].t0 };
}
