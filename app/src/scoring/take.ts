import { LONG_NOTE_S, type NoteResult } from "./notes";

/** What a whole take amounts to. A measure is null when the take gave nothing to compute it from. */
export type TakeMetrics = {
  /** Notes heard well enough to judge, out of `totalNotes`. */
  scoredNotes: number;
  totalNotes: number;
  /** Share of the scored notes that were within 50 cents, 0 to 100. */
  pctInTune: number | null;
  /** Average size of the error on a note. */
  meanAbsCents: number | null;
  /** Average error with its sign. Negative means the take leaned flat. */
  biasCents: number | null;
  /** Average difference between a sung jump and the written one, over neighbouring scored notes. */
  intervalErrorCents: number | null;
  /** Average wander within the notes of 0.6 seconds or longer. */
  steadinessCents: number | null;
  /** Average end drift of those notes. Negative means they sag. */
  endDriftCents: number | null;
  /** Share of the note starts that were heard which came within 80 ms of the written start, 0 to 100. */
  onTimePct: number | null;
};

/** What a take has to reach to count as ready to perform. See section 2.5 of the spec. */
export const TAKE_TARGETS = {
  pctInTune: 90,
  meanAbsCents: 30,
  biasCents: 20,
  intervalErrorCents: 30,
  steadinessCents: 25,
  endSagCents: 30,
  onTimePct: 80,
};

/** A note start this close to the written one is on time. */
const ON_TIME_MS = 80;

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Sums a take up from its notes. `targets` are the notes that were to be sung,
 * in order; a result belongs to the target with the same id.
 */
export function summarizeTake(results: NoteResult[], targets: { id: number; midi: number; d: number }[]): TakeMetrics {
  const byId = new Map(results.map((result) => [result.id, result]));
  // Each target with what was sung for it; `cents` is null where the note was not scored.
  const notes = targets.map((target) => {
    const result = byId.get(target.id);
    const scored = result !== undefined && result.outcome !== "unscored" && result.cents !== null;
    return { target, result, cents: scored ? result.cents : null };
  });
  const errors = notes.flatMap((note) => (note.cents === null ? [] : [note.cents]));
  const hits = notes.filter((note) => note.cents !== null && note.result!.outcome === "hit").length;

  // A jump is judged only between two neighbouring notes that were both scored.
  const jumps: number[] = [];
  for (let i = 1; i < notes.length; i++) {
    const from = notes[i - 1];
    const to = notes[i];
    if (from.cents === null || to.cents === null) continue;
    const written = 100 * (to.target.midi - from.target.midi);
    const sung = written + to.cents - from.cents;
    jumps.push(Math.abs(sung - written));
  }

  const long = notes.filter((note) => note.cents !== null && note.target.d >= LONG_NOTE_S);
  const numbers = (values: (number | null | undefined)[]): number[] =>
    values.filter((value): value is number => typeof value === "number");
  const onsets = numbers(notes.map((note) => note.result?.onsetMs));

  return {
    scoredNotes: errors.length,
    totalNotes: targets.length,
    pctInTune: errors.length === 0 ? null : (100 * hits) / errors.length,
    meanAbsCents: mean(errors.map(Math.abs)),
    biasCents: mean(errors),
    intervalErrorCents: mean(jumps),
    steadinessCents: mean(numbers(long.map((note) => note.result!.spreadCents))),
    endDriftCents: mean(numbers(long.map((note) => note.result!.endDriftCents))),
    onTimePct:
      onsets.length === 0 ? null : (100 * onsets.filter((ms) => Math.abs(ms) <= ON_TIME_MS).length) / onsets.length,
  };
}

/**
 * False when under 60% of the notes were scored, which is too little to judge
 * the take by. Whole numbers are compared, so the boundary is exact.
 */
export const heardEnough = (take: { scoredNotes: number; totalNotes: number }): boolean =>
  take.totalNotes > 0 && take.scoredNotes * 5 >= take.totalNotes * 3;

