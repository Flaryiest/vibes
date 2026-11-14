import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { AudioEngine } from "../audio/engine";
import { midiToHz } from "../dsp/music";
import { noiseGate } from "../lab/measure";
import type { RangeProfile } from "../practice/exercises";
import { CALIBRATION_RUNS, checkExercises, summarizeCheck, type CheckSummary } from "../practice/pitchCheck";
import { repetitionView, runRepetition, type Repetition } from "../practice/repetition";
import type { NoteResult } from "../scoring/notes";
import { addPitchCheck, loadProfile, pitchChecks } from "../store/db";
import { AudioGate } from "./AudioGate";
import { fakeMic } from "./engine";
import { PracticeCanvas } from "./PracticeCanvas";
import { buttonClass, headlineClass, noteClass, quietButtonClass } from "./lab/styles";

/** "?fixed=45" pins every exercise to one note, for the end-to-end test. */
const fixedNote = new URLSearchParams(location.search).get("fixed");
/** The loudness gate never rises above this, so a noisy room reading cannot silence the singer. */
const MAX_GATE = 0.02;
/** A breath between one exercise and the next. */
const BREATH_MS = 600;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Phase = "ready" | "room" | "listen" | "sing" | "rest" | "done";
/** `run` is this check's place among the saved ones, or null when it was not saved. */
type Outcome = { summary: CheckSummary; run: number | null; saveFailed: boolean };

