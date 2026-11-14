import type { TakeRow } from "../store/db";

/** A run-through this good or better counts toward being ready to perform. */
export const READY_PCT = 90;
const DAYS_NEEDED = 3;

export type Readiness = {
  /** Different calendar days with a run-through at 90% in tune or better. */
  goodDays: number;
  daysNeeded: number;
  ready: boolean;
  /** Best run-through so far, or null when none has been scored. */
  bestPct: number | null;
};

/**
 * Whether a song is ready to perform: three scored run-throughs at 90% in tune
 * or better, on three different days. One good day is not yet reliable.
 */
export function readiness(takes: TakeRow[]): Readiness {
  const scored = takes.filter((take) => take.pctInTune !== null);
  const days = new Set(
    scored.filter((take) => take.pctInTune! >= READY_PCT).map((take) => new Date(take.at).toDateString()),
  );
  return {
    goodDays: days.size,
    daysNeeded: DAYS_NEEDED,
    ready: days.size >= DAYS_NEEDED,
    bestPct: scored.length === 0 ? null : Math.max(...scored.map((take) => take.pctInTune!)),
  };
}

/** The steps from singing alone to singing for people, in order. */
export const PERFORMING_STEPS = [
  { id: "audio", label: "Record a full take and listen back to it" },
  { id: "video", label: "Film yourself singing it, standing up" },
  { id: "friend", label: "Sing it for one person" },
  { id: "group", label: "Sing it for a few people" },
] as const;

export type PerformingStepId = (typeof PERFORMING_STEPS)[number]["id"];
