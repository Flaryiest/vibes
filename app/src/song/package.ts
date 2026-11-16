import { PACKAGE_JSON_FILE_NAMES } from "./package.constants";
import { songStore } from "./songStore";
import type { PackageJsonFileName, ReadPackageFile, StemName } from "./songStore.types";
import type { Beats, F0, Lyrics, Manifest, Note, SongIndexEntry, SongPackage } from "./types";

function fail(what: string): never {
  throw new Error(`This song package is damaged: ${what}.`);
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * What is wrong with a list of notes, in a few words, or null when the app can
 * use it. Asked both when a song is opened and before corrected notes are
 * saved, so that saving can never leave a song that will not open again.
 */
export function findNotesProblem(notes: unknown): string | null {
  if (!Array.isArray(notes) || notes.length === 0) return "there are no notes";
  const candidates = notes as Note[];
  for (const note of candidates) {
    if (!isNumber(note.t) || !isNumber(note.d) || !isNumber(note.midi) || note.d <= 0) {
      return "a note has a bad time or pitch";
    }
    if (!["normal", "rap", "free"].includes(note.kind)) return "a note has an unknown kind";
  }
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].t < candidates[i - 1].t) return "the notes are out of order";
  }
  return null;
}

/** Checks the parts of a package the app relies on, and says plainly what is wrong when one is missing. */
export function validatePackage(raw: {
  manifest: unknown;
  notes: unknown;
  lyrics: unknown;
  beats: unknown;
  f0: unknown;
}): SongPackage {
  const manifest = raw.manifest as Manifest | null;
  if (!manifest || manifest.schema !== 1) fail("the manifest is missing or from another version");
  if (typeof manifest.id !== "string" || typeof manifest.title !== "string") fail("the manifest has no id or title");
  if (!isNumber(manifest.durationS) || manifest.durationS <= 0) fail("the manifest has no duration");

  const notesProblem = findNotesProblem(raw.notes);
  if (notesProblem !== null) fail(notesProblem);
  const notes = raw.notes as Note[];

  const lyrics = raw.lyrics as Lyrics | null;
  if (!lyrics || !Array.isArray(lyrics.lines)) fail("the lyrics are missing");
  const beats = raw.beats as Beats | null;
  if (!beats || !Array.isArray(beats.beats)) fail("the beats are missing");
  const f0 = raw.f0 as F0 | null;
  if (!f0 || !isNumber(f0.hopS) || !Array.isArray(f0.hz)) fail("the pitch curve is missing");

  return { manifest, notes, lyrics, beats, f0 };
}

export const stemFileName = (stem: StemName): string => `${stem}.flac`;

/** Reads a package's JSON files through `readFile` and checks them. The same for a song on disk and one in the browser. */
export async function readPackage(readFile: ReadPackageFile, songId: string): Promise<SongPackage> {
  const readJson = async (fileName: PackageJsonFileName): Promise<unknown> => {
    const bytes = await readFile(songId, fileName);
    if (!bytes) fail(`${fileName} is missing`);
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return fail(`${fileName} cannot be read`);
    }
  };
  const [manifest, notes, lyrics, beats, f0] = await Promise.all(PACKAGE_JSON_FILE_NAMES.map(readJson));
  return validatePackage({ manifest, notes, lyrics, beats, f0 });
}

/** The songs this copy of the app has. An empty list when there are none yet. */
export async function loadIndex(): Promise<SongIndexEntry[]> {
  const store = await songStore();
  return store.listSongs();
}

export async function loadPackage(songId: string): Promise<SongPackage> {
  const store = await songStore();
  return readPackage(store.readFile, songId);
}

/** One audio track of a song, still encoded. */
export async function loadStem(songId: string, stem: StemName): Promise<ArrayBuffer> {
  const store = await songStore();
  const bytes = await store.readFile(songId, stemFileName(stem));
  if (!bytes) fail(`${stemFileName(stem)} is missing`);
  return bytes;
}

/**
 * Saves corrected notes into the song, wherever it is kept. Refuses notes the
 * song could not be opened with, such as none at all.
 */
export async function saveNotes(songId: string, notes: Note[]): Promise<void> {
  const notesProblem = findNotesProblem(notes);
  if (notesProblem !== null) {
    throw new Error(`The song would not open again with these notes: ${notesProblem}.`);
  }
  const store = await songStore();
  await store.saveNotes(songId, notes);
}
