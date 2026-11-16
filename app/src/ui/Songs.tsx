import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { loadIndex } from "../song/package";
import type { SongIndexEntry } from "../song/types";
import { AddSong } from "./AddSong";
import { headlineClass } from "./lab/styles";
import { useHasLocalServer } from "./useHasLocalServer";

function NoSongsYet({ songsAreAddedByHand }: { songsAreAddedByHand: boolean }) {
  return (
    <>
      <p className={headlineClass}>No songs yet.</p>
      <p className="mt-3 max-w-prose text-mist">
        Import a song you have on disk from the terminal. It takes a few minutes and makes a backing track, the melody
        and the lyrics.
      </p>
      <p className="mt-6 font-mono text-sm">
        cd songprep && uv run songprep import ~/Music/song.m4a --artist "Artist" --title "Title"
      </p>
      {songsAreAddedByHand && (
        <p className="mt-6 max-w-prose text-mist">
          The import writes a folder into songs. Add that folder here. The song is kept in this browser and goes nowhere
          else, though Chrome words its question as an upload.
        </p>
      )}
    </>
  );
}

function SongList({ songs }: { songs: SongIndexEntry[] }) {
  return (
    <>
      <p className={headlineClass}>Your songs</p>
      <ul className="mt-10 max-w-2xl border-t border-rule">
        {songs.map((song) => (
          <li key={song.id} className="border-b border-rule">
            <Link to={`/songs/${song.id}`} className="flex items-baseline justify-between gap-6 py-4 underline-offset-4 hover:underline">
              <span className="text-lg">{song.title}</span>
              <span className="text-sm text-mist">{song.artist}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Songs() {
  const [songs, setSongs] = useState<SongIndexEntry[] | null>(null);
  const hasServer = useHasLocalServer();

  const reload = useCallback(() => {
    void loadIndex().then(setSongs);
  }, []);
  useEffect(reload, [reload]);

  if (!songs || hasServer === null) return null;
  // With the local server, songs appear by themselves once imported. Without it, each is added here by hand.
  const songsAreAddedByHand = !hasServer;
  const hasNoSongs = songs.length === 0;

  return (
    <div className={hasNoSongs ? "pt-[18vh]" : "pt-12"}>
      {hasNoSongs ? <NoSongsYet songsAreAddedByHand={songsAreAddedByHand} /> : <SongList songs={songs} />}
      {/* One place for both states, so what it reports outlasts the first song appearing in the list. */}
      {songsAreAddedByHand && (
        <div className="mt-8">
          <AddSong prominent={hasNoSongs} onLibraryChanged={reload} />
        </div>
      )}
    </div>
  );
}
