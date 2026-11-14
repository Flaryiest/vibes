import { useState } from "react";
import { runStretchCheck, type StretchResult } from "../../lab/stretchCheck";
import { Panel } from "./Panel";
import { buttonClass, cellClass, headCellClass, noteClass, tableClass } from "./styles";

const SETTINGS: [number, number][] = [
  [1, 0],
  [0.8, 0],
  [1, 3],
  [0.8, 3],
  [1, -4],
];

/** Lab check 7: does changing key and tempo keep the two tracks together and on the clock? */
export function StretchPanel() {
  const [results, setResults] = useState<StretchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function run() {
    setBusy(true);
    setProblem("");
    try {
      const found: StretchResult[] = [];
      for (const [rate, semitones] of SETTINGS) found.push(await runStretchCheck(rate, semitones));
      setResults(found);
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    }
    setBusy(false);
  }

  return (
    <Panel title="Key and tempo">
      <p className={noteClass}>
        Runs silently. Checks that a song's two tracks stay together when the key or speed is changed, and that sound
        comes out when the app expects it to.
      </p>
      <button onClick={run} disabled={busy} className={buttonClass}>
        {busy ? "Testing" : "Test key and tempo change"}
      </button>
      {problem && <p className="text-sm text-signal">{problem}</p>}
      {results.length > 0 && (
        <table data-testid="stretch-results" className={tableClass}>
          <thead>
            <tr>
              <th className={headCellClass}>Speed</th>
              <th className={headCellClass}>Key change</th>
              <th className={headCellClass}>Timing error</th>
              <th className={headCellClass}>Tracks in sync</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={`${r.rate}/${r.semitones}`}>
                <td className={cellClass}>{Math.round(r.rate * 100)}%</td>
                <td className={cellClass}>
                  {r.semitones === 0 ? "none" : `${r.semitones > 0 ? "+" : "−"}${Math.abs(r.semitones)} semitones`}
                </td>
                <td className={`${cellClass} ${r.worstTimingMs > 30 ? "text-signal" : ""}`}>
                  {Number.isFinite(r.worstTimingMs) ? `${r.worstTimingMs.toFixed(1)} ms` : "no sound"}
                </td>
                <td className={`${cellClass} ${r.worstSyncDifference > 1e-4 ? "text-signal" : ""}`}>
                  {r.worstSyncDifference <= 1e-4 ? "Yes" : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
