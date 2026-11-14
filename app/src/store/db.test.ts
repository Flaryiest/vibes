import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { initialSkill } from "../practice/ladder";
import { addAttempt, attemptsSince, db, loadProfile, loadSkill, saveProfile, saveSkill, type AttemptRow } from "./db";

const attempt = (at: string): Omit<AttemptRow, "id"> => ({
  at,
  level: 1,
  mode: "live",
  targets: [45],
  results: [{ id: 0, outcome: "hit", cents: 4, spreadCents: 6, voicedFraction: 1 }],
  firstTry: true,
  success: true,
});

beforeEach(async () => {
  await Promise.all([db.profile.clear(), db.skill.clear(), db.attempts.clear()]);
});

describe("store", () => {
  it("has no profile until one is saved", async () => {
    expect(await loadProfile()).toBeNull();
  });

  it("round-trips the profile, keeping only the latest", async () => {
    await saveProfile({ speakingMidi: 45, comfortLow: 40, comfortHigh: 57 });
    await saveProfile({ speakingMidi: 46, comfortLow: 41, comfortHigh: 58 });
    expect(await loadProfile()).toEqual({ speakingMidi: 46, comfortLow: 41, comfortHigh: 58 });
  });

  it("starts with the initial skill and remembers changes", async () => {
    expect(await loadSkill()).toEqual(initialSkill());
    await saveSkill({ level: 2, mode: "after", recent: [true, false] });
    expect(await loadSkill()).toEqual({ level: 2, mode: "after", recent: [true, false] });
  });

  it("returns attempts on or after a given time", async () => {
    await addAttempt(attempt("2026-11-10T10:00:00.000Z"));
    await addAttempt(attempt("2026-11-12T10:00:00.000Z"));
    const found = await attemptsSince("2026-11-11T00:00:00.000Z");
    expect(found.map((a) => a.at)).toEqual(["2026-11-12T10:00:00.000Z"]);
    expect(found[0].results[0].outcome).toBe("hit");
  });
});
