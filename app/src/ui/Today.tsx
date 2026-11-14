import { useEffect, useState } from "react";
import { Link } from "react-router";
import { midiToName } from "../dsp/music";
import { LEVEL_NAMES, type RangeProfile } from "../practice/exercises";
import { daysPracticed } from "../practice/history";
import { MODE_NAMES, type Skill } from "../practice/ladder";
import { attemptsSince, getSetting, loadProfile, loadSkill, sessionsSince, setSetting } from "../store/db";
import { useEngine } from "./engine";
import { buttonClass, headlineClass, quietButtonClass } from "./lab/styles";

type Summary = { profile: RangeProfile | null; skill: Skill; days: number; minutes: number };

const LENGTHS = [5, 30, 45];

export function Today() {
  const { start } = useEngine();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const weekAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000);
    weekAgo.setHours(0, 0, 0, 0);
    const since = weekAgo.toISOString();
    void Promise.all([
      loadProfile(),
      loadSkill(),
      attemptsSince(since),
      sessionsSince(since),
      getSetting("sessionMinutes", 30),
    ]).then(([profile, skill, attempts, sessions, minutes]) =>
      setSummary({ profile, skill, days: daysPracticed([...attempts, ...sessions].map((row) => row.at)), minutes }),
    );
  }, []);

  if (!summary) return null;
  const { profile, skill, days, minutes } = summary;

  if (!profile) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>Start by finding your range.</p>
        <p className="mt-3 max-w-lg text-mist">
          Two slides and a few spoken words, about a minute. Every exercise is then fitted to your voice.
        </p>
        <Link to="/range" className={`mt-8 inline-block ${buttonClass}`}>
          Find my range
        </Link>
      </div>
    );
  }

  function chooseLength(value: number) {
    void setSetting("sessionMinutes", value);
    setSummary((current) => current && { ...current, minutes: value });
  }

  const facts: [string, string][] = [
    ["Your range", `${midiToName(profile.comfortLow)} to ${midiToName(profile.comfortHigh)}`],
    ["Working on", LEVEL_NAMES[skill.level]],
    ["Feedback", MODE_NAMES[skill.mode]],
    ["Last seven days", `${days} of 5 days practiced`],
  ];

  return (
    <div className="pt-[18vh]">
      <p className={headlineClass}>Today's session is ready.</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* The click both turns the microphone on and opens the session, so practice starts in one step. */}
        <Link to="/session" onClick={() => void start()} className={`inline-block ${buttonClass}`}>
          Start today's session
        </Link>
        <div role="group" aria-label="Session length" className="flex items-baseline gap-4 text-sm">
          {LENGTHS.map((value) => (
            <button
              key={value}
              onClick={() => chooseLength(value)}
              aria-pressed={minutes === value}
              className={minutes === value ? "font-medium text-chalk" : quietButtonClass}
            >
              {value} minutes
            </button>
          ))}
        </div>
      </div>
      <p className="mt-6 flex gap-6">
        <Link to="/practice" state={{ autostart: true }} onClick={() => void start()} className={quietButtonClass}>
          Just pitch matching
        </Link>
        <Link to="/songs" className={quietButtonClass}>
          Songs
        </Link>
      </p>
      <dl className="mt-16 grid max-w-xl grid-cols-[10rem_1fr] gap-y-1.5 border-t border-rule pt-8 text-sm">
        {facts.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-mist">{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
