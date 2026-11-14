import { describe, expect, it } from "vitest";
import type { TakeMetrics } from "../scoring/take";
import { takeDate, takeFacts, takePercent } from "./takeText";

const metrics = (changes: Partial<TakeMetrics> = {}): TakeMetrics => ({
  scoredNotes: 37,
  totalNotes: 40,
  pctInTune: 91.9,
  meanAbsCents: 21.6,
  biasCents: -12.4,
  intervalErrorCents: 17.5,
  steadinessCents: 14.2,
  endDriftCents: -22.3,
  onTimePct: 84.6,
  ...changes,
});

/** The value shown for the measure called `name`. */
const value = (name: string, changes: Partial<TakeMetrics> = {}): string =>
  takeFacts(metrics(changes)).find((fact) => fact.name === name)!.value;

describe("takeFacts", () => {
  it("lists every measure but the two headline figures, each with its target", () => {
    expect(takeFacts(metrics())).toEqual([
      { name: "Flat or sharp overall", value: "12 cents flat", target: "Within 20 cents" },
      { name: "Jumps between notes", value: "18 cents off", target: "30 cents or less" },
      { name: "Long notes, steadiness", value: "14 cents of waver", target: "25 cents or less" },
      { name: "Long notes, endings", value: "Sag of 22 cents", target: "Sag of 30 cents or less" },
      { name: "Entries on time", value: "85%", target: "80% or more" },
      { name: "Notes heard", value: "37 of 40", target: "" },
    ]);
  });

  it("says which way the take leaned, or that it did not", () => {
    expect(value("Flat or sharp overall", { biasCents: 7.6 })).toBe("8 cents sharp");
    expect(value("Flat or sharp overall", { biasCents: -0.3 })).toBe("Neither");
    expect(value("Flat or sharp overall", { biasCents: -1 })).toBe("1 cent flat");
  });

  it("says how long notes end", () => {
    expect(value("Long notes, endings", { endDriftCents: 9 })).toBe("Rise of 9 cents");
    expect(value("Long notes, endings", { endDriftCents: 0.2 })).toBe("Held");
  });

  it("says when a measure could not be taken", () => {
    const facts = takeFacts(
      metrics({ biasCents: null, intervalErrorCents: null, steadinessCents: null, endDriftCents: null, onTimePct: null }),
    );
    expect(facts.slice(0, 5).map((fact) => fact.value)).toEqual(Array(5).fill("Not measured"));
  });
});

describe("takePercent", () => {
  it("rounds to a whole percent", () => {
    expect(takePercent(91.9)).toBe("92%");
    expect(takePercent(0)).toBe("0%");
    expect(takePercent(100)).toBe("100%");
  });

  it("does not round a near miss up to 100%", () => {
    expect(takePercent(99.7)).toBe("99%");
  });

  it("says when a take was not scored", () => {
    expect(takePercent(null)).toBe("Not scored");
  });
});

describe("takeDate", () => {
  it("gives the day and the time", () => {
    expect(takeDate(new Date(2026, 10, 14, 9, 41).toISOString())).toBe("14 Nov, 09:41");
    expect(takeDate(new Date(2026, 0, 3, 18, 5).toISOString())).toBe("3 Jan, 18:05");
  });
});
