import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import type { AudioEngine } from "../audio/engine";
import { pickLatency, type CalibrationRun, type Route } from "../audio/latency";
import { midiToHz } from "../dsp/music";
import { toPcm16 } from "../dsp/resample";
import { noiseGate } from "../lab/measure";
import type { RangeProfile } from "../practice/exercises";
import type { RepView } from "../practice/repView";
import { runTake } from "../practice/take";
import { Transport } from "../playback/transport";
import { TAKE_TARGETS, describeTake, heardEnough, type TakeMetrics } from "../scoring/take";
import { lineAt, songLines } from "../song/lines";
import type { SongPackage } from "../song/types";
import { addTake, getSetting, pruneTakeAudio, setSetting, type SongSettings, takeAudio, takeIdsWithAudio, type TakeRow, takesFor } from "../store/db";
import { AudioGate } from "./AudioGate";
import { fakeMic } from "./engine";
import { loadJson } from "./lab/persist";
import { buttonClass, cellClass, headCellClass, headlineClass, quietButtonClass, tableClass } from "./lab/styles";
import { PracticeCanvas } from "./PracticeCanvas";
import { takeDate, takeFacts, takePercent } from "./takeText";
import { useSong } from "./useSong";

const MAX_GATE = 0.02;
/** Assumed headphone delay until a calibration has been run. */
const UNCALIBRATED_DELAY_S = 0.15;
/** Takes are stored at this rate: enough for a voice, a ninth of the size. */
const STORED_RATE = 16000;
/** How much of the song the canvas shows at once, seconds. */
const WINDOW_S = 8;

const sectionClass = "grid gap-x-10 gap-y-3 border-t border-rule py-8 md:grid-cols-[11rem_1fr]";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Seconds as minutes and seconds, e.g. "2:07". */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

type Phase = "ready" | "room" | "recording" | "scoring" | "result";
type Outcome = { metrics: TakeMetrics; scored: boolean; takeId: number | null };
type Takes = { rows: TakeRow[]; withAudio: Set<number> };
/** What is shown while the song plays: the lyric line, whether it has started, and how far in the take is. */
type Progress = { text: string; singing: boolean; time: string };

async function loadTakes(songId: string): Promise<Takes> {
  const rows = await takesFor(songId);
  return { rows, withAudio: new Set(await takeIdsWithAudio(rows.map((row) => row.id))) };
}

type SessionProps = {
  engine: AudioEngine;
  pkg: SongPackage;
  transport: Transport;
  profile: RangeProfile;
  settings: SongSettings;
  /** How the learner said they were listening the last time they were asked, on any screen. Null if never. */
  savedRoute: Route | null;
};

/** One figure of a result, set large, with what it counts and the target underneath. */
function Figure({ value, label, target, inTune = false }: { value: string; label: string; target: string; inTune?: boolean }) {
  return (
    <div>
      <p className={`text-3xl tabular-nums [font-stretch:87%] ${inTune ? "text-brass" : ""}`}>{value}</p>
      <p className="mt-1 text-sm">{label}</p>
      <p className="text-sm text-mist">{target}</p>
    </div>
  );
}

