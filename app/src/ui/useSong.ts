import { useEffect, useState } from "react";
import type { RangeProfile } from "../practice/exercises";
import type { PhraseProgress } from "../practice/phraseLadder";
import { loadPackage } from "../song/package";
import type { SongPackage } from "../song/types";
import {
  getSetting,
  loadPhraseProgress,
  loadProfile,
  loadSongSettings,
  takesFor,
  type SongSettings,
  type TakeRow,
} from "../store/db";

export type SongData = {
  pkg: SongPackage;
  profile: RangeProfile | null;
  settings: SongSettings | null;
  progress: PhraseProgress[];
  takes: TakeRow[];
  /** Ids of the performing steps the learner has ticked off. */
  performed: string[];
};

/** Loads a song and everything the learner has stored about it. `reload` re-reads after a change. */
export function useSong(id: string): { data: SongData | null; error: string; reload: () => void } {
  const [data, setData] = useState<SongData | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.all([
      loadPackage(id),
      loadProfile(),
      loadSongSettings(id),
      loadPhraseProgress(id),
      takesFor(id),
      getSetting<string[]>(`performed:${id}`, []),
    ]).then(
      ([pkg, profile, settings, progress, takes, performed]) => {
        if (current) setData({ pkg, profile, settings, progress, takes, performed });
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
