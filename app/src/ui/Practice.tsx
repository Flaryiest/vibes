import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import type { AudioEngine } from "../audio/engine";
import { midiToHz } from "../dsp/music";
import { noiseGate } from "../lab/measure";
import { LEVEL_NAMES, makeExercise, type RangeProfile } from "../practice/exercises";
import { MODE_NAMES, initialSkill, recordAttempt, type Skill } from "../practice/ladder";
import { runRepetition, type Repetition } from "../practice/repetition";
import { describeResult } from "../scoring/feedback";
import type { NoteResult } from "../scoring/notes";
import { addAttempt, loadProfile, loadSkill, saveSkill } from "../store/db";
import { AudioGate } from "./AudioGate";
import { fakeMic } from "./engine";
import { PracticeCanvas } from "./PracticeCanvas";
import { buttonClass, headlineClass, quietButtonClass } from "./lab/styles";

/** "?fixed=45" pins every exercise to one note, for the end-to-end test. */
const fixedNote = new URLSearchParams(location.search).get("fixed");
const SESSION_S = 10 * 60;
const MAX_TRIES = 3;
/** The loudness gate never rises above this, so a noisy room reading cannot silence the singer. */
const MAX_GATE = 0.02;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Phase = "ready" | "room" | "listen" | "sing" | "result" | "done";
type Tally = { exercises: number; firstTry: number };

const summarize = (tally: Tally) =>
  `${tally.exercises} ${tally.exercises === 1 ? "exercise" : "exercises"}, ${tally.firstTry} right first time`;

function Drill({
  engine,
  profile,
  startSkill,
  autostart,
}: {
  engine: AudioEngine;
  profile: RangeProfile;
  startSkill: Skill;
  autostart: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [skill, setSkill] = useState(startSkill);
  const [repetition, setRepetition] = useState<Repetition | null>(null);
  const [results, setResults] = useState<NoteResult[] | null>(null);
  const [message, setMessage] = useState("");
  const [tally, setTally] = useState<Tally>({ exercises: 0, firstTry: 0 });
  // Each run gets a number; a run stops as soon as it is no longer the latest.
  const session = useRef(0);

  async function run() {
    const id = ++session.current;
    const alive = () => session.current === id;
    await wait(0);
    if (!alive()) return;

    setTally({ exercises: 0, firstTry: 0 });
    let current = skill;
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
    const startedAt = Date.now();
    let exercise = makeExercise(current.level, profile);
    let tries = 1;

    while (alive()) {
      setResults(null);
      const outcome = await runRepetition(engine, exercise, {
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

      let text = describeResult(outcome.notes);
      void addAttempt({
        at: new Date().toISOString(),
        level: exercise.level,
        mode: current.mode,
        targets: exercise.notes.map((note) => note.midi),
        results: outcome.notes,
        firstTry: tries === 1,
        success: outcome.success,
      });
      // Only the first try at an exercise counts toward moving up or down.
      if (tries === 1 && outcome.success !== null) {
        const hit = outcome.success;
        const next = recordAttempt(current, hit);
        current = next.skill;
        void saveSkill(current);
        setSkill(current);
        setTally((t) => ({ exercises: t.exercises + 1, firstTry: t.firstTry + (hit ? 1 : 0) }));
        if (next.change === "up") text += " Moving up a step.";
        if (next.change === "down") text += " Stepping back to make it easier.";
      }
      setResults(outcome.notes);
      setMessage(text);
      setPhase("result");
      await wait(outcome.success ? 1500 : 2400);
      if (!alive()) return;
      if ((Date.now() - startedAt) / 1000 >= SESSION_S) break;

      // A missed exercise is repeated, up to three tries, before moving on.
      if (outcome.success === true || tries >= MAX_TRIES) {
        exercise = makeExercise(current.level, profile);
        tries = 1;
      } else {
        tries++;
      }
    }
    if (alive()) setPhase("done");
  }

  function finish() {
    session.current++;
    setPhase("done");
  }

  useEffect(() => {
    if (autostart) void run();
    return () => {
      session.current++;
    };
    // Runs once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = phase === "listen" || phase === "sing" || phase === "result";
  const headlines: Record<Phase, string> = {
    ready: "Ten minutes of pitch matching.",
    room: "Stay quiet for a moment.",
    listen: "Listen",
    sing: "Sing",
    result: message,
    done: "Done for now.",
  };
  const showTrace = skill.mode === "live" || (skill.mode === "after" && phase === "result");

  return (
    <div className="pt-12">
      <p className="text-sm text-mist">
        {LEVEL_NAMES[skill.level]}. {MODE_NAMES[skill.mode]}.
      </p>
      <p aria-live="polite" data-testid="practice-headline" className={`mt-3 min-h-[2.5em] ${headlineClass}`}>
        {headlines[phase]}
      </p>

      {phase === "ready" && (
        <>
          <p className="max-w-prose text-mist">
            You hear a note, then sing it back as the line crosses the second bar. Each one is scored as soon as you
            finish.
          </p>
          <button onClick={run} className={`mt-8 ${buttonClass}`}>
            Start practice
          </button>
        </>
      )}

      {active && (
        <>
          <PracticeCanvas
            engine={engine}
            repetition={repetition}
            showTrace={showTrace}
            results={phase === "result" ? results : null}
          />
          <div className="mt-6 flex items-center justify-between text-sm text-mist">
            <span className="tabular-nums">{summarize(tally)}</span>
            <button onClick={finish} className={quietButtonClass}>
              Finish
            </button>
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <p className="tabular-nums text-mist">{summarize(tally)}.</p>
          <div className="mt-8 flex items-center gap-5">
            <button onClick={run} className={buttonClass}>
              Practice again
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

export function Practice() {
  const autostart = Boolean((useLocation().state as { autostart?: boolean } | null)?.autostart);
  const [loaded, setLoaded] = useState<{ profile: RangeProfile | null; skill: Skill } | null>(null);

  useEffect(() => {
    if (fixedNote) {
      const midi = Number(fixedNote);
      setLoaded({ profile: { speakingMidi: midi, comfortLow: midi, comfortHigh: midi }, skill: initialSkill() });
      return;
    }
    void Promise.all([loadProfile(), loadSkill()]).then(([profile, skill]) => setLoaded({ profile, skill }));
  }, []);

  if (!loaded) return null;
  const { profile, skill } = loaded;
  if (!profile) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>Find your range before practicing.</p>
        <p className="mt-3 max-w-lg text-mist">Exercises are fitted to the notes you can sing comfortably.</p>
        <Link to="/range" className={`mt-8 inline-block ${buttonClass}`}>
          Find my range
        </Link>
      </div>
    );
  }
  return (
    <AudioGate prompt="Turn on the microphone to practice.">
      {(engine) => <Drill engine={engine} profile={profile} startSkill={skill} autostart={autostart} />}
    </AudioGate>
  );
}
