import { useState } from "react";
import { runCalibration, type CalibrationResult } from "../../audio/calibration";
import { routeKey } from "../../audio/devices";
import type { AudioEngine, EngineInfo } from "../../audio/engine";
import { Panel } from "./Panel";
import { loadJson, saveJson } from "./persist";
import {
  buttonClass,
  cellClass,
  headCellClass,
  noteClass,
  quietButtonClass,
  tableClass,
  wrapCellClass,
} from "./styles";

type Run = { at: string; route: string; roundTripMs: number | null; spreadMs: number | null; accepted: boolean };

const KEY = "lab.calibrations";
const ms = (value: number | null) => (value === null ? "–" : `${value.toFixed(1)} ms`);

export function CalibrationPanel({ engine, info }: { engine: AudioEngine; info: EngineInfo }) {
  const [runs, setRuns] = useState<Run[]>(() => loadJson<Run[]>(KEY, []));
  const [last, setLast] = useState<CalibrationResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const result = await runCalibration(engine);
    const next: Run[] = [
      ...runs,
      {
        at: new Date().toISOString(),
        route: routeKey(info.outputLabel, info.micLabel),
        roundTripMs: result.roundTripMs,
        spreadMs: result.spreadMs,
        accepted: result.accepted,
      },
    ];
    saveJson(KEY, next);
    setRuns(next);
    setLast(result);
    setBusy(false);
  }

  function clear() {
    saveJson(KEY, []);
    setRuns([]);
    setLast(null);
  }

  return (
    <Panel title="Calibration">
      <p className={noteClass}>
        Measures how long sound takes to leave the speakers or headphones and come back through the microphone. With
        headphones, hold one earbud against the microphone. Eight chirps play over about six seconds.
      </p>
      <div className="flex items-center gap-5">
        <button onClick={run} disabled={busy} className={buttonClass}>
          {busy ? "Measuring" : "Run calibration"}
        </button>
        {runs.length > 0 && (
          <button onClick={clear} disabled={busy} className={quietButtonClass}>
            Clear history
          </button>
        )}
      </div>

      {last && (
        <div>
          <p className="pb-2 text-sm text-mist">Each chirp: delay in ms, and how well it matched (1.00 is perfect)</p>
          <ol className="grid grid-cols-4 gap-x-6 gap-y-3 text-sm tabular-nums sm:grid-cols-8">
            {last.chirps.map((chirp, i) => (
              <li key={i}>
                <span className="block">{chirp.delayMs.toFixed(1)}</span>
                <span className={`block ${chirp.score < 0.3 ? "text-signal" : "text-mist"}`}>
                  {Number.isFinite(chirp.score) ? chirp.score.toFixed(2) : "–"}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {runs.length > 0 && (
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={headCellClass}>Time</th>
              <th className={headCellClass}>Route</th>
              <th className={headCellClass}>Round trip</th>
              <th className={headCellClass}>Spread</th>
              <th className={headCellClass}>Accepted</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.at}>
                <td className={cellClass}>{new Date(r.at).toLocaleTimeString()}</td>
                <td className={wrapCellClass}>{r.route}</td>
                <td className={cellClass}>{ms(r.roundTripMs)}</td>
                <td className={cellClass}>{ms(r.spreadMs)}</td>
                <td className={`${cellClass} ${r.accepted ? "" : "text-signal"}`}>{r.accepted ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
