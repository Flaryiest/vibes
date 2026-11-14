import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { hzToMidi, midiToName } from "../dsp/music";
import {
  MIN_NOTE_S,
  measuredPitch,
  mergeWithNext,
  moveEnd,
  moveNote,
  movePitch,
  moveStart,
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
  type EditHistory,
} from "../song/edit";
import type { F0, Note, NoteKind } from "../song/types";
import { buttonClass, headlineClass, inputClass, noteClass, quietButtonClass } from "./lab/styles";

export type NoteEditorProps = {
  /** The notes to correct. Read once, when the editor mounts: give the editor a `key` to load another song. */
  notes: Note[];
  f0: F0;
  durationS: number;
  /** Persists the corrected notes. The parent writes them to disk. */
  onSave: (notes: Note[]) => Promise<void>;
  /** Optional: asks the parent to play the original vocal for a span of the song. */
  onAudition?: (fromS: number, toS: number) => void;
};

const MIN_VISIBLE_S = 5;
const MAX_VISIBLE_S = 60;
const START_VISIBLE_S = 12;
/** Semitones shown beyond the highest and lowest note. */
const PITCH_MARGIN = 3;
/** The roll never shows fewer rows than this, so a narrow melody does not get huge bars. */
const MIN_ROWS = 18;

// The canvas, in CSS pixels: note names on the left, phrase numbers above the
// roll, the time scale under it, and the whole song in a strip at the bottom.
const GUTTER = 40;
const TOP = 20;
const RULER = 22;
const OVERVIEW = 30;

/** How close to an end of a bar the pointer must be to resize instead of move. */
const EDGE_PX = 6;
/** A dragged note keeps its timing until the pointer has gone this far sideways, so a pitch change leaves it alone. */
const TIME_SLOP_PX = 6;
const EDGE_SLOP_PX = 3;
/** Edits of one kind to one note that follow each other this closely are undone together. */
const FOLD_MS = 1000;
const FONT = '500 11px "Instrument Sans Variable", sans-serif';
/** The height a line of that text needs. */
const TEXT_PX = 12;

const KINDS: { kind: NoteKind; label: string }[] = [
  { kind: "normal", label: "Normal" },
  { kind: "rap", label: "Rap (timing only)" },
  { kind: "free", label: "Not scored" },
];

type Part = "body" | "start" | "end";

type Drag =
  | { kind: "note"; id: number; part: Part; from: Note[]; x: number; y: number; preview: Note[] | null }
  | { kind: "pan"; x: number; startS: number; moved: boolean }
  | { kind: "overview" };

/**
 * Everything the canvas draws from, and what the pointer and key handlers read.
 * It lives outside React state so that dragging, scrolling and zooming redraw
 * the canvas without rendering the component.
 */
type Model = {
  history: EditHistory;
  /** The notes on screen: the current step of the history, or a drag in progress. */
  notes: Note[];
  selectedId: number | null;
  /** Where the learner last clicked; `S` splits there. */
  playheadS: number | null;
  /** Left edge of the view and how much of the song it shows. */
  startS: number;
  visibleS: number;
  /** Lowest and highest pitch rows. */
  low: number;
  high: number;
  drag: Drag | null;
  /** The last recorded edit, if a similar one may still join it. */
  fold: { tag: string; at: number } | null;
  dirty: boolean;
};

type Geometry = ReturnType<typeof geometry>;
type Colors = { deep: string; rule: string; mist: string; chalk: string; brass: string };

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/** Zero inside `slop` pixels of where the drag began, and smooth from there on. */
const beyond = (pixels: number, slop: number) => (Math.abs(pixels) <= slop ? 0 : pixels - Math.sign(pixels) * slop);

