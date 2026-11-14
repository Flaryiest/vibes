import { useState } from "react";
import type { AudioEngine, Capture } from "../../audio/engine";
import { describePitch } from "../../dsp/music";
import { encodeWav } from "../../dsp/wav";
import { analyzeSustained, harmonicSnrDb, type DetectorStats } from "../../lab/clipAnalysis";
import { Panel } from "./Panel";
import { download } from "./persist";
import { buttonClass, cellClass, headCellClass, noteClass, quietButtonClass, tableClass } from "./styles";

const BAND = { minHz: 55, maxHz: 700 };
const SECONDS = 5;

export function ClipPanel({ engine }: { engine: AudioEngine }) {
  const [busy, setBusy] = useState(false);
  const [clip, setClip] = useState<Capture | null>(null);
  const [stats, setStats] = useState<DetectorStats[]>([]);
  const [snr, setSnr] = useState<number[]>([]);

  async function record() {
    setBusy(true);
    const capture = engine.beginCapture();
    await new Promise((resolve) => setTimeout(resolve, SECONDS * 1000));
    const recorded = capture.end();
    const results = [2048, 4096].map((size) => analyzeSustained(recorded.pcm, recorded.sampleRate, size, BAND));
    const f0 = results[1].medianHz;
    setClip(recorded);
    setStats(results);
    setSnr(f0 === null ? [] : harmonicSnrDb(recorded.pcm, recorded.sampleRate, f0));
    setBusy(false);
  }

  function save() {
    if (!clip) return;
    const f0 = stats[1]?.medianHz ?? null;
    const note = f0 === null ? "unvoiced" : describePitch(f0).name.replace("♯", "s");
    download(`low-note-${note}-${Date.now()}.wav`, encodeWav(clip.pcm, clip.sampleRate), "audio/wav");
  }

  return (
    <Panel title="Held note">
      <p className={noteClass}>
        Press record, then hold one note on "ah" for the full {SECONDS} seconds. Start with your lowest comfortable
        note.
      </p>
      <div className="flex items-center gap-5">
        <button onClick={record} disabled={busy} className={buttonClass}>
          {busy ? "Recording" : `Record ${SECONDS} seconds`}
        </button>
        {clip && (
          <button onClick={save} disabled={busy} className={quietButtonClass}>
            Save as WAV
          </button>
        )}
      </div>

      {stats.length > 0 && (
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={headCellClass}>Window</th>
              <th className={headCellClass}>Voiced</th>
              <th className={headCellClass}>Median</th>
              <th className={headCellClass}>Octave errors</th>
              <th className={headCellClass}>Spread</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.windowSize}>
                <td className={cellClass}>{s.windowSize} samples</td>
                <td className={cellClass}>{s.voicedPct.toFixed(0)}%</td>
                <td className={cellClass}>
                  {s.medianHz === null ? "–" : `${describePitch(s.medianHz).name}, ${s.medianHz.toFixed(1)} Hz`}
                </td>
                <td className={`${cellClass} ${s.octaveErrorPct >= 2 ? "text-signal" : ""}`}>
                  {s.octaveErrorPct.toFixed(2)}%
                </td>
                <td className={cellClass}>{s.spreadCents === null ? "–" : `${s.spreadCents.toFixed(0)} cents`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {snr.length > 0 && (
        <div>
          <p className="pb-2 text-sm text-mist">
            How far each harmonic of the note stands above the noise, lowest first
          </p>
          <ol className="flex gap-6 text-sm tabular-nums">
            {snr.map((db, i) => (
              <li key={i} className={db < 15 ? "text-signal" : ""}>
                {db.toFixed(0)} dB
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}
