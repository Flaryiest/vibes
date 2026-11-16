import { addLibrarySong, librarySongs } from "../store/db";
import {
  checkPickedSong,
  findPickedSongFolders,
  readPickedSongFiles,
  type PickedFile,
  type PickedSongFolder,
} from "./songFolder";
import type { SongIndexEntry } from "./types";

/** What became of the songs in a picked folder. */
export type AddSongsOutcome = {
  added: SongIndexEntry[];
  /** Songs left as they were, because this browser already keeps a song with that id. */
  alreadyKept: SongIndexEntry[];
};

type CheckedSongFolder = { song: SongIndexEntry; songFolder: PickedSongFolder };

/**
 * Asks the browser not to clear this site's storage when the disk runs low.
 * The browser may decline; the songs are kept either way, only less safely.
 */
async function askForLastingStorage(): Promise<void> {
  await globalThis.navigator?.storage?.persist?.();
}

/**
 * Keeps the songs of a picked folder in this browser.
 *
 * Every song is checked before any is kept, so a folder with a broken song in
 * it adds nothing. A song already kept is never overwritten, because its notes
 * may have been corrected here; it has to be removed first. Audio is read one
 * song at a time, and not at all for songs already kept.
 */
export async function addPickedSongsToBrowser(pickedFiles: PickedFile[]): Promise<AddSongsOutcome> {
  const checkedSongFolders: CheckedSongFolder[] = [];
  for (const songFolder of findPickedSongFolders(pickedFiles)) {
    checkedSongFolders.push({ song: await checkPickedSong(songFolder), songFolder });
  }

  const keptSongIds = new Set((await librarySongs()).map((song) => song.id));
  const outcome: AddSongsOutcome = { added: [], alreadyKept: [] };
  for (const { song, songFolder } of checkedSongFolders) {
    if (keptSongIds.has(song.id)) {
      outcome.alreadyKept.push(song);
      continue;
    }
    await addLibrarySong(song, await readPickedSongFiles(songFolder));
    keptSongIds.add(song.id);
    outcome.added.push(song);
  }
  if (outcome.added.length > 0) await askForLastingStorage();
  return outcome;
}