const wholeMs = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** "1:05" or, with hundredths, "1:05.25". */
function clock(seconds: number, decimals = 0): string {
  const unit = 10 ** decimals;
  const total = Math.round(Math.max(0, seconds) * unit);
  const minutes = Math.floor(total / (60 * unit));
  const rest = (total - minutes * 60 * unit) / unit;
  return `${minutes}:${rest.toFixed(decimals).padStart(decimals > 0 ? decimals + 3 : 2, "0")}`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The pitch rows that hold every note with a margin. Once the roll is on
 * screen, rows are only added, and only when a note reaches the top or bottom
 * row, so the roll does not rescale with every small edit.
 */
function fitRows(notes: Note[], current: { low: number; high: number } | null): { low: number; high: number } {
  if (notes.length === 0) return current ?? { low: 48, high: 72 };
  let lowest = Infinity;
  let highest = -Infinity;
  for (const note of notes) {
    lowest = Math.min(lowest, note.midi);
    highest = Math.max(highest, note.midi);
  }
  if (current) {
    return {
      low: lowest <= current.low ? lowest - PITCH_MARGIN : current.low,
      high: highest >= current.high ? highest + PITCH_MARGIN : current.high,
    };
  }
  let low = lowest - PITCH_MARGIN;
  let high = highest + PITCH_MARGIN;
  const spare = MIN_ROWS - (high - low + 1);
  if (spare > 0) {
    low -= Math.floor(spare / 2);
    high += Math.ceil(spare / 2);
  }
  return { low, high };
}

function geometry(width: number, height: number, m: Model) {
  const rollW = Math.max(1, width - GUTTER);
  const rollH = Math.max(1, height - TOP - RULER - OVERVIEW);
  const pxPerS = rollW / m.visibleS;
  const rowH = rollH / (m.high - m.low + 1);
  return {
    width,
    height,
    rollW,
    rollH,
    pxPerS,
    rowH,
    x: (seconds: number) => GUTTER + (seconds - m.startS) * pxPerS,
    time: (x: number) => m.startS + (x - GUTTER) / pxPerS,
    /** The middle of a pitch's row. A bar reaches half a semitone either side. */
    y: (midi: number) => TOP + (m.high + 0.5 - midi) * rowH,
  };
}

/** The song's length, stretched if a note already runs past the end the editor was given. */
function songLengthOf(m: Model, durationS: number): number {
  const last = m.history.present[m.history.present.length - 1];
  return Math.max(durationS, last ? last.t + last.d : 0, 1);
}

function setView(m: Model, songS: number, startS: number, visibleS = m.visibleS) {
  // Never wider than the song itself, unless the song is shorter than the closest zoom.
  m.visibleS = clamp(visibleS, MIN_VISIBLE_S, clamp(songS, MIN_VISIBLE_S, MAX_VISIBLE_S));
  m.startS = clamp(startS, 0, Math.max(0, songS - m.visibleS));
  m.dirty = true;
}

/** Zooms by `factor`, keeping `anchorS` at the same place on screen. */
function zoomAround(m: Model, songS: number, anchorS: number, factor: number) {
  const fraction = (anchorS - m.startS) / m.visibleS;
  setView(m, songS, m.startS, m.visibleS * factor);
  setView(m, songS, anchorS - fraction * m.visibleS);
}

/** The note under a point of the roll, and whether the point is on its body or one of its ends. */
function hitTest(m: Model, geo: Geometry, px: number, py: number): { id: number; part: Part } | null {
  if (px < GUTTER || py < TOP || py > TOP + geo.rollH) return null;
  const test = (note: Note): Part | null => {
    if (Math.abs(py - geo.y(note.midi)) > geo.rowH / 2 + 1) return null;
    const left = geo.x(note.t);
    const right = Math.max(left + 2, geo.x(note.t + note.d));
    if (px < left - 2 || px > right + 2) return null;
    const edge = clamp((right - left) / 4, 2, EDGE_PX);
    return px < left + edge ? "start" : px > right - edge ? "end" : "body";
  };
  // The selected note is drawn on top, so it is tried first.
  const selected = m.selectedId === null ? undefined : m.notes[m.selectedId];
  const part = selected ? test(selected) : null;
  if (selected && part) return { id: selected.id, part };
  for (const note of m.notes) {
    const found = test(note);
    if (found) return { id: note.id, part: found };
  }
  return null;
}

function draw(
  g: CanvasRenderingContext2D,
  geo: Geometry,
  m: Model,
  f0: F0,
  songS: number,
  colors: Colors,
  fit: (text: string, room: number) => string,
) {
  const { width, height, rollW, rollH, rowH, x, y } = geo;
  const bottom = TOP + rollH;
  const endS = m.startS + m.visibleS;
  const hairline = (x0: number, y0: number, x1: number, y1: number) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };

  g.clearRect(0, 0, width, height);
  g.font = FONT;
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 1;

  // One hairline per semitone; the C lines are stronger and named.
  g.strokeStyle = colors.rule;
  g.fillStyle = colors.mist;
  g.textAlign = "right";
  for (let midi = m.low; midi <= m.high; midi++) {
    const isC = midi % 12 === 0;
    const py = Math.round(y(midi)) + 0.5;
    g.globalAlpha = isC ? 1 : 0.35;
    hairline(GUTTER, py, width, py);
    if (isC) g.fillText(midiToName(midi), GUTTER - 10, py);
  }
  g.globalAlpha = 1;

  // The time scale.
  const step = [0.5, 1, 2, 5, 10, 15, 30].find((s) => s * geo.pxPerS >= 72) ?? 60;
  hairline(GUTTER, Math.round(bottom) + 0.5, width, Math.round(bottom) + 0.5);
  g.textAlign = "center";
  for (let k = Math.ceil(m.startS / step); k * step <= endS; k++) {
    const px = Math.round(x(k * step)) + 0.5;
    hairline(px, bottom, px, bottom + 4);
    if (px < width - 14) g.fillText(clock(k * step, step < 1 ? 1 : 0), px, bottom + 14);
  }
  g.textAlign = "left";

  // Phrase numbers sit above the roll, each beside the line that starts its phrase.
  const phrases = phrasesOf(m.notes).filter((phrase) => phrase.startS >= m.startS && phrase.startS <= endS);
  for (const phrase of phrases) g.fillText(String(phrase.phrase + 1), Math.round(x(phrase.startS)) + 4, TOP / 2);

  g.save();
  g.beginPath();
  g.rect(GUTTER, 0, rollW, bottom);
  g.clip();

  g.strokeStyle = colors.chalk;
  g.globalAlpha = 0.3;
  for (const phrase of phrases) {
    const px = Math.round(x(phrase.startS)) + 0.5;
    hairline(px, 3, px, bottom);
  }

  // The original singer, broken wherever the voice stops.
  g.beginPath();
  g.rect(GUTTER, TOP, rollW, rollH);
  g.clip();
  if (f0.hopS > 0) {
    g.strokeStyle = colors.brass;
    g.globalAlpha = 1;
    g.lineWidth = 1.5;
    g.beginPath();
    const last = Math.min(f0.hz.length - 1, Math.ceil(endS / f0.hopS) + 1);
    let joined = false;
    for (let i = Math.max(0, Math.floor(m.startS / f0.hopS) - 1); i <= last; i++) {
      const hz = f0.hz[i];
      if (!(hz > 0)) {
        joined = false;
        continue;
      }
      if (joined) g.lineTo(x(i * f0.hopS), y(hzToMidi(hz)));
      else g.moveTo(x(i * f0.hopS), y(hzToMidi(hz)));
      joined = true;
    }
    g.stroke();
  }

  // The notes, each one semitone tall. The curve stays visible through them.
  g.strokeStyle = colors.chalk;
  g.fillStyle = colors.chalk;
  const bar = (note: Note) => {
    const selected = note.id === m.selectedId;
    const left = x(note.t);
    const barW = Math.max(2, x(note.t + note.d) - left);
    const top = y(note.midi + 0.5) + 1;
    const barH = Math.max(2, rowH - 1);
    const outline = (inset: number) => {
      g.beginPath();
      g.roundRect(left + inset, top + inset, Math.max(1, barW - 2 * inset), barH - 2 * inset, Math.min(3, barW / 2));
    };
    g.lineWidth = 1;
    if (note.kind === "normal") {
      outline(0);
      g.globalAlpha = selected ? 0.38 : 0.24;
      g.fill();
    } else if (note.kind === "rap") {
      // Scored for timing only: hatched.
      outline(0);
      g.globalAlpha = 0.1;
      g.fill();
      g.save();
      g.clip();
      g.globalAlpha = selected ? 0.6 : 0.42;
      g.beginPath();
      for (let hx = left - barH; hx < left + barW; hx += 5) {
        g.moveTo(hx, top + barH);
        g.lineTo(hx + barH, top);
      }
      g.stroke();
      g.restore();
    } else if (!selected) {
      // Not scored: hollow.
      outline(0.5);
      g.globalAlpha = 0.6;
      g.stroke();
    }
    if (selected) {
      outline(1);
      g.globalAlpha = 1;
      g.lineWidth = 2;
      g.stroke();
    }
    // The syllable may run past a short bar, as far as the next note that it would collide with.
    let room = width;
    for (let k = note.id + 1; k < m.notes.length && m.notes[k].t <= endS; k++) {
      if (Math.abs(m.notes[k].midi - note.midi) * rowH < TEXT_PX) {
        room = x(m.notes[k].t);
        break;
      }
    }
    const textX = Math.max(left, GUTTER) + 5;
    const label = fit(note.text, room - textX - 3);
    if (label) {
      // A dark edge keeps the letters clear of the singer's line running through the bar.
      g.strokeStyle = colors.deep;
      g.globalAlpha = 0.55;
      g.lineWidth = 3;
      g.strokeText(label, textX, y(note.midi) + 0.5);
      g.strokeStyle = colors.chalk;
      g.globalAlpha = selected ? 1 : 0.92;
      g.fillText(label, textX, y(note.midi) + 0.5);
    }
  };
  let selected: Note | undefined;
  for (const note of m.notes) {
    if (note.t + note.d < m.startS || note.t > endS) continue;
    if (note.id === m.selectedId) selected = note;
    else bar(note);
  }
  if (selected) bar(selected);

  if (m.playheadS !== null) {
    const px = Math.round(x(m.playheadS)) + 0.5;
    g.globalAlpha = 0.7;
    g.lineWidth = 1;
    hairline(px, TOP, px, bottom);
  }
  g.restore();

  // The whole song, with the part on screen marked.
  const stripTop = height - OVERVIEW + 8;
  const stripH = OVERVIEW - 8;
  const across = (seconds: number) => GUTTER + (seconds / songS) * rollW;
  g.fillStyle = colors.chalk;
  g.globalAlpha = 0.12;
  g.beginPath();
  g.roundRect(across(m.startS), stripTop, Math.max(4, across(endS) - across(m.startS)), stripH, 3);
  g.fill();
  for (const note of m.notes) {
    const py = stripTop + 3 + (1 - (note.midi - m.low) / (m.high - m.low)) * (stripH - 8);
    g.globalAlpha = note.id === m.selectedId ? 1 : 0.55;
    g.fillRect(across(note.t), py, Math.max(1, across(note.t + note.d) - across(note.t)), 2);
  }
  g.globalAlpha = 1;
}

