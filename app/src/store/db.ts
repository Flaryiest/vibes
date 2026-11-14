import Dexie, { type EntityTable, type Table } from "dexie";
import type { Level, RangeProfile } from "../practice/exercises";
import { initialSkill, type DisplayMode, type Skill } from "../practice/ladder";
import type { PhraseProgress } from "../practice/phraseLadder";
import type { NoteResult } from "../scoring/notes";
import type { KeySetting } from "../song/key";

type ProfileRow = RangeProfile & { id: "me"; measuredAt: string };
type SkillRow = Skill & { id: "foundation" };

/** One sung repetition of a foundation exercise. `targets` are the MIDI notes asked for. */
export type AttemptRow = {
  id: number;
  at: string;
  level: Level;
  mode: DisplayMode;
  targets: number[];
  results: NoteResult[];
  firstTry: boolean;
  success: boolean | null;
};

/** How one song is fitted to the learner. */
export type SongSettings = KeySetting & { songId: string; backingGain: number };

/** A recorded run-through of a song. A `capsule` is kept for before-and-after comparison. */
export type TakeRow = {
  id: number;
  songId: string;
  at: string;
  kind: "run" | "capsule";
  pctInTune: number | null;
  meanAbsCents: number | null;
  scoredNotes: number;
  totalNotes: number;
  key: KeySetting;
};

/** A take's audio: 16-bit mono samples. */
export type TakeAudioRow = { takeId: number; sampleRate: number; pcm: ArrayBuffer };

export type Throat = "fine" | "tired" | "hoarse";
export type SessionRow = { id: number; at: string; minutes: number; effort: number | null; throat: Throat | null };

export type PitchCheckRow = { id: number; at: string; pctInTune: number; meanAbsCents: number; notes: number };
export type RangeCheckRow = { id: number; at: string; comfortLow: number; comfortHigh: number; speakingMidi: number };
type SettingRow = { key: string; value: unknown };

export const db = new Dexie("singing-trainer") as Dexie & {
  profile: EntityTable<ProfileRow, "id">;
  skill: EntityTable<SkillRow, "id">;
  attempts: EntityTable<AttemptRow, "id">;
  songSettings: EntityTable<SongSettings, "songId">;
  phraseProgress: Table<PhraseProgress, [string, number]>;
  takes: EntityTable<TakeRow, "id">;
  takeAudio: EntityTable<TakeAudioRow, "takeId">;
  sessions: EntityTable<SessionRow, "id">;
  pitchChecks: EntityTable<PitchCheckRow, "id">;
  rangeChecks: EntityTable<RangeCheckRow, "id">;
  settings: EntityTable<SettingRow, "key">;
};

db.version(1).stores({ profile: "id", skill: "id", attempts: "++id, at" });
db.version(2).stores({
  profile: "id",
  skill: "id",
  attempts: "++id, at",
  songSettings: "songId",
  phraseProgress: "[songId+group], songId",
  takes: "++id, songId, at",
  takeAudio: "takeId",
  sessions: "++id, at",
  pitchChecks: "++id, at",
  rangeChecks: "++id, at",
  settings: "key",
});

export async function loadProfile(): Promise<RangeProfile | null> {
  const row = await db.profile.get("me");
  if (!row) return null;
  return { speakingMidi: row.speakingMidi, comfortLow: row.comfortLow, comfortHigh: row.comfortHigh };
}

/** Saves the range and keeps a dated copy, so the range can be charted over time. */
export async function saveProfile(profile: RangeProfile): Promise<void> {
  const at = new Date().toISOString();
  await db.profile.put({ ...profile, id: "me", measuredAt: at });
  await db.rangeChecks.add({ at, ...profile });
}

export async function loadSkill(): Promise<Skill> {
  const row = await db.skill.get("foundation");
  return row ? { level: row.level, mode: row.mode, recent: row.recent } : initialSkill();
}

export async function saveSkill(skill: Skill): Promise<void> {
  await db.skill.put({ ...skill, id: "foundation" });
}

export async function addAttempt(attempt: Omit<AttemptRow, "id">): Promise<void> {
  await db.attempts.add(attempt);
}

export async function attemptsSince(iso: string): Promise<AttemptRow[]> {
  return db.attempts.where("at").aboveOrEqual(iso).toArray();
}

export async function loadSongSettings(songId: string): Promise<SongSettings | null> {
  return (await db.songSettings.get(songId)) ?? null;
}

export async function saveSongSettings(settings: SongSettings): Promise<void> {
  await db.songSettings.put(settings);
}

export async function loadPhraseProgress(songId: string): Promise<PhraseProgress[]> {
  return db.phraseProgress.where("songId").equals(songId).toArray();
}

export async function savePhraseProgress(progress: PhraseProgress): Promise<void> {
  await db.phraseProgress.put(progress);
}

/** Forgets a song's phrase progress, for when its notes have been edited. */
export async function resetPhraseProgress(songId: string): Promise<void> {
  await db.phraseProgress.where("songId").equals(songId).delete();
}

export async function addTake(take: Omit<TakeRow, "id">, audio?: Omit<TakeAudioRow, "takeId">): Promise<number> {
  const id = await db.takes.add(take);
  if (audio) await db.takeAudio.put({ takeId: id, ...audio });
  return id;
}

export async function takesFor(songId: string): Promise<TakeRow[]> {
  return db.takes.where("songId").equals(songId).sortBy("at");
}

export async function takeAudio(takeId: number): Promise<TakeAudioRow | null> {
  return (await db.takeAudio.get(takeId)) ?? null;
}

/** Which of these takes still have their audio, in ascending order. Reads the keys only, not the recordings. */
export async function takeIdsWithAudio(takeIds: number[]): Promise<number[]> {
  if (takeIds.length === 0) return [];
  return db.takeAudio.where("takeId").anyOf(takeIds).primaryKeys();
}

export async function addSession(session: Omit<SessionRow, "id">): Promise<void> {
  await db.sessions.add(session);
}

export async function sessionsSince(iso: string): Promise<SessionRow[]> {
  return db.sessions.where("at").aboveOrEqual(iso).toArray();
}

export async function addPitchCheck(check: Omit<PitchCheckRow, "id">): Promise<void> {
  await db.pitchChecks.add(check);
}

export async function pitchChecks(): Promise<PitchCheckRow[]> {
  return db.pitchChecks.orderBy("at").toArray();
}

export async function rangeChecks(): Promise<RangeCheckRow[]> {
  return db.rangeChecks.orderBy("at").toArray();
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

/** Everything except recorded audio, for the backup kept on disk. */
export async function exportAll(): Promise<Record<string, unknown>> {
  const [profile, skill, attempts, songSettings, phraseProgress, takes, sessions, checks, ranges, settings] =
    await Promise.all([
      db.profile.toArray(),
      db.skill.toArray(),
      db.attempts.toArray(),
      db.songSettings.toArray(),
      db.phraseProgress.toArray(),
      db.takes.toArray(),
      db.sessions.toArray(),
      db.pitchChecks.toArray(),
      db.rangeChecks.toArray(),
      db.settings.toArray(),
    ]);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    profile,
    skill,
    attempts,
    songSettings,
    phraseProgress,
    takes,
    sessions,
    pitchChecks: checks,
    rangeChecks: ranges,
    settings,
  };
}

/** Sends a backup to the local server, which keeps the last thirty days on disk. Quietly does nothing if it is not running. */
export async function backupToDisk(): Promise<boolean> {
  try {
    const response = await fetch("/api/backup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await exportAll()),
    });
    return response.ok;
  } catch {
    return false;
  }
}