function Check({ engine, profile }: { engine: AudioEngine; profile: RangeProfile }) {
  const exercises = useMemo(() => checkExercises(profile), [profile]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [position, setPosition] = useState(1);
  const [repetition, setRepetition] = useState<Repetition | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Each run gets a number; a run stops as soon as it is no longer the latest.
  const session = useRef(0);

  async function run() {
    const id = ++session.current;
    const alive = () => session.current === id;

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
    // Wide enough to recognize a note sung an octave away from the target.
    const band = {
      minHz: Math.max(55, midiToHz(profile.comfortLow - 14)),
      maxHz: Math.min(700, midiToHz(profile.comfortHigh + 14)),
    };

    // Every exercise is heard once and sung once. Nothing is shown and nothing is repeated.
    const heard: NoteResult[] = [];
    for (const [index, exercise] of exercises.entries()) {
      setPosition(index + 1);
      const result = await runRepetition(engine, exercise, {
        band,
        rmsMin,
        onScheduled: (scheduled) => {
          setRepetition(scheduled);
          setPhase("listen");
          const untilSinging = (scheduled.singAt - engine.ctx.currentTime) * 1000;
          setTimeout(() => {
            if (alive()) setPhase("sing");
          }, untilSinging);
        },
      });
      if (!alive()) return;
      heard.push(...result.notes);
      setPhase("rest");
      await wait(BREATH_MS);
      if (!alive()) return;
    }

    const summary = summarizeCheck(heard);
    let saved: number | null = null;
    let saveFailed = false;
    if (summary.reliable) {
      try {
        await addPitchCheck({
          at: new Date().toISOString(),
          pctInTune: summary.pctInTune,
          meanAbsCents: summary.meanAbsCents,
          notes: summary.scored,
        });
        saved = (await pitchChecks()).length;
      } catch {
        saveFailed = true;
      }
    }
    if (!alive()) return;
    setOutcome({ summary, run: saved, saveFailed });
    setPhase("done");
  }

  function stop() {
    session.current++;
    setPhase("ready");
  }

  useEffect(
    () => () => {
      session.current++;
    },
    [],
  );

  const active = phase === "listen" || phase === "sing" || phase === "rest";
  const summary = outcome?.summary;
  const reliable = phase === "done" && summary?.reliable === true;
  const calibration = reliable && outcome?.run != null && outcome.run <= CALIBRATION_RUNS;

  let headline = "";
  if (phase === "ready") headline = "A two-minute pitch check.";
  if (phase === "room") headline = "Stay quiet for a moment.";
  if (phase === "listen") headline = "Listen";
  if (phase === "sing") headline = "Sing";
  if (phase === "done" && summary) {
    headline = summary.reliable ? `${Math.round(summary.pctInTune)}% in tune.` : "Too little was heard to score this check.";
  }

  return (
    <div className="pt-12">
      <p className="text-sm tabular-nums text-mist">
        {active
          ? `Exercise ${position} of ${exercises.length}`
          : calibration
            ? `Calibration run ${outcome?.run} of ${CALIBRATION_RUNS}`
            : "Pitch check"}
      </p>
      <p aria-live="polite" data-testid="check-headline" className={`mt-3 min-h-[2.5em] tabular-nums ${headlineClass}`}>
        {headline}
      </p>

      {phase === "ready" && (
        <>
          <p className="max-w-prose text-mist">
            Ten single notes, then six four-note patterns. You hear each one, then sing it back once as the line
            crosses the second set of bars. Your pitch is not shown and nothing is repeated. The check is the same
            every time, so each result can be set against the last.
          </p>
          <button onClick={run} className={`mt-8 ${buttonClass}`}>
            Start the pitch check
          </button>
        </>
      )}

      {active && (
        <>
          <PracticeCanvas engine={engine} view={repetition && repetitionView(repetition)} showTrace={false} results={null} />
          <div className="mt-6 flex justify-end">
            <button onClick={stop} className={quietButtonClass}>
              Stop the check
            </button>
          </div>
        </>
      )}

      {phase === "done" && summary && reliable && (
        <>
          <p className="tabular-nums text-mist">
            Average error {Math.round(summary.meanAbsCents)} cents. {summary.scored} of {summary.total} notes heard.
          </p>
          {outcome?.saveFailed && (
            <p className="mt-3 max-w-prose text-signal">This result could not be saved, so it will not appear in your progress.</p>
          )}
          <div className={`mt-8 space-y-3 ${noteClass}`}>
            {calibration && (
              <p>The first two checks are calibration runs. They mostly show you getting used to the check itself.</p>
            )}
            <p>
              For orientation: on the research protocol this check is modeled on, adults without lessons averaged 68%
              of notes in tune and adults with lessons 87%. The comparison is approximate.
            </p>
          </div>
          <div className="mt-8 flex items-center gap-5">
            <Link to="/progress" className={buttonClass}>
              See your progress
            </Link>
            <Link to="/" className={quietButtonClass}>
              Back to today
            </Link>
          </div>
        </>
      )}

      {phase === "done" && summary && !reliable && (
        <>
          <p className="max-w-prose tabular-nums text-signal">
            {summary.scored} of {summary.total} notes came through clearly, so nothing was saved. Sing a little louder
            or move closer to the microphone, then run it again.
          </p>
          <div className="mt-8 flex items-center gap-5">
            <button onClick={run} className={buttonClass}>
              Run the check again
            </button>
            <Link to="/" className={quietButtonClass}>
              Back to today
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export function PitchCheck() {
  const [loaded, setLoaded] = useState<{ profile: RangeProfile | null } | null>(null);

  useEffect(() => {
    if (fixedNote) {
      const midi = Number(fixedNote);
      setLoaded({ profile: { speakingMidi: midi, comfortLow: midi, comfortHigh: midi } });
      return;
    }
    void loadProfile().then((profile) => setLoaded({ profile }));
  }, []);

  if (!loaded) return null;
  const { profile } = loaded;
  if (!profile) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>Find your range before the pitch check.</p>
        <p className="mt-3 max-w-lg text-mist">The check uses the notes you can sing comfortably.</p>
        <Link to="/range" className={`mt-8 inline-block ${buttonClass}`}>
          Find my range
        </Link>
      </div>
    );
  }
  return (
    <AudioGate prompt="Turn on the microphone for the pitch check.">
      {(engine) => <Check engine={engine} profile={profile} />}
    </AudioGate>
  );
}
