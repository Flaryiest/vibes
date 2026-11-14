import { useEffect, useState } from "react";
import { Link } from "react-router";
import { loadIndex } from "../song/package";
import type { SongIndexEntry } from "../song/types";
import { headlineClass } from "./lab/styles";

export function Songs() {
  const [songs, setSongs] = useState<SongIndexEntry[] | null>(null);

  useEffect(() => {
    void loadIndex().then(setSongs);
  }, []);

  if (!songs) return null;
  if (songs.length === 0) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>No songs yet.</p>
        <p className="mt-3 max-w-prose text-mist">
          Import a song you have on disk from the terminal. It takes a few minutes and makes a backing track, the
          melody and the lyrics.
        </p>
        <p className="mt-6 font-mono text-sm">
          cd songprep && uv run songprep import ~/Music/song.m4a --artist "Artist" --title "Title"
        </p>
      </div>
    );
  }
  return (
    <div className="pt-12">
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
    </div>
  );
}
