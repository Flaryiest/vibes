import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { midiToName } from "../dsp/music";
import type { PhraseProgress } from "../practice/phraseLadder";
import { CALIBRATION_RUNS, fourWeeksBack } from "../practice/pitchCheck";
import { loadIndex, loadPackage } from "../song/package";
import { buildPhrases, type Phrase } from "../song/phrases";
import type { SongIndexEntry } from "../song/types";
import {
  attemptsSince,
  db,
  loadPhraseProgress,
  pitchChecks,
  rangeChecks,
  sessionsSince,
  takeAudio,
  takesFor,
  type PitchCheckRow,
  type RangeCheckRow,
  type TakeRow,
} from "../store/db";
import { Panel } from "./lab/Panel";
import { cellClass, headCellClass, headlineClass, noteClass, quietButtonClass } from "./lab/styles";
import { MasteryMap } from "./MasteryMap";
import { Sparkline } from "./Sparkline";

const DAYS_GOAL = 5;

type Day = { date: Date; practiced: boolean };
type SongProgress = {
  song: SongIndexEntry;
  /** Null when the song's package could not be read; `problem` then says why. */
  phrases: Phrase[] | null;
  problem: string;
  progress: PhraseProgress[];
  takes: TakeRow[];
  /** The takes whose recording is still kept. */
  withAudio: Set<number>;
};
type Data = { days: Day[]; checks: PitchCheckRow[]; songs: SongProgress[]; ranges: RangeCheckRow[] };

const longDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const percent = (value: number) => `${Math.round(value)}%`;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function loadSong(song: SongIndexEntry): Promise<SongProgress> {
  const [phrases, progress, takes] = await Promise.all([
    loadPackage(song.id).then(
      (pkg) => buildPhrases(pkg.notes),
      (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
    ),
    loadPhraseProgress(song.id),
    takesFor(song.id),
  ]);
  // Only the keys are read, so no recording is loaded until it is played.
  const kept = await db.takeAudio.where("takeId").anyOf(takes.map((take) => take.id)).primaryKeys();
  const broken = typeof phrases === "string";
  return { song, phrases: broken ? null : phrases, problem: broken ? phrases : "", progress, takes, withAudio: new Set(kept) };
}

async function load(): Promise<Data> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const since = start.toISOString();
  const [attempts, sessions, checks, ranges, index] = await Promise.all([
    attemptsSince(since),
    sessionsSince(since),
    pitchChecks(),
    rangeChecks(),
    loadIndex().catch((): SongIndexEntry[] => []),
  ]);
  const practiced = new Set([...attempts, ...sessions].map((row) => new Date(row.at).toDateString()));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return { date, practiced: practiced.has(date.toDateString()) };
  });
  return { days, checks, songs: await Promise.all(index.map(loadSong)), ranges: ranges.reverse() };
}

/** Plays one recorded take at a time. The audio context is made inside the click, which is what lets sound start. */
function useTakePlayer() {
  const [playing, setPlaying] = useState<number | null>(null);
  // Each play gets a number; a recording that finishes loading after it was stopped is dropped.
  const turn = useRef(0);
  const context = useRef<AudioContext | null>(null);

  function stop() {
    turn.current++;
    void context.current?.close();
    context.current = null;
    setPlaying(null);
  }

  async function play(takeId: number) {
    stop();
    const mine = ++turn.current;
    const ctx = new AudioContext();
    context.current = ctx;
    setPlaying(takeId);
    try {
      const audio = await takeAudio(takeId);
      if (turn.current !== mine) return;
      if (!audio) return stop();
      const samples = new Int16Array(audio.pcm);
      const buffer = ctx.createBuffer(1, Math.max(1, samples.length), audio.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (turn.current === mine) stop();
      };
      source.start();
    } catch {
      if (turn.current === mine) stop();
    }
  }

  useEffect(
    () => () => {
      turn.current++;
      void context.current?.close();
    },
    [],
  );

  return { playing, play, stop };
}

