import type { PACKAGE_JSON_FILE_NAMES, STEM_NAMES } from "./package.constants";
import type { Note, SongIndexEntry } from "./types";

export type PackageJsonFileName = (typeof PACKAGE_JSON_FILE_NAMES)[number];
export type StemName = (typeof STEM_NAMES)[number];

/** One file of a song package, by its name inside the package folder, e.g. "notes.json" or "vocals.flac". */
export type PackageFile = { name: string; bytes: ArrayBuffer };

export type ListSongs = () => Promise<SongIndexEntry[]>;
/** Resolves to null when the song has no such file. */
export type ReadPackageFile = (songId: string, fileName: string) => Promise<ArrayBuffer | null>;
export type SaveSongNotes = (songId: string, notes: Note[]) => Promise<void>;

/**
 * Where song packages are kept. There are two: the songs folder on the
 * learner's Mac, reached through the local server, and a library inside the
 * browser for the copy of the app that has no server.
 */
export type SongStore = {
  listSongs: ListSongs;
  readFile: ReadPackageFile;
  saveNotes: SaveSongNotes;
};
