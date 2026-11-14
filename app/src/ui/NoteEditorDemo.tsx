import { useState } from "react";
import { midiToHz } from "../dsp/music";
import type { F0, Note } from "../song/types";
import { NoteEditor } from "./NoteEditor";

const HOP_S = 0.01;
const DURATION_S = 30;

/** Five made-up lines: each syllable with the pitch it is sung on. */
const LINES: [string, number][][] = [
  [["When", 57], ["the", 60], ["tide", 62], ["comes", 64], ["in", 62], ["~", 60]],
  [["all", 60], ["the", 62], ["lan", 64], ["terns", 67], ["glow", 65], ["~", 64]],
  [["and", 64], ["I", 62], ["fol", 60], ["low", 62], ["them", 59], ["home", 57]],
  [["o", 57], ["ver", 60], ["the", 64], ["wa", 65], ["ter", 64], ["~", 62]],
  [["slow", 62], ["and", 60], ["low", 59], ["by", 57], ["the", 55], ["shore", 57]],
];

/** Repeatable values in [0, 1). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const wholeMs = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * A synthetic song: a sung pitch curve with slides, vibrato and breaks, and
 * the notes an import might make of it, with the usual mistakes left in.
 */
function makeSong(): { notes: Note[]; f0: F0 } {
  const random = seeded(11);
  const sung: Note[] = [];
  LINES.forEach((line, l) => {
    let t = 1.2 + l * 5.6;
    line.forEach(([text, midi], i) => {
      const id = sung.length;
      const d = i === line.length - 1 ? 1.1 : 0.3 + Math.round(random() * 4) * 0.08;
      const cents = Math.round((random() - 0.5) * 40);
      sung.push({ id, t: wholeMs(t), d: wholeMs(d), midi, cents, text, word: id, line: l, phrase: l, kind: "normal" });
      t += d + (random() < 0.3 ? 0.06 : 0);
    });
  });

  const hz = new Array<number>(Math.round(DURATION_S / HOP_S)).fill(0);
  sung.forEach((note, i) => {
    const previous = sung[i - 1];
    // Each note is reached by a slide: from the note before, or from below at the start of a line.
    const from = previous && previous.line === note.line ? previous.midi : note.midi - 1.5;
    // A consonant leaves a short break before the vowel.
    const first = Math.round(note.t / HOP_S) + (note.text === "~" ? 0 : 3);
    for (let k = first; k < Math.round((note.t + note.d) / HOP_S); k++) {
      const into = k * HOP_S - note.t;
      const slide = (from - note.midi) * Math.exp(-into / 0.035);
      // Vibrato comes in after a third of a second.
      const held = Math.max(0, into - 0.3);
      const vibrato = 0.3 * Math.min(1, held / 0.2) * Math.sin(2 * Math.PI * 5.5 * held);
      hz[k] = midiToHz(note.midi + note.cents / 100 + slide + vibrato);
    }
  });

  const notes = sung.map((note) => ({ ...note }));
  notes[8].midi += 12; // an octave error
  notes[15].midi -= 1; // a semitone flat
  notes[3].t = wholeMs(notes[3].t + 0.12); // a late start
  notes[3].d = wholeMs(notes[3].d - 0.12);
  notes[20].d = wholeMs(notes[20].d * 0.6); // cut short
  notes[1].kind = "rap";
  notes[25].kind = "free";
  // A long note cut in two by its vibrato.
  const long = notes[29];
  notes.push({ ...long, id: 30, t: wholeMs(long.t + 0.6), d: wholeMs(long.d - 0.6), midi: long.midi + 1, text: "~" });
  long.d = 0.6;
  // Two notes taken for one.
  notes[12].d = wholeMs(notes[13].t + notes[13].d - notes[12].t);
  notes.splice(13, 1);

  return { notes, f0: { hopS: HOP_S, hz, conf: hz.map((value) => (value > 0 ? 1 : 0)) } };
}

const SONG = makeSong();
/** "?fail" makes saving fail, to see the error. */
const failing = new URLSearchParams(location.search).has("fail");

/** The note editor on a synthetic song, for looking at. Not part of the app's routes. */
export function NoteEditorDemo() {
  const [message, setMessage] = useState("");

  async function save(notes: Note[]) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (failing) throw new Error("The demo was asked to fail.");
    setMessage(`Saved ${notes.length} notes.`);
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 pb-24 pt-8 sm:px-10">
      <NoteEditor
        notes={SONG.notes}
        f0={SONG.f0}
        durationS={DURATION_S}
        onSave={save}
        onAudition={(fromS, toS) => setMessage(`Would play ${fromS.toFixed(2)} to ${toS.toFixed(2)} seconds.`)}
      />
      <p data-testid="demo-message" className="mt-6 text-sm text-mist">
        {message}
      </p>
    </div>
  );
}