function Week({ days }: { days: Day[] }) {
  const practiced = days.filter((day) => day.practiced).length;
  return (
    <>
      <ol aria-label="Practice on each of the last seven days" className="flex gap-3">
        {days.map((day) => (
          <li key={day.date.toDateString()} className="flex w-5 flex-col items-center gap-2">
            <span
              data-practiced={day.practiced}
              className={`h-3.5 w-3.5 rounded-full ${day.practiced ? "bg-chalk" : "border border-rule"}`}
            />
            <span aria-hidden="true" className="text-xs text-mist">
              {day.date.toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
            <span className="sr-only">
              {day.date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}:{" "}
              {day.practiced ? "practiced" : "no practice"}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm tabular-nums">
        {count(practiced, "day", "days")} practiced.{" "}
        <span className="text-mist">
          {practiced >= DAYS_GOAL ? `That meets the goal of ${DAYS_GOAL}.` : `The goal is ${DAYS_GOAL}.`}
        </span>
      </p>
    </>
  );
}

function Checks({ checks }: { checks: PitchCheckRow[] }) {
  const latest = checks.at(-1);
  if (!latest) {
    return (
      <>
        <p className={noteClass}>
          No pitch checks yet. The check takes about two minutes: sixteen exercises sung once each with your pitch
          hidden. Its result is the number the rest of your practice is measured against.
        </p>
        <Link to="/check" className={quietButtonClass}>
          Run the first pitch check
        </Link>
      </>
    );
  }

  const earlier = fourWeeksBack(checks);
  const change = earlier ? Math.round(latest.pctInTune) - Math.round(earlier.pctInTune) : 0;
  const values = checks.map((check) => check.pctInTune);
  // The scale starts at half, or lower when a check fell below it, so it rarely moves.
  const floor = Math.min(50, Math.floor(Math.min(...values) / 10) * 10);
  return (
    <>
      <div>
        <p className="text-2xl tabular-nums [font-stretch:87%]">
          {percent(latest.pctInTune)} <span className="text-base text-mist [font-stretch:100%]">of notes in tune</span>
        </p>
        {earlier && (
          <p className="mt-1 text-sm tabular-nums text-mist">
            {change === 0
              ? "The same as"
              : `${change > 0 ? "Up" : "Down"} ${count(Math.abs(change), "point", "points")} since`}{" "}
            {longDay(earlier.at)}.
          </p>
        )}
      </div>
      {checks.length > 1 ? (
        <Sparkline
          values={values}
          min={floor}
          max={100}
          format={percent}
          labels={checks.map((check) => `${shortDay(check.at)}: ${percent(check.pctInTune)}`)}
          title="Pitch check results"
          desc={`${checks.length} checks from ${longDay(checks[0].at)} to ${longDay(latest.at)}. The first was ${percent(checks[0].pctInTune)} in tune and the latest ${percent(latest.pctInTune)}. The line is the median of each check and the two before it.`}
        />
      ) : (
        <p className={noteClass}>The trend appears after the second check.</p>
      )}
      <p className="text-sm tabular-nums text-mist">
        Last check {longDay(latest.at)}, average error {Math.round(latest.meanAbsCents)} cents.
        {checks.length <= CALIBRATION_RUNS && ` Calibration run ${checks.length} of ${CALIBRATION_RUNS}.`}
      </p>
      <Link to="/check" className={quietButtonClass}>
        Run a pitch check
      </Link>
    </>
  );
}

function Takes({ takes, withAudio, player }: Pick<SongProgress, "takes" | "withAudio"> & { player: ReturnType<typeof useTakePlayer> }) {
  if (takes.length === 0) return <p className={noteClass}>No recorded takes yet.</p>;
  return (
    <table className="text-left text-sm tabular-nums">
      <thead>
        <tr>
          <th className={headCellClass}>Take</th>
          <th className={headCellClass}>In tune</th>
          <th className={headCellClass}>
            <span className="sr-only">Kind</span>
          </th>
          <th className={headCellClass}>
            <span className="sr-only">Recording</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {takes.map((take) => (
          <tr key={take.id}>
            <td className={cellClass}>{shortDay(take.at)}</td>
            <td className={cellClass}>
              {take.pctInTune === null ? <span className="text-mist">Not scored</span> : percent(take.pctInTune)}
            </td>
            <td className={`${cellClass} text-mist`}>{take.kind === "capsule" ? "Time capsule" : ""}</td>
            <td className={cellClass}>
              {withAudio.has(take.id) && (
                <button
                  onClick={() => (player.playing === take.id ? player.stop() : void player.play(take.id))}
                  aria-label={`${player.playing === take.id ? "Stop" : "Play"} the take from ${longDay(take.at)}`}
                  className={quietButtonClass}
                >
                  {player.playing === take.id ? "Stop" : "Play"}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Songs({ songs }: { songs: SongProgress[] }) {
  const player = useTakePlayer();
  if (songs.length === 0) {
    return (
      <>
        <p className={noteClass}>No songs imported yet.</p>
        <Link to="/songs" className={quietButtonClass}>
          See how to import one
        </Link>
      </>
    );
  }
  return (
    <ul className="space-y-10">
      {songs.map(({ song, phrases, problem, progress, takes, withAudio }) => (
        <li key={song.id} className="space-y-4">
          <h3 className="text-lg">
            <Link to={`/songs/${song.id}`} className="underline-offset-4 hover:underline">
              {song.title}
            </Link>
          </h3>
          {phrases ? (
            <MasteryMap phrases={phrases} progress={progress} songId={song.id} />
          ) : (
            <p className="max-w-prose text-sm text-signal">{problem}</p>
          )}
          <Takes takes={takes} withAudio={withAudio} player={player} />
        </li>
      ))}
    </ul>
  );
}

function Ranges({ ranges }: { ranges: RangeCheckRow[] }) {
  if (ranges.length === 0) {
    return (
      <>
        <p className={noteClass}>No range measured yet.</p>
        <Link to="/range" className={quietButtonClass}>
          Find my range
        </Link>
      </>
    );
  }
  return (
    <table className="text-left text-sm tabular-nums">
      <thead>
        <tr>
          <th className={headCellClass}>Measured</th>
          <th className={headCellClass}>Comfortable range</th>
        </tr>
      </thead>
      <tbody>
        {ranges.map((range) => (
          <tr key={range.id}>
            <td className={cellClass}>{shortDay(range.at)}</td>
            <td className={cellClass}>
              {midiToName(range.comfortLow)} to {midiToName(range.comfortHigh)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Progress() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let current = true;
    void load().then((loaded) => {
      if (current) setData(loaded);
    });
    return () => {
      current = false;
    };
  }, []);

  if (!data) return null;
  return (
    <div className="pt-12">
      <h1 className={headlineClass}>Your progress</h1>
      <div className="mt-12">
        <Panel title="Last seven days">
          <Week days={data.days} />
        </Panel>
        <Panel title="Pitch check">
          <Checks checks={data.checks} />
        </Panel>
        <Panel title="Songs">
          <Songs songs={data.songs} />
        </Panel>
        <Panel title="Range">
          <Ranges ranges={data.ranges} />
        </Panel>
      </div>
    </div>
  );
}
