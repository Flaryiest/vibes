import { classifyOutput } from "./devices";

/** How the learner is listening. It decides whether anything may play while they sing. */
export type Route = "headphones" | "speakers";

export type CalibrationRun = { at: string; route: string; roundTripMs: number | null; accepted: boolean };

/**
 * The most recent accepted calibration for this kind of route, in seconds, or
 * null when there is none. `route` labels look like "AirPods Pro | MacBook Pro Microphone".
 */
export function pickLatency(runs: CalibrationRun[], route: Route): number | null {
  const matching = runs.filter((run) => {
    if (!run.accepted || run.roundTripMs === null) return false;
    const kind = classifyOutput(run.route.split(" | ")[0]);
    return kind === route || (kind === "unknown" && route === "speakers");
  });
  if (matching.length === 0) return null;
  const latest = matching.reduce((a, b) => (b.at > a.at ? b : a));
  return latest.roundTripMs! / 1000;
}
