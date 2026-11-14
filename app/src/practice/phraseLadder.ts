import type { NoteResult } from "../scoring/notes";

/** The seven steps every phrase climbs. See section 2.2 of the spec. */
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type StepInfo = {
  name: string;
  instruction: string;
  /** Playback speed; 0.8 for the slow steps. */
  rate: number;
  /** What the learner hears first: the original singer, the guide voice, or nothing. */
  call: "original" | "guide" | "none";
  /** Whether the learner then responds, and whether the response is scored. */
  respond: boolean;
  scored: boolean;
  /** What is drawn: the original's curve, the learner's line live, afterwards, or never. */
  display: "original" | "live" | "after" | "blind";
  /** Repetitions needed to move on (clean ones, for scored steps). */
  needed: number;
};

export const STEPS: Record<Step, StepInfo> = {
  1: {
    name: "Listen",
    instruction: "Listen to the original and follow the line.",
    rate: 1,
    call: "original",
    respond: false,
    scored: false,
    display: "original",
    needed: 2,
  },
  2: {
    name: "Speak",
    instruction: "Speak the words in rhythm with the track.",
    rate: 0.8,
    call: "none",
    respond: true,
    scored: false,
    display: "blind",
    needed: 2,
  },
  3: {
    name: "Melody",
    instruction: "Sing it back on “doo”, slowly.",
    rate: 0.8,
    call: "guide",
    respond: true,
    scored: true,
    display: "live",
    needed: 2,
  },
  4: {
    name: "Words, slow",
    instruction: "Sing it back with the words, slowly.",
    rate: 0.8,
    call: "guide",
    respond: true,
    scored: true,
    display: "live",
    needed: 2,
  },
  5: {
    name: "Words, full speed",
    instruction: "Sing it back with the words.",
    rate: 1,
    call: "guide",
    respond: true,
    scored: true,
    display: "live",
    needed: 2,
  },
  6: {
    name: "Hidden",
    instruction: "Sing it back. Your line appears afterwards.",
    rate: 1,
    call: "guide",
    respond: true,
    scored: true,
    display: "after",
    needed: 2,
  },
  7: {
    name: "Blind",
    instruction: "Sing it straight, with nothing to follow.",
    rate: 1,
    call: "none",
    respond: true,
    scored: true,
    display: "blind",
    needed: 3,
  },
};

export type PhraseState = "new" | "learning" | "clean" | "solid";

/** One phrase group's progress. `cleanDays` are the calendar days on which the blind step was passed. */
export type PhraseProgress = {
  songId: string;
  group: number;
  step: Step;
  /** Repetitions in a row that counted toward the current step. */
  streak: number;
  cleanDays: string[];
  /** For each note id, how many repetitions in a row it has been off. */
  missed: Record<number, number>;
  /** Notes a micro-drill could not fix; tomorrow's first targets. */
  sticky: number[];
  lastPracticed: string | null;
};

export const newProgress = (songId: string, group: number): PhraseProgress => ({
  songId,
  group,
  step: 1,
  streak: 0,
  cleanDays: [],
  missed: {},
  sticky: [],
  lastPracticed: null,
});

/** `solid` needs the blind step passed on three different days: one good day is not yet learned. */
export function stateOf(progress: PhraseProgress): PhraseState {
  if (progress.cleanDays.length >= 3) return "solid";
  if (progress.cleanDays.length >= 1) return "clean";
  return progress.lastPracticed === null ? "new" : "learning";
}

/**
 * Whether a repetition counts as clean: at least 90% of scored notes in tune,
 * no miss on a note of 300 ms or longer, and nothing in the wrong octave.
 * Null when over 40% of the notes were not heard, so the repetition is not counted.
 */
export function isCleanRep(results: NoteResult[], durations: number[]): boolean | null {
  const scored = results.filter((r) => r.outcome !== "unscored");
  if (results.length === 0 || scored.length / results.length < 0.6) return null;
  if (scored.some((r) => r.outcome === "octave")) return false;
  if (results.some((r, i) => r.outcome === "miss" && durations[i] >= 0.3)) return false;
  return scored.filter((r) => r.outcome === "hit").length / scored.length >= 0.9;
}

export type Advance = {
  progress: PhraseProgress;
  event: "stepUp" | "clean" | "solid" | null;
  /** A note that has now been off twice running, to be drilled on its own before continuing. */
  drillNoteId: number | null;
};

/** Applies one repetition to a phrase's progress. `clean` is ignored for steps that are not scored. */
export function advance(
  progress: PhraseProgress,
  rep: { clean: boolean | null; results: NoteResult[]; today: string },
): Advance {
  const info = STEPS[progress.step];
  const next: PhraseProgress = { ...progress, missed: { ...progress.missed }, lastPracticed: rep.today };

  if (!info.scored) {
    next.streak++;
    if (next.streak < info.needed) return { progress: next, event: null, drillNoteId: null };
    next.step = (progress.step + 1) as Step;
    next.streak = 0;
    return { progress: next, event: "stepUp", drillNoteId: null };
  }
  if (rep.clean === null) return { progress: next, event: null, drillNoteId: null };

  let drillNoteId: number | null = null;
  for (const result of rep.results) {
    if (result.outcome === "unscored") continue;
    next.missed[result.id] = result.outcome === "hit" ? 0 : (next.missed[result.id] ?? 0) + 1;
    if (drillNoteId === null && next.missed[result.id] >= 2) {
      drillNoteId = result.id;
      next.missed[result.id] = 0;
    }
  }

  if (!rep.clean) {
    next.streak = 0;
    return { progress: next, event: null, drillNoteId };
  }
  next.streak++;
  if (next.streak < info.needed) return { progress: next, event: null, drillNoteId };
  next.streak = 0;
  if (progress.step < 7) {
    next.step = (progress.step + 1) as Step;
    return { progress: next, event: "stepUp", drillNoteId };
  }
  if (next.cleanDays.includes(rep.today)) return { progress: next, event: "clean", drillNoteId };
  next.cleanDays = [...next.cleanDays, rep.today];
  next.sticky = [];
  return { progress: next, event: next.cleanDays.length >= 3 ? "solid" : "clean", drillNoteId };
}

export function markSticky(progress: PhraseProgress, noteId: number): PhraseProgress {
  return progress.sticky.includes(noteId) ? progress : { ...progress, sticky: [...progress.sticky, noteId] };
}
