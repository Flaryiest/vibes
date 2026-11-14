import { useRef } from "react";
import { Link, useParams } from "react-router";
import { Transport } from "../playback/transport";
import { saveNotes } from "../song/package";
import type { Note } from "../song/types";
import { resetPhraseProgress } from "../store/db";
import { quietButtonClass } from "./lab/styles";
import { NoteEditor } from "./NoteEditor";
import { useSong } from "./useSong";

/** The note editor for one song. Editing needs no microphone, only playback. */
export function SongEdit() {
  const { id = "" } = useParams();
  const { data, error } = useSong(id);
  const audio = useRef<{ ctx: AudioContext; transport: Promise<Transport> } | null>(null);

  if (error) return <p className="max-w-lg pt-[18vh] text-signal">{error}</p>;
  if (!data) return null;
  const { pkg } = data;

  /** Plays the original singer, quietly backed, for a span of the song. */
  function audition(fromS: number, toS: number) {
    // Created on the first click, because a browser only starts audio from one.
    if (!audio.current) {
      const ctx = new AudioContext();
      audio.current = { ctx, transport: Transport.load(ctx, id) };
    }
    const { ctx, transport } = audio.current;
    void transport.then((loaded) => {
      loaded.stop();
      loaded.play({ fromS, toS, at: ctx.currentTime + Transport.LEAD_S + 0.05, backingGain: 0.2, vocalGain: 1 });
    });
  }

  async function save(notes: Note[]) {
    await saveNotes(id, notes);
    // The phrases may no longer be the same phrases, so their progress starts again.
    await resetPhraseProgress(id);
  }

  return (
    <div className="pt-10">
      <p className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm text-mist">
        <span>
          {pkg.manifest.title}. Saving starts this song's phrase progress again, because the phrases may have changed.
        </span>
        <Link to={`/songs/${id}`} className={quietButtonClass}>
          Back to the song
        </Link>
      </p>
      <NoteEditor
        key={id}
        notes={pkg.notes}
        f0={pkg.f0}
        durationS={pkg.manifest.durationS}
        onSave={save}
        onAudition={audition}
      />
    </div>
  );
}
