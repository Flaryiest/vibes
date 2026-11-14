import { useEffect, useState } from "react";
import type { RangeProfile } from "../practice/exercises";
import type { PhraseProgress } from "../practice/phraseLadder";
import { loadPackage } from "../song/package";
import type { SongPackage } from "../song/types";
import { loadPhraseProgress, loadProfile, loadSongSettings, type SongSettings } from "../store/db";

export type SongData = {
  pkg: SongPackage;
  profile: RangeProfile | null;
  settings: SongSettings | null;
  progress: PhraseProgress[];
};

/** Loads a song and everything the learner has stored about it. `reload` re-reads after a change. */
export function useSong(id: string): { data: SongData | null; error: string; reload: () => void } {
  const [data, setData] = useState<SongData | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([loadPackage(id), loadProfile(), loadSongSettings(id), loadPhraseProgress(id)]).then(
      ([pkg, profile, settings, progress]) => {
        if (current) setData({ pkg, profile, settings, progress });
      },
      (cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      current = false;
    };
  }, [id, version]);

  return { data, error, reload: () => setVersion((v) => v + 1) };
}