/** True when the take as a whole sat an octave away from the written notes. */
const inWrongOctave = (biasCents: number): boolean => Math.abs(Math.abs(biasCents) - 1200) <= 100;

function describeLean(biasCents: number): string {
  const size = Math.abs(biasCents);
  if (inWrongOctave(biasCents)) return `Right notes, one octave too ${biasCents < 0 ? "low" : "high"}.`;
  if (size > 150) {
    return `Most of this sat about ${Math.round(size / 100)} semitones too ${biasCents < 0 ? "low" : "high"}.`;
  }
  return `Most of this sat about ${Math.round(size / 5) * 5} cents ${biasCents < 0 ? "flat" : "sharp"}.`;
}

/**
 * A take in two short sentences, by fixed rules: what went best, then the one
 * correction most worth making. A take that meets every target is told so, and
 * one that was mostly not heard is told only that.
 */
export function describeTake(metrics: TakeMetrics): string {
  const { pctInTune, meanAbsCents, biasCents, intervalErrorCents, steadinessCents, endDriftCents, onTimePct } = metrics;
  if (!heardEnough(metrics) || pctInTune === null || meanAbsCents === null || biasCents === null) {
    return "Too little of this was heard to judge.";
  }

  const target = TAKE_TARGETS;
  // How far inside its target a measure is: 1 is perfect, 0 only just met, below 0 missed. Null when not measured.
  const under = (value: number | null, limit: number) => (value === null ? null : (limit - value) / limit);
  const over = (value: number | null, limit: number) => (value === null ? null : (value - limit) / (100 - limit));
  // Only a sagging end misses the target. An end that rises meets it, but is not praised as held.
  const endings =
    endDriftCents === null || endDriftCents < -target.endSagCents
      ? under(endDriftCents === null ? null : -endDriftCents, target.endSagCents)
      : Math.max(0, (target.endSagCents - Math.abs(endDriftCents)) / target.endSagCents);

  // In the order the corrections are worth making: pitch first, then how notes are held, then timing.
  const checks: { margin: number | null; praise: string | null; fix: string }[] = [
    { margin: under(Math.abs(biasCents), target.biasCents), praise: null, fix: describeLean(biasCents) },
    {
      margin: under(intervalErrorCents, target.intervalErrorCents),
      praise: "The jumps between notes were accurate.",
      fix: "The jumps between notes are the thing to work on.",
    },
    {
      margin: over(pctInTune, target.pctInTune),
      praise: pctInTune >= 100 ? "Every note was in tune." : "Nearly every note was in tune.",
      fix: "Landing each note is the thing to work on.",
    },
    {
      margin: under(meanAbsCents, target.meanAbsCents),
      praise: null,
      fix: "The notes are in tune but only just: aim for the middle of each one.",
    },
    { margin: endings, praise: "Long notes held to the end.", fix: "Long notes sag at the end." },
    {
      margin: under(steadinessCents, target.steadinessCents),
      praise: "Long notes were steady.",
      fix: "Long notes waver: hold them steady.",
    },
    {
      margin: over(onTimePct, target.onTimePct),
      praise: "You came in on time.",
      fix: "You are coming in off the beat on many lines.",
    },
  ];

  const missed = checks.find((check) => check.margin !== null && check.margin < 0);
  if (!missed) {
    return checks.every((check) => check.margin !== null)
      ? "This take meets every target."
      : "This take meets every target that could be measured.";
  }

  let best: { margin: number; praise: string } | null = null;
  for (const { margin, praise } of checks) {
    if (margin === null || margin < 0 || praise === null) continue;
    if (!best || margin > best.margin) best = { margin, praise };
  }
  if (best) return `${best.praise} ${missed.fix}`;
  // Nothing met its target. A take in the wrong octave needs no percentage to make the point.
  if (inWrongOctave(biasCents)) return missed.fix;
  return `${Math.round(pctInTune)}% of notes were in tune. ${missed.fix}`;
}
