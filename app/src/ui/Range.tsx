import { useState } from "react";
import { useNavigate } from "react-router";
import type { AudioEngine } from "../audio/engine";
import { midiToName } from "../dsp/music";
import { trackPitch, type F0Track } from "../pitch/track";
import { buildProfile, highestHeld, lowestHeld, speakingPitch } from "../practice/rangeFinder";
import { saveProfile } from "../store/db";
import { AudioGate } from "./AudioGate";
import { PitchCanvas } from "./PitchCanvas";
import { buttonClass, headlineClass, quietButtonClass } from "./lab/styles";

const SECONDS = 6;
const BAND = { minHz: 55, maxHz: 700 };

type Step = { label: string; instruction: string; measure: (track: F0Track) => number | null };

const STEPS: Step[] = [
  {
    label: "Speaking voice",
    instruction: "Count out loud from ten down to one, in your normal voice.",
    measure: speakingPitch,
  },
  {
    label: "Lowest note",
    instruction: "On “ah”, slide down slowly to the lowest note that still sounds clear, and hold it.",
    measure: lowestHeld,
  },
  {
    label: "Highest note",
    instruction: "On “ah”, slide up slowly to the highest note that takes no effort, and hold it. Stop before it strains.",
    measure: highestHeld,
  },
];

function Finder({ engine }: { engine: AudioEngine }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<number[]>([]);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState("");

  const step: Step | undefined = STEPS[values.length];
  const outcome = values.length === STEPS.length ? buildProfile(values[0], values[1], values[2]) : null;
  const headline = step
    ? step.instruction
    : outcome === null
      ? ""
      : outcome.ok
        ? `${midiToName(outcome.profile.comfortLow)} to ${midiToName(outcome.profile.comfortHigh)}.`
        : outcome.reason;

  async function record() {
    if (!step) return;
    setProblem("");
    setRecording(true);
    const capture = engine.beginCapture();
    await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000));
    const { pcm, sampleRate } = capture.end();
    setRecording(false);
    // A strict clarity gate keeps breathy or creaky sound at the edges out of the measurement.
    const value = step.measure(trackPitch(pcm, sampleRate, BAND, { clarityMin: 0.8 }));
    if (value === null) setProblem("Didn't hear enough to measure. Try again, a little louder.");
    else setValues([...values, value]);
  }

  async function save() {
    if (!outcome?.ok) return;
    await saveProfile(outcome.profile);
    navigate("/");
  }

  function startOver() {
    setValues([]);
    setProblem("");
  }

  return (
    <div className="pt-12">
      <p className="text-sm text-mist">{step ? `Step ${values.length + 1} of ${STEPS.length}` : "Your range"}</p>
      <p className={`mt-3 min-h-[2.5em] ${headlineClass}`}>{headline}</p>
      <div className="mt-8 flex items-center gap-5">
        {step && (
          <button onClick={record} disabled={recording} className={buttonClass}>
            {recording ? "Recording" : `Record ${SECONDS} seconds`}
          </button>
        )}
        {outcome?.ok && (
          <button onClick={save} className={buttonClass}>
            Save range
          </button>
        )}
        {values.length > 0 && !recording && (
          <button onClick={startOver} className={quietButtonClass}>
            Start over
          </button>
        )}
      </div>
      {problem && <p className="mt-6 text-signal">{problem}</p>}
      <div className="mt-10">
        <PitchCanvas engine={engine} />
      </div>
      {values.length > 0 && (
        <dl className="mt-8 grid max-w-sm grid-cols-2 gap-y-1.5 text-sm">
          {values.map((value, i) => (
            <div key={STEPS[i].label} className="contents">
              <dt className="text-mist">{STEPS[i].label}</dt>
              <dd>{midiToName(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function Range() {
  return (
    <AudioGate prompt="Find the notes you can sing comfortably. It takes about a minute.">
      {(engine) => <Finder engine={engine} />}
    </AudioGate>
  );
}
