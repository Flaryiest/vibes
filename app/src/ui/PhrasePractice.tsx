import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import type { AudioEngine } from "../audio/engine";
import { pickLatency, type CalibrationRun, type Route } from "../audio/latency";
import { midiToHz } from "../dsp/music";
import { noiseGate } from "../lab/measure";
import type { Exercise, RangeProfile } from "../practice/exercises";
import { STEPS, advance, markSticky, newProgress, stateOf, type PhraseProgress } from "../practice/phraseLadder";
import { runPhraseRep } from "../practice/phraseRep";
import { repetitionView, runRepetition } from "../practice/repetition";
import type { RepView } from "../practice/repView";
import { Transport } from "../playback/transport";
import { describeResult } from "../scoring/feedback";
import type { NoteResult } from "../scoring/notes";
import { targetMidi } from "../song/key";
import { buildPhrases, practiceOrder, type Phrase } from "../song/phrases";
import type { SongPackage } from "../song/types";
import { getSetting, savePhraseProgress, setSetting, type SongSettings } from "../store/db";
import { AudioGate } from "./AudioGate";
import { fakeMic } from "./engine";
import { loadJson } from "./lab/persist";
import { buttonClass, headlineClass, quietButtonClass } from "./lab/styles";
import { MasteryMap } from "./MasteryMap";
import { PracticeCanvas } from "./PracticeCanvas";
import { useSong } from "./useSong";

const SESSION_S = 12 * 60;
/** Longest stretch on one phrase before rotating to another. */
const ROTATE_S = 180;
const DRILL_LIMIT_S = 90;
const MAX_GATE = 0.02;
/** Assumed headphone delay until a calibration has been run. */
const UNCALIBRATED_DELAY_S = 0.15;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Today's local calendar day, e.g. "2026-11-14". */
const today = () => new Date().toLocaleDateString("en-CA");

type Phase = "ready" | "room" | "listen" | "sing" | "result" | "done";

type SessionProps = {
  engine: AudioEngine;
  pkg: SongPackage;
  transport: Transport;
  profile: RangeProfile;
  settings: SongSettings;
  startProgress: PhraseProgress[];
  autostart: boolean;
  /** How long to practice, seconds. */
  budgetS?: number;
  /** Called once the session ends, by time or by the learner. */
  onDone?: () => void;
};

