import type { NoteResult } from "./notes";

const ORDINALS = ["First", "Second", "Third", "Fourth"];

function describeMiss(cents: number): string {
  const size = Math.abs(cents);
  if (size <= 100) return `a little ${cents < 0 ? "flat" : "sharp"}, by ${Math.round(size)} cents`;
  const semitones = Math.round(size / 100);
  return `too ${cents < 0 ? "low" : "high"} by about ${semitones} semitone${semitones === 1 ? "" : "s"}`;
}

/** One plain sentence about a repetition, leading with what matters most. */
export function describeResult(results: NoteResult[]): string {
  const scored = results.filter((r) => r.outcome !== "unscored");
  if (scored.length === 0) return "Didn't hear you. Sing a little louder and hold the note.";
  if (scored.length < results.length) return "Didn't catch every note. Hold each one for its full length.";

  const octave = scored.find((r) => r.outcome === "octave");
  if (octave) return `Right note, one octave too ${octave.cents! < 0 ? "low" : "high"}.`;

  const off = scored.filter((r) => r.outcome !== "hit");
  if (off.length === 0) {
    const worst = Math.max(...scored.map((r) => Math.abs(r.cents!)));
    if (worst <= 25) return "Right on it.";
    const mean = scored.reduce((sum, r) => sum + r.cents!, 0) / scored.length;
    if (Math.abs(mean) > 25) return `In tune, leaning ${mean < 0 ? "flat" : "sharp"}.`;
    return "In tune.";
  }

  const worst = off.reduce((a, b) => (Math.abs(b.cents!) > Math.abs(a.cents!) ? b : a));
  const text = describeMiss(worst.cents!);
  if (results.length === 1) return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  return `${ORDINALS[results.indexOf(worst)] ?? "One"} note ${text}.`;
}
