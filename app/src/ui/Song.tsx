import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { playGuide } from "../playback/guide";
import { Transport } from "../playback/transport";
import { recommendKeys, targetMidi, type KeyChoice } from "../song/key";
import { buildPhrases, practiceOrder } from "../song/phrases";
import { PERFORMING_STEPS, readiness } from "../song/status";
import { saveSongSettings, setSetting } from "../store/db";
import { useEngine } from "./engine";
import { describeFit, describeKey } from "./keyText";
import { buttonClass, headlineClass, quietButtonClass } from "./lab/styles";
import { MasteryMap } from "./MasteryMap";
import { SongStorage } from "./SongStorage";
import { useSong } from "./useSong";

const sectionClass = "grid gap-x-10 gap-y-3 border-t border-rule py-8 md:grid-cols-[11rem_1fr]";

export function Song() {
  const { id = "" } = useParams();
  const { data, error, reload } = useSong(id);
  const { engine, start } = useEngine();
  const transport = useRef<Transport | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState("");
  const phrases = useMemo(() => (data ? buildPhrases(data.pkg.notes) : []), [data]);

  if (error) {
    return (
      <div className="pt-[18vh]">
        <p className="max-w-lg text-signal">{error}</p>
        {/* A song kept in this browser can still be removed when it will not open, to make room for a good copy. */}
        <div className="mt-12">
          <SongStorage songId={id} className={sectionClass} onRemoving={() => transport.current?.stop()} />
        </div>
      </div>
    );
  }
  if (!data) return null;
  const { pkg, profile, settings, progress, takes, performed } = data;
  const ready = readiness(takes);

  if (!profile) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>Find your range before setting up a song.</p>
        <p className="mt-3 max-w-lg text-mist">The key is chosen to fit the notes you can sing comfortably.</p>
        <Link to="/range" className={`mt-8 inline-block ${buttonClass}`}>
          Find my range
        </Link>
      </div>
    );
  }

  const choices = recommendKeys(pkg.notes, profile);
  const chorus = practiceOrder(phrases)[0];

  /** Plays the most repeated phrase with the guide voice in a candidate key. */
  async function hear(choice: KeyChoice) {
    const label = `${choice.trackShift}/${choice.octaveDrop}`;
    setBusy(label);
    const running = engine ?? (await start());
    if (!running || !chorus) return setBusy("");
    transport.current ??= await Transport.load(running.ctx, id);
    const fromS = Math.max(0, chorus.t0 - 1);
    const at = running.ctx.currentTime + Transport.LEAD_S + 0.05;
    transport.current.play({ fromS, toS: chorus.t1 + 0.4, at, semitones: choice.trackShift, backingGain: 0.5 });
    playGuide(
      running.ctx,
      chorus.notes.map((note) => ({ t: note.t - fromS, d: note.d, midi: targetMidi(note.midi, choice) })),
      at,
    );
    setBusy("");
  }

  async function togglePerformed(step: string) {
    const next = performed.includes(step) ? performed.filter((s) => s !== step) : [...performed, step];
    await setSetting(`performed:${id}`, next);
    reload();
  }

  async function use(choice: KeyChoice) {
    await saveSongSettings({
      songId: id,
      trackShift: choice.trackShift,
      octaveDrop: choice.octaveDrop,
      backingGain: settings?.backingGain ?? 0.5,
    });
    await setSetting("currentSong", id);
    transport.current?.stop();
    setChoosing(false);
    reload();
  }

  return (
    <div className="pt-12">
      <p className="text-sm text-mist">{pkg.manifest.artist}</p>
      <h1 className={`mt-3 ${headlineClass}`}>{pkg.manifest.title}</h1>
      {settings && !choosing && (
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link
            to={`/songs/${id}/practice`}
            state={{ autostart: true }}
            onClick={() => void start()}
            className={`inline-block ${buttonClass}`}
          >
            Practice this song
          </Link>
          <Link to={`/songs/${id}/take`} className={quietButtonClass}>
            Record a run-through
          </Link>
          <Link to={`/songs/${id}/edit`} className={quietButtonClass}>
            Edit notes
          </Link>
        </div>
      )}

      <div className="mt-12">
        <section className={sectionClass}>
          <h2 className="text-sm font-medium">Key</h2>
          {settings && !choosing ? (
            <div className="space-y-3">
              <p>{describeKey(settings)}.</p>
              <button onClick={() => setChoosing(true)} className={quietButtonClass}>
                Change key
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <p className="max-w-prose text-sm text-mist">
                Three ways to fit this song to your range, best first. Hear each one, then pick the one that feels
                easiest at its highest point.
              </p>
              <ol className="space-y-6">
                {choices.map((choice, i) => {
                  const label = `${choice.trackShift}/${choice.octaveDrop}`;
                  return (
                    <li key={label} className="space-y-1.5">
                      <p>{describeKey(choice)}</p>
                      <p className="text-sm text-mist">{describeFit(choice)}.</p>
                      <div className="flex items-center gap-5 pt-1">
                        <button onClick={() => void use(choice)} className={i === 0 ? buttonClass : quietButtonClass}>
                          Use this key
                        </button>
                        <button onClick={() => void hear(choice)} disabled={busy !== ""} className={quietButtonClass}>
                          {busy === label ? "Loading" : "Hear it"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>

        <section className={sectionClass}>
          <h2 className="text-sm font-medium">Progress</h2>
          <MasteryMap phrases={phrases} progress={progress} songId={id} />
        </section>

        <section className={sectionClass}>
          <h2 className="text-sm font-medium">Run-throughs</h2>
          <div className="space-y-2 text-sm">
            <p>
              {ready.ready
                ? "Ready to perform: three good run-throughs on three different days."
                : `${ready.goodDays} of ${ready.daysNeeded} days with a run-through at 90% in tune or better.`}
            </p>
            <p className="tabular-nums text-mist">
              {ready.bestPct === null ? "No scored run-through yet." : `Best so far: ${Math.round(ready.bestPct)}% in tune.`}
            </p>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-sm font-medium">Performing it</h2>
          <div className="space-y-3">
            <p className="max-w-prose text-sm text-mist">
              Singing for people is its own skill. Work up to it in this order, and tick each one off when it is done.
            </p>
            <ol className="space-y-2 text-sm">
              {PERFORMING_STEPS.map((step) => (
                <li key={step.id}>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={performed.includes(step.id)}
                      onChange={() => void togglePerformed(step.id)}
                      className="accent-chalk"
                    />
                    <span className={performed.includes(step.id) ? "text-mist line-through" : ""}>{step.label}</span>
                  </label>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {pkg.manifest.lyricsNeedReview && (
          <section className={sectionClass}>
            <h2 className="text-sm font-medium">Lyrics</h2>
            <p className="max-w-prose text-sm text-signal">
              The lyrics were transcribed from the audio and will contain mistakes. Check them in the note editor.
            </p>
          </section>
        )}

        <SongStorage songId={id} className={sectionClass} onRemoving={() => transport.current?.stop()} />
      </div>
    </div>
  );
}
