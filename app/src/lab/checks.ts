export type CheckId = 1 | 2 | 3 | 4 | 5 | 6;

export type CheckDef = { id: CheckId; title: string; pass: string; ifFail: string };

/** Checks 1-6 of build phase 0 in the spec. Checks 7 and 8 belong to the songs plan. */
export const CHECKS: CheckDef[] = [
  {
    id: 1,
    title: "Processing flags read back as off in Chrome",
    pass: "Echo cancellation, noise suppression and automatic gain control are all false",
    ifFail: "Warn in the app; investigate",
  },
  {
    id: 2,
    title: "With AirPods connected and the built-in microphone pinned, playback stays full quality",
    pass: "No audible change; the microphone label is the built-in one",
    ifFail: "Revisit the pinning steps",
  },
  {
    id: 3,
    title: "Calibration repeatability on each route, and again after 20 minutes",
    pass: "Spread under 5 ms; drift under 10 ms",
    ifFail: "Recalibrate each session; widen the timing tolerance",
  },
  {
    id: 4,
    title: "Lowest held notes tracked by the 2048 window, the 4096 window and SwiftF0",
    pass: "Octave errors under 2% of voiced frames",
    ifFail: "Use the 4096 window for the live line; narrow the band to the learner's range",
  },
  {
    id: 5,
    title: "Microphone signal at 65-130 Hz",
    pass: "At least two of the first three harmonics are 15 dB or more above the noise between them",
    ifFail: "Recommend a headset microphone for the lowest notes",
  },
  {
    id: 6,
    title: "Speaker leakage: backing playing, nobody singing",
    pass: "Under 5% of frames read as voiced",
    ifFail: "Keep the speaker rule in spec section 5.3",
  },
];

export type CheckResult = {
  id: CheckId;
  status: "pass" | "fail";
  value: string;
  decision: string;
  at: string;
};

export function upsert(results: CheckResult[], result: CheckResult): CheckResult[] {
  return [...results.filter((r) => r.id !== result.id), result].sort((a, b) => a.id - b.id);
}

export function allDecided(results: CheckResult[]): boolean {
  return CHECKS.every((check) => results.some((r) => r.id === check.id && r.decision.trim() !== ""));
}

export function exportResults(results: CheckResult[], machine: string): string {
  const checks = CHECKS.map((check) => ({ ...check, result: results.find((r) => r.id === check.id) ?? null }));
  return JSON.stringify({ machine, exportedAt: new Date().toISOString(), checks }, null, 2);
}
