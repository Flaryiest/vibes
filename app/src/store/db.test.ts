import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { initialSkill } from "../practice/ladder";
import { newProgress } from "../practice/phraseLadder";
import {
  addAttempt,
  addPitchCheck,
  addSession,
  addTake,
  attemptsSince,
  db,
  exportAll,
  getSetting,
  loadPhraseProgress,
  loadProfile,
  loadSkill,
  loadSongSettings,
  pitchChecks,
  rangeChecks,
  resetPhraseProgress,
  savePhraseProgress,
  saveProfile,
  saveSkill,
  saveSongSettings,
  sessionsSince,
  setSetting,
  takeAudio,
  takeIdsWithAudio,
  takesFor,
  type AttemptRow,
} from "./db";

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
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("store", () => {
  it("has no profile until one is saved", async () => {
    expect(await loadProfile()).toBeNull();
  });

  it("round-trips the profile, keeping only the latest, and a dated history", async () => {
    await saveProfile({ speakingMidi: 45, comfortLow: 40, comfortHigh: 57 });
    await saveProfile({ speakingMidi: 46, comfortLow: 41, comfortHigh: 58 });
    expect(await loadProfile()).toEqual({ speakingMidi: 46, comfortLow: 41, comfortHigh: 58 });
    expect((await rangeChecks()).map((r) => r.comfortHigh)).toEqual([57, 58]);
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

  it("keeps each song's key and each phrase's progress", async () => {
    expect(await loadSongSettings("song")).toBeNull();
    await saveSongSettings({ songId: "song", trackShift: 3, octaveDrop: 1, backingGain: 0.5 });
    expect(await loadSongSettings("song")).toMatchObject({ trackShift: 3, octaveDrop: 1 });

    await savePhraseProgress({ ...newProgress("song", 0), step: 4 });
    await savePhraseProgress({ ...newProgress("song", 2), step: 2 });
    await savePhraseProgress({ ...newProgress("other", 0), step: 7 });
    await savePhraseProgress({ ...newProgress("song", 0), step: 5 });
    const progress = await loadPhraseProgress("song");
    expect(progress.map((p) => [p.group, p.step]).sort()).toEqual([
      [0, 5],
      [2, 2],
    ]);
    await resetPhraseProgress("song");
    expect(await loadPhraseProgress("song")).toEqual([]);
    expect((await loadPhraseProgress("other")).length).toBe(1);
  });

  it("stores takes with optional audio, oldest first", async () => {
    const key = { trackShift: 0, octaveDrop: 0 as const };
    const base = { songId: "song", kind: "run" as const, pctInTune: 80, meanAbsCents: 30, scoredNotes: 40, totalNotes: 44, key };
    const later = await addTake({ ...base, at: "2026-11-12T10:00:00.000Z" });
    const earlier = await addTake(
      { ...base, at: "2026-11-10T10:00:00.000Z", kind: "capsule" },
      { sampleRate: 16000, pcm: new Int16Array([1, 2, 3]).buffer },
    );
    expect((await takesFor("song")).map((t) => t.id)).toEqual([earlier, later]);
    expect(new Int16Array((await takeAudio(earlier))!.pcm)).toEqual(new Int16Array([1, 2, 3]));
    expect(await takeAudio(later)).toBeNull();
  });

  it("says which takes have audio without loading it", async () => {
    const key = { trackShift: 0, octaveDrop: 0 as const };
    const base = { songId: "song", kind: "run" as const, pctInTune: 80, meanAbsCents: 30, scoredNotes: 40, totalNotes: 44, key };
    const audio = { sampleRate: 16000, pcm: new Int16Array([1, 2, 3]).buffer };
    const first = await addTake({ ...base, at: "2026-11-10T10:00:00.000Z" }, audio);
    const second = await addTake({ ...base, at: "2026-11-11T10:00:00.000Z" });
    const third = await addTake({ ...base, at: "2026-11-12T10:00:00.000Z" }, audio);
    expect(await takeIdsWithAudio([first, second, third])).toEqual([first, third]);
    expect(await takeIdsWithAudio([second])).toEqual([]);
    expect(await takeIdsWithAudio([])).toEqual([]);
  });

  it("stores sessions, pitch checks and settings", async () => {
    await addSession({ at: "2026-11-12T10:00:00.000Z", minutes: 30, effort: 3, throat: "fine" });
    expect((await sessionsSince("2026-11-01T00:00:00.000Z"))[0]).toMatchObject({ minutes: 30, throat: "fine" });
    await addPitchCheck({ at: "2026-11-12T10:00:00.000Z", pctInTune: 62, meanAbsCents: 48, notes: 34 });
    expect((await pitchChecks())[0].pctInTune).toBe(62);
    expect(await getSetting("route", "speakers")).toBe("speakers");
    await setSetting("route", "headphones");
    expect(await getSetting("route", "speakers")).toBe("headphones");
  });

  it("exports everything except audio", async () => {
    await saveProfile({ speakingMidi: 45, comfortLow: 40, comfortHigh: 57 });
    await addTake(
      { songId: "s", at: "2026-11-10T10:00:00.000Z", kind: "run", pctInTune: 1, meanAbsCents: 1, scoredNotes: 1, totalNotes: 1, key: { trackShift: 0, octaveDrop: 0 } },
      { sampleRate: 16000, pcm: new ArrayBuffer(8) },
    );
    const exported = await exportAll();
    expect(Object.keys(exported)).not.toContain("takeAudio");
    expect((exported.takes as unknown[]).length).toBe(1);
    expect((exported.profile as unknown[]).length).toBe(1);
    expect(() => JSON.stringify(exported)).not.toThrow();
  });
});