/** Records one run-through of the whole song with the pitch display hidden, then scores and stores it. */
export function TakeSession({ engine, pkg, transport, profile, settings, savedRoute }: SessionProps) {
  const songId = pkg.manifest.id;
  const lines = useMemo(() => songLines(pkg.notes), [pkg]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [route, setRoute] = useState<Route>(
    savedRoute ?? (engine.info.outputKind === "headphones" ? "headphones" : "speakers"),
  );
  const [capsule, setCapsule] = useState(false);
  const [view, setView] = useState<RepView | null>(null);
  const [progress, setProgress] = useState<Progress>({ text: "", singing: false, time: "" });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notice, setNotice] = useState("");
  const [takes, setTakes] = useState<Takes>({ rows: [], withAudio: new Set() });
  const [playing, setPlaying] = useState<number | null>(null);
  // Each run gets a number; a run stops as soon as it is no longer the latest.
  const session = useRef(0);
  const stopper = useRef<AbortController | null>(null);
  const player = useRef<{ source: AudioBufferSourceNode | null; request: number }>({ source: null, request: 0 });

  const calibrated = pickLatency(loadJson<CalibrationRun[]>("lab.calibrations", []), route);

  useEffect(() => {
    let current = true;
    void loadTakes(songId).then((loaded) => current && setTakes(loaded));
    return () => {
      current = false;
    };
  }, [songId]);

  // While the song plays, follow the lyric line and the time.
  useEffect(() => {
    if (phase !== "recording" || !view) return;
    const total = clock(view.endAt - view.startAt);
    let shown = "";
    const follow = () => {
      const now = engine.ctx.currentTime;
      const songTime = transport.songTimeAt(now);
      // Before the track starts the first line is already up, to be read ahead.
      const at = songTime !== null ? lineAt(lines, songTime) : now < view.startAt ? lineAt(lines, -Infinity) : null;
      const elapsed = Math.min(Math.max(0, now - view.startAt), view.endAt - view.startAt);
      const next = { text: at ? lines[at.index].text : "", singing: at?.singing ?? false, time: `${clock(elapsed)} of ${total}` };
      const key = JSON.stringify(next);
      if (key !== shown) setProgress(next);
      shown = key;
    };
    follow();
    const timer = setInterval(follow, 100);
    return () => clearInterval(timer);
  }, [phase, view, engine, transport, lines]);

  function chooseRoute(next: Route) {
    setRoute(next);
    void setSetting("route", next);
  }

  function stopPlayback() {
    player.current.request++;
    player.current.source?.stop();
    player.current.source = null;
    setPlaying(null);
  }

  async function play(take: TakeRow) {
    const wasPlaying = playing === take.id;
    stopPlayback();
    if (wasPlaying) return;
    const request = player.current.request;
    const audio = await takeAudio(take.id);
    // Something else was asked for while the recording loaded.
    if (player.current.request !== request || !audio || audio.pcm.byteLength < 2) return;
    const samples = new Int16Array(audio.pcm);
    const buffer = engine.ctx.createBuffer(1, samples.length, audio.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const source = engine.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(engine.ctx.destination);
    source.onended = () => {
      source.disconnect();
      if (player.current.source !== source) return;
      player.current.source = null;
      setPlaying(null);
    };
    source.start();
    player.current.source = source;
    setPlaying(take.id);
  }

  async function record() {
    const id = ++session.current;
    const alive = () => session.current === id;
    const stop = new AbortController();
    stopper.current = stop;
    const kind = capsule ? "capsule" : "run";
    stopPlayback();
    setNotice("");
    setOutcome(null);
    setView(null);
    setProgress({ text: "", singing: false, time: "" });

    let rmsMin = 0;
    if (!fakeMic) {
      setPhase("room");
      const levels: number[] = [];
      const unsubscribe = engine.onFrame((frame) => levels.push(frame.rms));
      await wait(1200);
      unsubscribe();
      if (!alive()) return;
      rmsMin = Math.min(noiseGate(levels), MAX_GATE);
      engine.setRmsGate(rmsMin);
    }

    setPhase("recording");
    const take = await runTake({
      engine,
      transport,
      notes: pkg.notes,
      settings,
      route,
      latencyS: route === "headphones" ? (calibrated ?? UNCALIBRATED_DELAY_S) : 0,
      slackS: route === "headphones" && calibrated !== null ? 0.15 : 0.3,
      band: {
        minHz: Math.max(55, midiToHz(profile.comfortLow - 14)),
        maxHz: Math.min(700, midiToHz(profile.comfortHigh + 14)),
      },
      rmsMin,
      signal: stop.signal,
      onScheduled: setView,
      onRecorded: () => alive() && setPhase("scoring"),
    });
    if (!alive()) return;
    if (take.aborted) {
      setNotice("Stopped. That take was not kept.");
      setPhase("ready");
      return;
    }

    let takeId: number | null = null;
    try {
      const { pctInTune, meanAbsCents, scoredNotes, totalNotes } = take.metrics;
      takeId = await addTake(
        {
          songId,
          at: new Date().toISOString(),
          kind,
          pctInTune,
          meanAbsCents,
          scoredNotes,
          totalNotes,
          key: { trackShift: settings.trackShift, octaveDrop: settings.octaveDrop },
          metrics: take.metrics,
        },
        { sampleRate: STORED_RATE, pcm: toPcm16(take.pcm, take.sampleRate, STORED_RATE).buffer },
      );
    } catch {
      // Most likely the browser's storage is full. The result is still shown, with a warning.
    }
    // Older recordings make room; scores are always kept.
    void pruneTakeAudio();
    const stored = await loadTakes(songId);
    if (!alive()) return;
    setTakes(stored);
    setOutcome({ metrics: take.metrics, scored: take.scored, takeId });
    setCapsule(false);
    setPhase("result");
  }

  useEffect(() => {
    const playback = player.current;
    return () => {
      session.current++;
      stopper.current?.abort();
      transport.stop();
      playback.request++;
      playback.source?.stop();
    };
  }, [transport]);

  const title = pkg.manifest.title;
  const headlines: Record<Phase, string> = {
    ready: "Sing the whole song through.",
    room: "Stay quiet for a moment.",
    recording: progress.text,
    scoring: "Scoring the take.",
    result: !outcome ? "" : outcome.scored ? describeTake(outcome.metrics) : "Recorded, but not scored.",
  };
  const routeNote =
    route === "speakers"
      ? "On speakers the track reaches the microphone, so the take is recorded but not scored."
      : calibrated === null
        ? "Headphones are not calibrated yet, so timing is judged loosely. Run the calibration in the audio lab."
        : `Calibrated: your headphones add ${Math.round(calibrated * 1000)} ms.`;
  const result = phase === "result" ? outcome : null;
  // While the song plays the headline is the lyric line: room is kept for two rows of words so the notes
  // below do not jump, and a line that has not started yet is dimmed, to be read ahead.
  const lyricClass = phase !== "recording" ? "" : `min-h-[2.5em] ${progress.singing ? "" : "text-mist"}`;

  return (
    <div className="pt-12">
      <p className="text-sm tabular-nums text-mist">
        {phase === "recording" ? `Recording, ${progress.time}` : `Run-through of ${title}`}
      </p>
      <p
        aria-live={phase === "recording" ? "off" : "polite"}
        data-testid="take-headline"
        className={`mt-3 ${headlineClass} ${lyricClass}`}
      >
        {headlines[phase]}
      </p>

      {phase === "ready" && (
        <>
          <p className="mt-4 max-w-prose text-mist">
            The backing track plays in your key, from just before the first line to the end. You see the notes and the
            words, but not your own pitch. Afterwards the take is scored and kept. A time capsule is a take set aside
            to compare with later ones.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-mist">Listening on</span>
            {(["headphones", "speakers"] as const).map((option) => (
              <button
                key={option}
                onClick={() => chooseRoute(option)}
                aria-pressed={route === option}
                className={route === option ? "font-medium text-chalk" : quietButtonClass}
              >
                {option === "headphones" ? "Headphones" : "Speakers"}
              </button>
            ))}
          </div>
          <p className="mt-2 max-w-prose text-sm text-mist">{routeNote}</p>
          <label className="mt-6 flex w-fit items-center gap-2.5 text-sm text-mist">
            <input
              type="checkbox"
              checked={capsule}
              onChange={(event) => setCapsule(event.target.checked)}
              className="accent-chalk"
            />
            Keep as a time capsule
          </label>
          <div className="mt-8 flex items-center gap-5">
            <button onClick={() => void record()} className={buttonClass}>
              Record a run-through
            </button>
            <Link to={`/songs/${songId}`} className={quietButtonClass}>
              Back to the song
            </Link>
          </div>
          {notice && <p className="mt-6 text-sm text-mist">{notice}</p>}
        </>
      )}

      {phase === "recording" && (
        <>
          <div className="mt-4">
            <PracticeCanvas engine={engine} view={view} showTrace={false} results={null} scrollS={WINDOW_S} />
          </div>
          <button onClick={() => stopper.current?.abort()} className={`mt-8 ${quietButtonClass}`}>
            Stop
          </button>
        </>
      )}

      {result && (
        <>
          {!result.scored ? (
            <p className="mt-4 max-w-prose text-mist">
              On speakers the backing track reaches the microphone, so the notes cannot be judged. Use headphones for a
              scored take.
            </p>
          ) : (
            <>
              {result.metrics.pctInTune !== null && result.metrics.meanAbsCents !== null && (
                <div className="mt-8 flex flex-wrap gap-x-16 gap-y-6">
                  <Figure
                    value={takePercent(result.metrics.pctInTune)}
                    label="of notes in tune"
                    target={`Target: ${TAKE_TARGETS.pctInTune}% or more`}
                    inTune={heardEnough(result.metrics) && result.metrics.pctInTune >= TAKE_TARGETS.pctInTune}
                  />
                  <Figure
                    value={`${Math.round(result.metrics.meanAbsCents)} cents`}
                    label="average error"
                    target={`Target: ${TAKE_TARGETS.meanAbsCents} cents or less`}
                  />
                </div>
              )}
              <table className={`mt-10 max-w-xl ${tableClass}`}>
                <thead>
                  <tr>
                    <th className={headCellClass}>Measure</th>
                    <th className={headCellClass}>This take</th>
                    <th className={headCellClass}>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {takeFacts(result.metrics).map((fact) => (
                    <tr key={fact.name}>
                      <td className={`${cellClass} text-mist`}>{fact.name}</td>
                      <td className={cellClass}>{fact.value}</td>
                      <td className={`${cellClass} text-mist`}>{fact.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {result.takeId === null && (
            <p className="mt-6 max-w-lg text-signal">
              This take could not be saved. The browser's storage for this page may be full.
            </p>
          )}
          <div className="mt-8 flex items-center gap-5">
            <button onClick={() => setPhase("ready")} className={buttonClass}>
              Record another
            </button>
            <Link to={`/songs/${songId}`} className={quietButtonClass}>
              Back to the song
            </Link>
          </div>
        </>
      )}

      {(phase === "ready" || phase === "result") && takes.rows.length > 0 && (
        <section className={`mt-12 ${sectionClass}`}>
          <h2 className="text-sm font-medium">Takes</h2>
          <ol aria-label="Takes" className="max-w-xl space-y-2 text-sm tabular-nums">
            {takes.rows.map((take) => {
              const marks = [
                take.id === outcome?.takeId && "this take",
                take.kind === "capsule" && "time capsule",
                // A score that rests on too few notes says so.
                take.pctInTune !== null && !heardEnough(take) && `${take.scoredNotes} of ${take.totalNotes} notes heard`,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={take.id} className="flex items-baseline gap-6">
                  <span className="w-28 shrink-0">{takeDate(take.at)}</span>
                  <span className={`w-28 shrink-0 ${take.pctInTune === null ? "text-mist" : ""}`}>
                    {takePercent(take.pctInTune)}
                    {take.pctInTune !== null && " in tune"}
                  </span>
                  <span className="grow text-mist">{marks.charAt(0).toUpperCase() + marks.slice(1)}</span>
                  {takes.withAudio.has(take.id) && (
                    <button
                      onClick={() => void play(take)}
                      aria-label={`${playing === take.id ? "Stop" : "Play"} the take from ${takeDate(take.at)}`}
                      className={quietButtonClass}
                    >
                      {playing === take.id ? "Stop" : "Play"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

/** Loads the song's audio. */
function useTransport(engine: AudioEngine, songId: string): { transport: Transport | null; error: string } {
  const [transport, setTransport] = useState<Transport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let loaded: Transport | null = null;
    let current = true;
    Transport.load(engine.ctx, songId).then(
      (created) => {
        loaded = created;
        if (current) setTransport(created);
        else created.dispose();
      },
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
    return () => {
      current = false;
      loaded?.dispose();
    };
  }, [engine, songId]);

  return { transport, error };
}

/** Loads what a take needs before it can start: the song's audio, and how the learner listens. */
export function TakeBlock(props: Omit<SessionProps, "transport" | "savedRoute">) {
  const { transport, error } = useTransport(props.engine, props.pkg.manifest.id);
  // Undefined until the stored choice has been read.
  const [savedRoute, setSavedRoute] = useState<Route | null | undefined>(undefined);

  useEffect(() => {
    void getSetting<Route | null>("route", null).then(setSavedRoute);
  }, []);

  if (error) return <p className="max-w-lg pt-[18vh] text-signal">{error}</p>;
  if (!transport || savedRoute === undefined) return <p className="pt-12 text-mist">Loading the song.</p>;
  return <TakeSession {...props} transport={transport} savedRoute={savedRoute} />;
}

/** The screen for a run-through take of one song. */
export function Take() {
  const { id = "" } = useParams();
  const { data, error } = useSong(id);

  if (error) return <p className="max-w-lg pt-[18vh] text-signal">{error}</p>;
  if (!data) return null;
  const { pkg, profile, settings } = data;
  if (!profile || !settings) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>Choose a key for this song first.</p>
        <Link to={`/songs/${id}`} className={`mt-8 inline-block ${buttonClass}`}>
          Set up the song
        </Link>
      </div>
    );
  }
  return (
    <AudioGate prompt={`Turn on the microphone to record ${pkg.manifest.title}.`}>
      {(engine) => <TakeBlock engine={engine} pkg={pkg} profile={profile} settings={settings} />}
    </AudioGate>
  );
}
