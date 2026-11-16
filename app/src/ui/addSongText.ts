import type { AddSongsOutcome } from "../song/browserLibrary";
import type { SongIndexEntry } from "../song/types";

function nameSongs(songs: SongIndexEntry[]): string {
  return songs.length === 1 ? `"${songs[0].title}"` : `${songs.length} songs`;
}

/** One or two plain sentences on what adding a folder did. */
export function describeAddedSongs(outcome: AddSongsOutcome): string {
  const { added, alreadyKept } = outcome;
  const sentences: string[] = [];
  if (added.length > 0) sentences.push(`Added ${nameSongs(added)}.`);
  if (alreadyKept.length > 0) {
    const verb = alreadyKept.length === 1 ? "is" : "are";
    sentences.push(`${nameSongs(alreadyKept)} ${verb} already here. To replace a song, open it and remove it first.`);
  }
  return sentences.join(" ");
}
