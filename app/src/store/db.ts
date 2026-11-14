import Dexie, { type EntityTable } from "dexie";
import type { Level, RangeProfile } from "../practice/exercises";
import { initialSkill, type DisplayMode, type Skill } from "../practice/ladder";
import type { NoteResult } from "../scoring/notes";

type ProfileRow = RangeProfile & { id: "me"; measuredAt: string };
type SkillRow = Skill & { id: "foundation" };

/** One sung repetition. `targets` are the MIDI notes asked for. */
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

export const db = new Dexie("singing-trainer") as Dexie & {
  profile: EntityTable<ProfileRow, "id">;
  skill: EntityTable<SkillRow, "id">;
  attempts: EntityTable<AttemptRow, "id">;
};

db.version(1).stores({ profile: "id", skill: "id", attempts: "++id, at" });

export async function loadProfile(): Promise<RangeProfile | null> {
  const row = await db.profile.get("me");
  if (!row) return null;
  return { speakingMidi: row.speakingMidi, comfortLow: row.comfortLow, comfortHigh: row.comfortHigh };
}

export async function saveProfile(profile: RangeProfile): Promise<void> {
  await db.profile.put({ ...profile, id: "me", measuredAt: new Date().toISOString() });
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
