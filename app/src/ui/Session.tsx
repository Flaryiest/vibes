import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { AudioEngine } from "../audio/engine";
import type { RangeProfile } from "../practice/exercises";
import type { Skill } from "../practice/ladder";
import type { PhraseProgress } from "../practice/phraseLadder";
import { planSession, type Block } from "../practice/planner";
import { loadIndex, loadPackage } from "../song/package";
import type { SongPackage } from "../song/types";
import {
  addSession,
  backupToDisk,
  getSetting,
  loadPhraseProgress,
  loadProfile,
  loadSkill,
  loadSongSettings,
  pitchChecks,
  sessionsSince,
  type SongSettings,
  type Throat,
} from "../store/db";
import { AudioGate } from "./AudioGate";
import { buttonClass, headlineClass, quietButtonClass } from "./lab/styles";
import { SongPractice } from "./PhrasePractice";
import { Drill } from "./Practice";
import { CheckIn } from "./session/CheckIn";
import { Rest } from "./session/Rest";
import { WarmUp } from "./session/WarmUp";

/** "?speed=60" runs every part sixty times faster, for the end-to-end test. */
const speed = Number(new URLSearchParams(location.search).get("speed") ?? 1) || 1;

type SongInPlan = { pkg: SongPackage; settings: SongSettings; progress: PhraseProgress[] };
type Loaded = { profile: RangeProfile | null; skill: Skill; blocks: Block[]; note: string; song: SongInPlan | null };

/** The song being worked on: the one last set up, or else the first that has a key. */
async function currentSong(): Promise<SongInPlan | null> {
  const index = await loadIndex();
  const preferred = await getSetting<string | null>("currentSong", null);
  const ids = [...index.map((song) => song.id)].sort((a, b) => Number(b === preferred) - Number(a === preferred));
  for (const id of ids) {
    const settings = await loadSongSettings(id);
    if (!settings) continue;
    try {
      return { pkg: await loadPackage(id), settings, progress: await loadPhraseProgress(id) };
    } catch {
      // A damaged package is skipped here; the Songs screen says what is wrong with it.
    }
  }
  return null;
}

function Runner({ engine, loaded }: { engine: AudioEngine; loaded: Loaded & { profile: RangeProfile } }) {
  const { blocks, profile, skill, song } = loaded;
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const startedAt = useRef(Date.now());
  const next = () => setIndex((i) => i + 1);

  async function save(effort: number | null, throat: Throat | null) {
    const minutes = Math.max(1, Math.round(((Date.now() - startedAt.current) / 60000) * speed));
    await addSession({ at: new Date().toISOString(), minutes, effort, throat });
    setSaved(await backupToDisk());
    next();
  }

  if (index >= blocks.length) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>Session saved.</p>
        <p className="mt-3 max-w-prose text-mist">
          {saved ? "A backup was written to disk." : "It is stored in this browser. No backup was written, because the local server is not running."}
        </p>
        <Link to="/" className={`mt-8 inline-block ${buttonClass}`}>
          Back to today
        </Link>
      </div>
    );
  }

  const block = blocks[index];
  const seconds = (block.minutes * 60) / speed;
  return (
    <div>
      <div className="flex items-baseline justify-between pt-10 text-sm text-mist">
        <span data-testid="session-part">
          Part {index + 1} of {blocks.length}: {block.title.toLowerCase()}
        </span>
        {block.kind !== "checkin" && (
          <button onClick={next} className={quietButtonClass}>
            Skip this part
          </button>
        )}
      </div>
      {/* The key makes each part start fresh. */}
      <div key={index}>
        {block.kind === "warmup" && <WarmUp engine={engine} seconds={seconds} onDone={next} />}
        {block.kind === "foundation" && (
          <Drill engine={engine} profile={profile} startSkill={skill} autostart budgetS={seconds} onDone={next} />
        )}
        {block.kind === "rest" && <Rest seconds={seconds} onDone={next} />}
        {block.kind === "song" && song && (
          <SongPractice
            engine={engine}
            pkg={song.pkg}
            profile={profile}
            settings={song.settings}
            startProgress={song.progress}
            autostart
            budgetS={seconds}
            onDone={next}
          />
        )}
        {block.kind === "checkin" && <CheckIn onSave={(effort, throat) => void save(effort, throat)} />}
      </div>
    </div>
  );
}

/** Today's session: every part in order, with nothing to decide. */
export function Session() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    void (async () => {
      const [profile, skill, song, checks, sessions, minutes] = await Promise.all([
        loadProfile(),
        loadSkill(),
        currentSong(),
        pitchChecks(),
        sessionsSince(new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()),
        getSetting("sessionMinutes", 30),
      ]);
      const last = sessions.sort((a, b) => a.at.localeCompare(b.at)).at(-1);
      const plan = planSession({
        minutes,
        pitchCheckPct: checks.at(-1)?.pctInTune ?? null,
        hasSong: song !== null,
        // Scored run-throughs are recorded from the song's own screen.
        canRunThrough: false,
        lastThroat: last?.throat ?? null,
      });
      setLoaded({ profile, skill, song, blocks: plan.blocks, note: plan.note });
    })();
  }, []);

  if (!loaded) return null;
  const { profile } = loaded;
  if (!profile) {
    return (
      <div className="pt-[18vh]">
        <p className={headlineClass}>Start by finding your range.</p>
        <Link to="/range" className={`mt-8 inline-block ${buttonClass}`}>
          Find my range
        </Link>
      </div>
    );
  }
  const prompt = loaded.note || "Turn on the microphone to start today's session.";
  return <AudioGate prompt={prompt}>{(engine) => <Runner engine={engine} loaded={{ ...loaded, profile }} />}</AudioGate>;
}
