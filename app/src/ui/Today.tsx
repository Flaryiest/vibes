import { useEffect, useState } from "react";
import { Link } from "react-router";
import { midiToName } from "../dsp/music";
import { LEVEL_NAMES, type RangeProfile } from "../practice/exercises";
import { daysPracticed } from "../practice/history";
import { MODE_NAMES, type Skill } from "../practice/ladder";
import { attemptsSince, loadProfile, loadSkill } from "../store/db";
import { useEngine } from "./engine";
import { buttonClass, headlineClass } from "./lab/styles";

type Summary = { profile: RangeProfile | null; skill: Skill; days: number };

export function Today() {
  const { start } = useEngine();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const weekAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000);
    weekAgo.setHours(0, 0, 0, 0);
    void Promise.all([loadProfile(), loadSkill(), attemptsSince(weekAgo.toISOString())]).then(
      ([profile, skill, attempts]) => setSummary({ profile, skill, days: daysPracticed(attempts.map((a) => a.at)) }),
    );
  }, []);

  if (!summary) return null;
  const { profile, skill, days } = summary;

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

  const facts: [string, string][] = [
    ["Your range", `${midiToName(profile.comfortLow)} to ${midiToName(profile.comfortHigh)}`],
    ["Working on", LEVEL_NAMES[skill.level]],
    ["Feedback", MODE_NAMES[skill.mode]],
    ["Last seven days", `${days} ${days === 1 ? "day" : "days"} practiced`],
  ];

  return (
    <div className="pt-[18vh]">
      <p className={headlineClass}>Ten minutes of pitch matching.</p>
      {/* The click both turns the microphone on and opens the session, so practice starts in one step. */}
      <Link
        to="/practice"
        state={{ autostart: true }}
        onClick={() => void start()}
        className={`mt-8 inline-block ${buttonClass}`}
      >
        Start practice
      </Link>
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
