import { describe, expect, it } from "vitest";
import type { TakeRow } from "../store/db";
import { readiness } from "./status";

let id = 0;
const take = (day: number, pctInTune: number | null): TakeRow => ({
  id: id++,
  songId: "song",
  at: new Date(2026, 10, day, 19, 0).toISOString(),
  kind: "run",
  pctInTune,
  meanAbsCents: pctInTune === null ? null : 20,
  scoredNotes: pctInTune === null ? 0 : 40,
  totalNotes: 44,
  key: { trackShift: 0, octaveDrop: 0 },
});

describe("readiness", () => {
  it("is not ready with no takes", () => {
    expect(readiness([])).toEqual({ goodDays: 0, daysNeeded: 3, ready: false, bestPct: null });
  });

  it("counts different days, not takes", () => {
    const sameDay = readiness([take(10, 92), take(10, 95), take(10, 91)]);
    expect(sameDay).toMatchObject({ goodDays: 1, ready: false, bestPct: 95 });
  });

  it("is ready after good takes on three different days", () => {
    expect(readiness([take(10, 92), take(11, 85), take(12, 90), take(14, 96)])).toMatchObject({ goodDays: 3, ready: true });
  });

  it("ignores takes that were not scored", () => {
    expect(readiness([take(10, null), take(11, null)])).toMatchObject({ goodDays: 0, bestPct: null });
  });
});