/** Works through a song's phrases on the seven-step ladder, rotating between up to three of them. */
export function PhraseSession(props: SessionProps) {
  const { engine, pkg, transport, profile, settings, autostart, budgetS = SESSION_S, onDone } = props;
  const songId = pkg.manifest.id;
  const phrases = useMemo(() => buildPhrases(pkg.notes), [pkg]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [view, setView] = useState<RepView | null>(null);
  const [results, setResults] = useState<NoteResult[] | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [message, setMessage] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [label, setLabel] = useState({ step: "", words: "" });
  const [progress, setProgress] = useState(props.startProgress);
  const [route, setRoute] = useState<Route>(engine.info.outputKind === "headphones" ? "headphones" : "speakers");
  // Each run gets a number; a run stops as soon as it is no longer the latest.
  const session = useRef(0);

  const calibrated = pickLatency(loadJson<CalibrationRun[]>("lab.calibrations", []), route);

  useEffect(() => {
    void getSetting<Route | null>("route", null).then((saved) => saved && setRoute(saved));
  }, []);

  function chooseRoute(next: Route) {
    setRoute(next);
    void setSetting("route", next);
  }

  async function run() {
    const id = ++session.current;
    const alive = () => session.current === id;
    await wait(0);
    if (!alive()) return;

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
    const band = {
      minHz: Math.max(55, midiToHz(profile.comfortLow - 14)),
      maxHz: Math.min(700, midiToHz(profile.comfortHigh + 14)),
    };
    const latencyS = route === "headphones" ? (calibrated ?? UNCALIBRATED_DELAY_S) : 0;
    const slackS = route === "headphones" && calibrated !== null ? 0.15 : 0.3;
    const map = new Map(progress.map((p) => [p.group, p]));
    const order = practiceOrder(phrases);
    const startedAt = Date.now();
    const elapsedS = () => (Date.now() - startedAt) / 1000;

    const store = (next: PhraseProgress) => {
      map.set(next.group, next);
      setProgress([...map.values()]);
      void savePhraseProgress(next);
    };
    const follow = (scheduled: RepView) => {
      setView(scheduled);
      setPhase(scheduled.listenAt !== null ? "listen" : "sing");
      if (scheduled.listenAt !== null && scheduled.singAt !== null) {
        const untilSinging = (scheduled.singAt - engine.ctx.currentTime) * 1000;
        setTimeout(() => {
          if (alive()) setPhase("sing");
        }, untilSinging);
      }
    };

    /** The error rule: a note that keeps going wrong is practiced as a bare jump until it is right three times running. */
    const drill = async (phrase: Phrase, noteId: number, current: PhraseProgress): Promise<PhraseProgress> => {
      const index = phrase.notes.findIndex((note) => note.id === noteId);
      const pair = phrase.notes.slice(Math.max(0, index - 1), index + 1);
      const exercise: Exercise = {
        level: 3,
        notes: pair.map((note, i) => ({ id: i, t: 0.3 + i, d: 1, midi: targetMidi(note.midi, settings) })),
        lengthS: 0.3 + pair.length + 0.2,
      };
      setLabel({ step: "Just this jump, until it is right three times", words: pair.map((n) => n.text).join(" ") });
      setSpeaking(false);
      const drillStartedAt = Date.now();
      let streak = 0;
      while (alive() && streak < 3 && (Date.now() - drillStartedAt) / 1000 < DRILL_LIMIT_S) {
        setResults(null);
        setShowTrace(true);
        const rep = await runRepetition(engine, exercise, {
          band,
          rmsMin,
          onScheduled: (scheduled) => follow(repetitionView(scheduled)),
        });
        if (!alive()) return current;
        streak = rep.success ? streak + 1 : 0;
        setResults(rep.notes);
        setMessage(describeResult(rep.notes));
        setPhase("result");
        await wait(1400);
      }
      return streak >= 3 ? current : markSticky(current, noteId);
    };

    let turn = 0;
    while (alive() && elapsedS() < budgetS) {
      const open = order.filter((p) => stateOf(map.get(p.group) ?? newProgress(songId, p.group)) !== "solid");
      const pool = (open.length > 0 ? open : order).slice(0, 3);
      const phrase = pool[turn % pool.length];
      turn++;
      let current = map.get(phrase.group) ?? newProgress(songId, phrase.group);
      const phraseStartedAt = Date.now();

      while (alive() && elapsedS() < budgetS && (Date.now() - phraseStartedAt) / 1000 < ROTATE_S) {
        const step = current.step;
        const info = STEPS[step];
        setLabel({ step: `Step ${step} of 7: ${info.name.toLowerCase()}`, words: phrase.text });
        setSpeaking(!info.scored);
        setResults(null);
        setShowTrace(info.display === "live");
        const rep = await runPhraseRep({
          engine,
          transport,
          phrase,
          step,
          key: settings,
          backingGain: settings.backingGain,
          route,
          latencyS,
          slackS,
          band,
          rmsMin,
          f0: pkg.f0,
          onScheduled: follow,
        });
        if (!alive()) return;

        const outcome = advance(current, { clean: rep.clean, results: rep.notes, today: today() });
        current = outcome.progress;
        store(current);
        if (info.scored) {
          let text = describeResult(rep.notes);
          if (outcome.event === "stepUp") text += ` Next: ${STEPS[current.step].name.toLowerCase()}.`;
          if (outcome.event === "clean") text += " This phrase is clean for today.";
          if (outcome.event === "solid") text += " This phrase is solid.";
          setResults(rep.notes);
          setShowTrace(info.display !== "blind");
          setMessage(text);
          setPhase("result");
          await wait(rep.clean ? 1600 : 2400);
        } else {
          await wait(400);
        }
        if (!alive()) return;

        if (outcome.drillNoteId !== null) {
          current = await drill(phrase, outcome.drillNoteId, current);
          if (!alive()) return;
          store(current);
        }
        if (outcome.event === "clean" || outcome.event === "solid") break;
      }
    }
    if (alive()) {
      transport.stop();
      setPhase("done");
      onDone?.();
    }
  }

  function finish() {
    session.current++;
    transport.stop();
    setPhase("done");
    onDone?.();
  }

  useEffect(() => {
    if (autostart) void run();
    return () => {
      session.current++;
      transport.stop();
    };
    // Runs once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = phase === "listen" || phase === "sing" || phase === "result";
  const headlines: Record<Phase, string> = {
    ready: pkg.manifest.title,
    room: "Stay quiet for a moment.",
    listen: "Listen",
    sing: speaking ? "Speak" : "Sing",
    result: message,
    done: "Done for now.",
  };

  return (
    <div className="pt-12">
      <p className="text-sm text-mist">{active ? label.step : pkg.manifest.artist}</p>
      <p aria-live="polite" data-testid="practice-headline" className={`mt-3 min-h-[2.5em] ${headlineClass}`}>
        {headlines[phase]}
      </p>

      {phase === "ready" && (
        <>
          <p className="max-w-prose text-mist">
            One line at a time: you hear it, then sing it back. Each line climbs from listening, through slow singing,
            to singing it with nothing to follow.
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
          <p className="mt-2 max-w-prose text-sm text-mist">
            {route === "speakers"
              ? "On speakers the track goes silent while you sing, so the microphone hears only you."
              : calibrated === null
                ? "Headphones are not calibrated yet, so timing is judged loosely. Run the calibration in the audio lab."
                : `Calibrated: your headphones add ${Math.round(calibrated * 1000)} ms.`}
          </p>
          <button onClick={run} className={`mt-8 ${buttonClass}`}>
            Start
          </button>
        </>
      )}

      {active && (
        <>
          <p className="min-h-[1.5em] text-mist">{label.words}</p>
          <div className="mt-4">
            <PracticeCanvas
              engine={engine}
              view={view}
              showTrace={showTrace}
              results={phase === "result" ? results : null}
            />
          </div>
          <div className="mt-8 flex items-end justify-between gap-6">
            <MasteryMap phrases={phrases} progress={progress} songId={songId} />
            <button onClick={finish} className={quietButtonClass}>
              Finish
            </button>
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <MasteryMap phrases={phrases} progress={progress} songId={songId} />
          <div className="mt-8 flex items-center gap-5">
            <button onClick={run} className={buttonClass}>
              Keep practicing
            </button>
            <Link to={`/songs/${songId}`} className={quietButtonClass}>
              Back to the song
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/** Loads the song's audio, then runs the session. */
function WithTransport(props: Omit<SessionProps, "transport">) {
  const [transport, setTransport] = useState<Transport | null>(null);
  const [error, setError] = useState("");
  const songId = props.pkg.manifest.id;

  useEffect(() => {
    let loaded: Transport | null = null;
    let current = true;
    Transport.load(props.engine.ctx, songId).then(
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
  }, [props.engine, songId]);

  if (error) return <p className="max-w-lg pt-[18vh] text-signal">{error}</p>;
  if (!transport) return <p className="pt-12 text-mist">Loading the song.</p>;
  return <PhraseSession {...props} transport={transport} />;
}

export function PhrasePractice() {
  const { id = "" } = useParams();
  const autostart = Boolean((useLocation().state as { autostart?: boolean } | null)?.autostart);
  const { data, error } = useSong(id);

  if (error) return <p className="max-w-lg pt-[18vh] text-signal">{error}</p>;
  if (!data) return null;
  const { pkg, profile, settings, progress } = data;
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
    <AudioGate prompt={`Turn on the microphone to practice ${pkg.manifest.title}.`}>
      {(engine) => (
        <WithTransport
          engine={engine}
          pkg={pkg}
          profile={profile}
          settings={settings}
          startProgress={progress}
          autostart={autostart}
        />
      )}
    </AudioGate>
  );
}
