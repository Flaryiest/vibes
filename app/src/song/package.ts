import type { Beats, F0, Lyrics, Manifest, Note, SongIndexEntry, SongPackage } from "./types";

function fail(what: string): never {
  throw new Error(`This song package is damaged: ${what}.`);
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

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

  const notes = raw.notes as Note[] | null;
  if (!Array.isArray(notes) || notes.length === 0) fail("it has no notes");
  for (const note of notes) {
    if (!isNumber(note.t) || !isNumber(note.d) || !isNumber(note.midi) || note.d <= 0) {
      fail("a note has a bad time or pitch");
    }
    if (!["normal", "rap", "free"].includes(note.kind)) fail("a note has an unknown kind");
  }
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].t < notes[i - 1].t) fail("the notes are out of order");
  }

  const lyrics = raw.lyrics as Lyrics | null;
  if (!lyrics || !Array.isArray(lyrics.lines)) fail("the lyrics are missing");
  const beats = raw.beats as Beats | null;
  if (!beats || !Array.isArray(beats.beats)) fail("the beats are missing");
  const f0 = raw.f0 as F0 | null;
  if (!f0 || !isNumber(f0.hopS) || !Array.isArray(f0.hz)) fail("the pitch curve is missing");

  return { manifest, notes, lyrics, beats, f0 };
}

/** The imported songs. An empty list when none has been imported yet. */
export async function loadIndex(): Promise<SongIndexEntry[]> {
  const response = await fetch("/songs/index.json");
  if (!response.ok) return [];
  const list: unknown = await response.json();
  return Array.isArray(list) ? (list as SongIndexEntry[]) : [];
}

export async function loadPackage(id: string): Promise<SongPackage> {
  const get = async (name: string): Promise<unknown> => {
    const response = await fetch(`/songs/${id}/${name}`);
    if (!response.ok) throw new Error(`This song package is damaged: ${name} is missing.`);
    return response.json();
  };
  const [manifest, notes, lyrics, beats, f0] = await Promise.all(
    ["manifest.json", "notes.json", "lyrics.json", "beats.json", "f0.json"].map(get),
  );
  return validatePackage({ manifest, notes, lyrics, beats, f0 });
}

export const stemUrl = (id: string, stem: "instrumental" | "vocals"): string => `/songs/${id}/${stem}.flac`;

/** Saves corrected notes into the package on disk, through the local server. */
export async function saveNotes(id: string, notes: Note[]): Promise<void> {
  const response = await fetch(`/api/songs/${id}/notes`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(notes),
  });
  if (!response.ok) throw new Error("The notes could not be saved. Is the local server running?");
}
