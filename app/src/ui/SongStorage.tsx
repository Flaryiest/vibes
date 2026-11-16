import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { libraryKeepsSong, removeLibrarySong } from "../store/db";
import { quietButtonClass } from "./lab/styles";

type SongStorageProps = {
  songId: string;
  className: string;
  /** Called just before the song is removed, to stop anything still playing it. */
  onRemoving: () => void;
};

/**
 * The part of a song's screen for removing it from this browser. Shown only
 * for a song this browser keeps; a song in the folder on disk has nothing to
 * remove here.
 */
export function SongStorage({ songId, className, onRemoving }: SongStorageProps) {
  const navigate = useNavigate();
  const [songIsKeptInThisBrowser, setSongIsKeptInThisBrowser] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let current = true;
    void libraryKeepsSong(songId).then((kept) => {
      if (current) setSongIsKeptInThisBrowser(kept);
    });
    return () => {
      current = false;
    };
  }, [songId]);

  if (!songIsKeptInThisBrowser) return null;

  async function remove() {
    onRemoving();
    await removeLibrarySong(songId);
    await navigate("/songs");
  }

  return (
    <section className={className}>
      <h2 className="text-sm font-medium">Storage</h2>
      <div className="space-y-3">
        <p className="max-w-prose text-sm text-mist">
          This song is kept in this browser. Removing it also removes its phrase progress and any notes corrected
          here. The key and the run-throughs stay.
        </p>
        {confirming ? (
          <div className="flex items-center gap-5">
            <button onClick={() => void remove()} className={quietButtonClass}>
              Yes, remove it
            </button>
            <button onClick={() => setConfirming(false)} className={quietButtonClass}>
              Keep it
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className={quietButtonClass}>
            Remove this song
          </button>
        )}
      </div>
    </section>
  );
}