/**
 * A secondary action. Clicking it with the mouse leaves the keyboard focus
 * where it was, so the piano roll's keys keep working after a click.
 */
function Action(props: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
      disabled={props.disabled}
      className={quietButtonClass}
    >
      {props.children}
    </button>
  );
}

/**
 * The note editor: a piano roll for correcting the notes that the import found
 * in a song, drawn over the original singer's pitch.
 */
export function NoteEditor({ notes, f0, durationS, onSave, onAudition }: NoteEditorProps) {
  const [history, setHistory] = useState(() => startHistory(notes));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saved, setSaved] = useState(history.present);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const helpId = useId();

  const modelRef = useRef<Model | null>(null);
  modelRef.current ??= {
    history,
    notes: history.present,
    selectedId: null,
    playheadS: null,
    // Open on the first note, not on the introduction before anyone sings.
    startS: Math.max(0, (history.present[0]?.t ?? 0) - 1),
    visibleS: START_VISIBLE_S,
    ...fitRows(history.present, null),
    drag: null,
    fold: null,
    dirty: true,
  };
  const model = modelRef.current;

  // The latest props, for the drawing loop and the handlers. The view is kept inside the song they describe.
  const song = useRef({ f0, durationS });
  useEffect(() => {
    song.current = { f0, durationS };
    setView(model, songLengthOf(model, durationS), model.startS);
  }, [f0, durationS, model]);

  const present = history.present;
  const note = selectedId === null ? undefined : present[selectedId];
  const dirty = !sameNotes(present, saved);

  const songLength = () => songLengthOf(model, song.current.durationS);

  function selectedNote(): Note | undefined {
    return model.selectedId === null ? undefined : model.history.present[model.selectedId];
  }

  /** Limits a move or a stretch to the right so that the note stays inside the song. */
  function withinSong(target: Note, deltaS: number): number {
    return Math.min(deltaS, Math.max(0, songLength() - (target.t + target.d)));
  }

  function show(next: EditHistory) {
    model.history = next;
    model.notes = next.present;
    Object.assign(model, fitRows(next.present, model));
    model.dirty = true;
    setHistory(next);
  }

  function select(id: number | null, reveal = false) {
    model.selectedId = id;
    model.dirty = true;
    setSelectedId(id);
    setNotice("");
    const target = id === null ? undefined : model.notes[id];
    const outOfView = target && (target.t < model.startS || target.t + target.d > model.startS + model.visibleS);
    if (reveal && outOfView) setView(model, songLength(), target.t - model.visibleS / 4);
  }

  /**
   * Records an edit and selects a note. Edits that share a tag and follow each
   * other closely become one step to undo. Returns whether anything changed.
   */
  function edit(next: Note[], selected: number | null, tag = ""): boolean {
    // A key pressed in the middle of a drag wins, and the drag is dropped.
    if (model.drag) cancelDrag();
    const before = model.history;
    const now = performance.now();
    const fold = tag !== "" && model.fold?.tag === tag && now - model.fold.at < FOLD_MS;
    const after = pushEdit(before, next, fold);
    if (after !== before) {
      // A folded step that came back to where it began was dropped, so there is nothing left to join.
      model.fold = tag === "" || after.past.length < before.past.length ? null : { tag, at: now };
      show(after);
    }
    select(selected, true);
    return after !== before;
  }

  /** Undo or redo, then select the first note that the step changed. */
  function travel(step: (history: EditHistory) => EditHistory) {
    if (model.drag) cancelDrag();
    const before = model.history;
    const after = step(before);
    if (after === before) return;
    model.fold = null;
    show(after);
    const changed = after.present.findIndex((item, i) => item !== before.present[i]);
    const at = changed < 0 ? after.present.length - 1 : changed;
    select(after.present.length === 0 ? null : clamp(at, 0, after.present.length - 1), true);
  }
  const undo = () => travel(undoEdit);
  const redo = () => travel(redoEdit);

  /** Splits the selected note: at `atS` if given, else at the playhead, else in the middle. */
  function split(atS?: number) {
    const target = selectedNote();
    if (!target) return;
    const earliest = target.t + MIN_NOTE_S;
    const latest = target.t + target.d - MIN_NOTE_S;
    // The playhead counts only when it is properly inside the note: after a split it sits on the new boundary.
    const playhead = model.playheadS;
    const inside = playhead !== null && playhead >= earliest && playhead <= latest;
    const at = atS !== undefined ? clamp(atS, earliest, latest) : inside ? playhead : target.t + target.d / 2;
    const changed = edit(splitNote(model.history.present, target.id, at), target.id);
    if (!changed) setNotice("That note is too short to split.");
  }

  function merge() {
    const target = selectedNote();
    if (target) edit(mergeWithNext(model.history.present, target.id), target.id);
  }

  function remove() {
    const target = selectedNote();
    if (!target) return;
    const next = removeNote(model.history.present, target.id);
    edit(next, next.length === 0 ? null : Math.min(target.id, next.length - 1));
  }

  function changePitch(semitones: number) {
    const target = selectedNote();
    if (target) edit(movePitch(model.history.present, target.id, semitones), target.id, `pitch:${target.id}`);
  }

  function changeOctave(direction: 1 | -1) {
    const target = selectedNote();
    if (target) edit(shiftOctave(model.history.present, target.id, direction), target.id, `pitch:${target.id}`);
  }

  function nudge(deltaS: number) {
    const target = selectedNote();
    if (!target) return;
    edit(moveNote(model.history.present, target.id, withinSong(target, deltaS)), target.id, `time:${target.id}`);
  }

  function snap() {
    const target = selectedNote();
    if (!target) return;
    const measured = measuredPitch(target, song.current.f0);
    if (!measured) {
      setNotice("Too little of that note is sung to measure its pitch.");
    } else if (!edit(snapToMeasuredPitch(model.history.present, target.id, song.current.f0), target.id)) {
      setNotice("That note is already on the measured pitch.");
    }
  }

  function togglePhraseBreak() {
    const target = selectedNote();
    if (!target) return;
    if (!edit(togglePhraseBreakBefore(model.history.present, target.id), target.id)) {
      setNotice("The first note always starts a phrase.");
    }
  }

  function audition() {
    const target = selectedNote();
    const phrase = target && phrasesOf(model.history.present).find((item) => item.phrase === target.phrase);
    if (phrase) onAudition?.(phrase.startS, phrase.endS);
  }

  function zoom(factor: number) {
    const target = selectedNote();
    const inView = target && target.t + target.d > model.startS && target.t < model.startS + model.visibleS;
    zoomAround(model, songLength(), inView ? target.t + target.d / 2 : model.startS + model.visibleS / 2, factor);
  }

  function selectFirstInView() {
    const first = model.notes.find((item) => item.t + item.d > model.startS) ?? model.notes[model.notes.length - 1];
    if (first) select(first.id, true);
  }

  async function save() {
    const snapshot = model.history.present;
    model.fold = null;
    setSaveState("saving");
    try {
      // A copy, so that nothing the parent does to it can reach the history.
      await onSave(snapshot.map((item) => ({ ...item })));
      setSaved(snapshot);
      setSaveState("saved");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      setSaveState("failed");
    }
  }

  // Leaving the page with unsaved corrections asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // The canvas: sized to the device's pixels and redrawn on an animation frame whenever the model has changed.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext("2d")!;
    const token = (name: string) => getComputedStyle(canvas).getPropertyValue(name).trim();
    const colors: Colors = {
      deep: token("--color-deep"),
      rule: token("--color-rule"),
      mist: token("--color-mist"),
      chalk: token("--color-chalk"),
      brass: token("--color-brass"),
    };

    // Shortens a syllable to fit, remembering the width of every string it has measured.
    const widths = new Map<string, number>();
    const widthOf = (text: string) => {
      let width = widths.get(text);
      if (width === undefined) {
        width = g.measureText(text).width;
        widths.set(text, width);
      }
      return width;
    };
    const fit = (text: string, room: number) => {
      if (widthOf(text) <= room) return text;
      for (let length = text.length - 1; length > 0; length--) {
        const shortened = `${text.slice(0, length)}…`;
        if (widthOf(shortened) <= room) return shortened;
      }
      return "";
    };

    let ratio = 0;
    const resize = () => {
      ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
      model.dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Text measured before the font arrived was measured in the fallback font.
    let alive = true;
    void document.fonts.ready.then(() => {
      if (!alive) return;
      widths.clear();
      model.dirty = true;
    });

    const length = () => songLengthOf(model, song.current.durationS);

    // Sideways scrolling moves through the song; pinching, or scrolling with ctrl or cmd held, zooms.
    const onWheel = (event: WheelEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const geo = geometry(bounds.width, bounds.height, model);
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        // One notch of a mouse wheel is a far bigger number than one step of a pinch, so it is capped.
        const factor = Math.exp(clamp(event.deltaY, -50, 50) * 0.01);
        zoomAround(model, length(), geo.time(event.clientX - bounds.left), factor);
        return;
      }
      const mostlySideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const sideways = mostlySideways ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (sideways === 0) return;
      event.preventDefault();
      setView(model, length(), model.startS + sideways / geo.pxPerS);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    let animation = 0;
    const frame = () => {
      if ((window.devicePixelRatio || 1) !== ratio) resize();
      if (model.dirty) {
        model.dirty = false;
        g.setTransform(ratio, 0, 0, ratio, 0, 0);
        const geo = geometry(canvas.width / ratio, canvas.height / ratio, model);
        draw(g, geo, model, song.current.f0, length(), colors, fit);
      }
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);

    return () => {
      alive = false;
      observer.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(animation);
    };
  }, [model]);

  /** Where a pointer event is on the canvas, with the geometry to interpret it. */
  function locate(event: { clientX: number; clientY: number }) {
    const bounds = canvasRef.current!.getBoundingClientRect();
    const geo = geometry(bounds.width, bounds.height, model);
    return { px: event.clientX - bounds.left, py: event.clientY - bounds.top, geo };
  }

  const inOverview = (at: ReturnType<typeof locate>) => at.py >= at.geo.height - OVERVIEW;

  /** Centers the view on a point of the overview strip. */
  function scrub(at: ReturnType<typeof locate>) {
    const seconds = ((at.px - GUTTER) / at.geo.rollW) * songLength();
    setView(model, songLength(), seconds - model.visibleS / 2);
  }

  function placePlayhead(at: ReturnType<typeof locate>) {
    if (at.px >= GUTTER) model.playheadS = clamp(at.geo.time(at.px), 0, songLength());
    model.dirty = true;
  }

  function cancelDrag() {
    model.drag = null;
    model.notes = model.history.present;
    model.dirty = true;
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    const at = locate(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (inOverview(at)) {
      model.drag = { kind: "overview" };
      scrub(at);
      return;
    }
    const target = hitTest(model, at.geo, at.px, at.py);
    if (target) {
      select(target.id);
      model.drag = { kind: "note", ...target, from: model.history.present, x: at.px, y: at.py, preview: null };
    } else {
      model.drag = { kind: "pan", x: at.px, startS: model.startS, moved: false };
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const at = locate(event);
    const drag = model.drag;
    if (!drag) {
      const target = inOverview(at) ? null : hitTest(model, at.geo, at.px, at.py);
      event.currentTarget.style.cursor = inOverview(at)
        ? "pointer"
        : !target
          ? "default"
          : target.part === "body"
            ? "move"
            : "ew-resize";
      return;
    }
    if (drag.kind === "overview") {
      scrub(at);
    } else if (drag.kind === "pan") {
      const dx = at.px - drag.x;
      drag.moved ||= Math.abs(dx) > 3;
      if (drag.moved) setView(model, songLength(), drag.startS - dx / at.geo.pxPerS);
    } else {
      const target = drag.from[drag.id];
      const dx = at.px - drag.x;
      if (drag.part === "body") {
        // Pitch moves in whole semitones and stays on the roll.
        const pitch = clamp(target.midi + Math.round((drag.y - at.py) / at.geo.rowH), model.low, model.high);
        const deltaS = withinSong(target, wholeMs(beyond(dx, TIME_SLOP_PX) / at.geo.pxPerS));
        drag.preview = moveNote(movePitch(drag.from, drag.id, pitch - target.midi), drag.id, deltaS);
      } else {
        const deltaS = wholeMs(beyond(dx, EDGE_SLOP_PX) / at.geo.pxPerS);
        drag.preview =
          drag.part === "start"
            ? moveStart(drag.from, drag.id, deltaS)
            : moveEnd(drag.from, drag.id, withinSong(target, deltaS));
      }
      model.notes = drag.preview;
      model.dirty = true;
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = model.drag;
    model.drag = null;
    if (!drag) return;
    const at = locate(event);
    if (drag.kind === "note") {
      model.notes = model.history.present;
      // A press that moved nothing is a click: it places the playhead.
      if (drag.preview && !sameNotes(drag.preview, drag.from)) edit(drag.preview, drag.id);
      else placePlayhead(at);
    } else if (drag.kind === "pan" && !drag.moved) {
      select(null);
      placePlayhead(at);
    }
    model.dirty = true;
  }

  function onDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const at = locate(event);
    const target = hitTest(model, at.geo, at.px, at.py);
    if (!target) return;
    select(target.id);
    split(at.geo.time(at.px));
  }

  function onCanvasKeyDown(event: React.KeyboardEvent<HTMLCanvasElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = selectedNote();
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === "Tab") {
      // Past the last note, or before the first, Tab leaves the roll as usual.
      const next = target && model.history.present[target.id + (event.shiftKey ? -1 : 1)];
      if (!next) return;
      event.preventDefault();
      select(next.id, true);
      return;
    }
    if (key === "Escape") {
      if (model.drag) cancelDrag();
      else select(null);
      return;
    }
    if (!target) {
      if (key.startsWith("Arrow") || key === "Enter") selectFirstInView();
      if (key.startsWith("Arrow") || key === "Enter" || key === " ") event.preventDefault();
      return;
    }
    if (key === "ArrowUp" || key === "ArrowDown") {
      const direction = key === "ArrowUp" ? 1 : -1;
      if (event.shiftKey) changeOctave(direction);
      else changePitch(direction);
    } else if (key === "ArrowLeft" || key === "ArrowRight") {
      nudge((key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 0.1 : 0.01));
    } else if (key === "s") split();
    else if (key === "m") merge();
    else if (key === "Backspace" || key === "Delete") remove();
    else if (key === "p") togglePhraseBreak();
    else if (key === "f") snap();
    else if (key === " ") audition();
    else if (key === "Enter") {
      textRef.current?.focus();
      textRef.current?.select();
    } else return;
    event.preventDefault();
  }

  /** Undo and redo work wherever the focus is inside the editor. */
  function onEditorKeyDown(event: React.KeyboardEvent) {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (key === "y" && event.ctrlKey) {
      event.preventDefault();
      redo();
    }
  }

  const startsPhrase = note !== undefined && note.id > 0 && present[note.id - 1].phrase !== note.phrase;
  const span = note && `${clock(note.t, 2)} to ${clock(note.t + note.d, 2)}`;
  const summary = note
    ? `Note ${note.id + 1} of ${present.length}: ${midiToName(note.midi)}, ${span}, phrase ${note.phrase + 1}.`
    : present.length === 0
      ? "There are no notes."
      : "No note selected.";

  return (
    <div className="pt-12" onKeyDown={onEditorKeyDown}>
      <p data-testid="note-count" className="text-sm tabular-nums text-mist">
        {plural(present.length, "note")} in {plural(phrasesOf(present).length, "phrase")}
      </p>
      <h1 className={`mt-3 ${headlineClass}`}>Correct the notes.</h1>
      <p id={`${helpId}-pointer`} className={`mt-3 ${noteClass}`}>
        The brass line is the original singer. Each note should sit on it and carry the right syllable. Drag a note to
        move it, drag one of its ends to resize it, and double-click to split it.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" onClick={save} disabled={saveState === "saving"} className={buttonClass}>
          Save notes
        </button>
        <p role="status" data-testid="save-status" className="text-sm">
          {saveState === "saving" ? (
            <span className="text-mist">Saving</span>
          ) : saveState === "failed" ? (
            <span className="text-signal">Not saved. {problem}</span>
          ) : dirty ? (
            "Unsaved changes"
          ) : saveState === "saved" ? (
            <span className="text-mist">Saved</span>
          ) : null}
        </p>
        <div className="ml-auto flex gap-5">
          <Action onClick={undo} disabled={history.past.length === 0}>
            Undo
          </Action>
          <Action onClick={redo} disabled={history.future.length === 0}>
            Redo
          </Action>
        </div>
      </div>

      <div role="group" aria-label="Selected note" className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
        <Action onClick={() => split()} disabled={!note}>
          Split
        </Action>
        <Action onClick={merge} disabled={!note || note.id === present.length - 1}>
          Merge with next
        </Action>
        <Action onClick={remove} disabled={!note}>
          Remove
        </Action>
        <Action onClick={() => changeOctave(1)} disabled={!note}>
          Octave up
        </Action>
        <Action onClick={() => changeOctave(-1)} disabled={!note}>
          Octave down
        </Action>
        <Action onClick={snap} disabled={!note}>
          Snap to pitch
        </Action>
        <Action onClick={togglePhraseBreak} disabled={!note || note.id === 0}>
          {startsPhrase ? "Join previous phrase" : "Start phrase here"}
        </Action>
        {onAudition && (
          <Action onClick={audition} disabled={!note}>
            Play phrase
          </Action>
        )}
      </div>

      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="Piano roll"
        aria-describedby={`${helpId}-pointer ${helpId}-keys`}
        data-testid="piano-roll"
        className="mt-4 block h-[30rem] w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelDrag}
        onDoubleClick={onDoubleClick}
        onKeyDown={onCanvasKeyDown}
        onFocus={(event) => {
          // Arriving by keyboard lands on a note, so the keys have something to act on.
          if (model.selectedId === null && event.currentTarget.matches(":focus-visible")) selectFirstInView();
        }}
      />

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <p aria-live="polite" data-testid="note-summary" className="text-sm tabular-nums text-mist">
          {notice || summary}
        </p>
        <div className="ml-auto flex gap-5">
          <Action onClick={() => zoom(1.5)}>Zoom out</Action>
          <Action onClick={() => zoom(1 / 1.5)}>Zoom in</Action>
        </div>
      </div>

      <form
        className="mt-6 flex flex-wrap items-start gap-x-10 gap-y-4 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          canvasRef.current?.focus();
        }}
      >
        <label className={note ? "block" : "block opacity-40"}>
          <span className="text-mist">Syllable</span>
          <input
            ref={textRef}
            value={note?.text ?? ""}
            disabled={!note}
            onChange={(event) => {
              if (note) edit(setText(model.history.present, note.id, event.target.value), note.id, `text:${note.id}`);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") canvasRef.current?.focus();
            }}
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} mt-1.5 block w-40`}
          />
        </label>
        <fieldset disabled={!note} className="disabled:opacity-40">
          <legend className="text-mist">Kind</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-2 py-1.5">
            {KINDS.map(({ kind, label }) => (
              <label key={kind} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="note-kind"
                  checked={note?.kind === kind}
                  onChange={() => {
                    if (note) edit(setKind(model.history.present, note.id, kind), note.id);
                  }}
                  className="accent-chalk"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </form>

      <p id={`${helpId}-keys`} className={`mt-8 ${noteClass}`}>
        With the piano roll focused, the arrow keys move the selected note by a semitone or 10 ms, and with shift by an
        octave or 100 ms. S splits where you last clicked, M merges with the next note, P starts or joins a phrase, F
        snaps to the sung pitch and Delete removes. Tab goes to the next note, Enter edits the syllable
        {onAudition ? ", space plays the phrase" : ""} and Escape clears the selection. Scroll sideways, or drag the
        strip under the roll, to move through the song.
      </p>
    </div>
  );
}
