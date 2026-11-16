import { libraryFile, librarySongs, replaceLibraryFile } from "../store/db";
import { hasLocalServer } from "../store/localServer";
import { NOTES_FILE_NAME } from "./package.constants";
import type { ListSongs, ReadPackageFile, SaveSongNotes, SongStore } from "./songStore.types";
import type { SongIndexEntry } from "./types";

const SONG_FILES_ROUTE = "/song-files";
const songNotesRoute = (songId: string): string => `/api/songs/${songId}/notes`;

const listSongsOnDisk: ListSongs = async () => {
  const response = await fetch(`${SONG_FILES_ROUTE}/index.json`);
  if (!response.ok) return [];
  const list: unknown = await response.json();
  return Array.isArray(list) ? (list as SongIndexEntry[]) : [];
};

const readFileOnDisk: ReadPackageFile = async (songId, fileName) => {
  const response = await fetch(`${SONG_FILES_ROUTE}/${songId}/${fileName}`);
  return response.ok ? response.arrayBuffer() : null;
};

const saveNotesOnDisk: SaveSongNotes = async (songId, notes) => {
  const response = await fetch(songNotesRoute(songId), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(notes),
  });
  if (!response.ok) throw new Error("The notes could not be saved. Is the local server running?");
};

const saveNotesInBrowser: SaveSongNotes = async (songId, notes) => {
  const bytes = new TextEncoder().encode(JSON.stringify(notes)).buffer;
  await replaceLibraryFile(songId, { name: NOTES_FILE_NAME, bytes });
};

/** The songs folder on the learner's Mac, through the local server. */
export const diskSongStore: SongStore = {
  listSongs: listSongsOnDisk,
  readFile: readFileOnDisk,
  saveNotes: saveNotesOnDisk,
};

/** The library inside this browser, filled by adding song folders by hand. */
export const browserSongStore: SongStore = {
  listSongs: librarySongs,
  readFile: libraryFile,
  saveNotes: saveNotesInBrowser,
};

/** The one place this copy of the app keeps its songs: on disk when the local server is there, otherwise in the browser. */
export async function songStore(): Promise<SongStore> {
  return (await hasLocalServer()) ? diskSongStore : browserSongStore;
}
