import type { Throat } from "../store/db";

export type BlockKind = "warmup" | "foundation" | "rest" | "song" | "runthrough" | "checkin";

export type Block = { kind: BlockKind; minutes: number; title: string };

export type PlanInput = {
  /** Session length the learner chose. */
  minutes: number;
  /** Latest pitch check result, or null when none has been taken. */
  pitchCheckPct: number | null;
  /** A song is imported and has a key chosen. */
  hasSong: boolean;
  /** A scored run-through is possible: some of the song is learned and the learner is on headphones. */
  canRunThrough: boolean;
  /** How the throat felt after the previous session. */
  lastThroat: Throat | null;
};

const TITLES: Record<BlockKind, string> = {
  warmup: "Warm-up",
  foundation: "Pitch matching",
  rest: "Rest",
  song: "Song work",
  runthrough: "Run-through",
  checkin: "Check-in",
};

const block = (kind: BlockKind, minutes: number): Block => ({ kind, minutes, title: TITLES[kind] });

/**
 * Builds today's session. Pitch matching shrinks as the pitch check improves
 * (8 minutes under 80%, 4 from 80 to 90, 2 above), and the time goes to the
 * song instead. A hoarse throat last time means humming only.
 */
export function planSession(input: PlanInput): { blocks: Block[]; note: string } {
  if (input.lastThroat === "hoarse") {
    return {
      blocks: [block("warmup", 3), block("checkin", 1)],
      note: "Your throat was hoarse last time, so today is gentle humming only. If it lasts three weeks, see a doctor.",
    };
  }
  if (input.minutes <= 10) {
    const rest = Math.max(1, input.minutes - 2);
    return { blocks: [block("warmup", 2), block(input.hasSong ? "song" : "foundation", rest)], note: "" };
  }

  const pct = input.pitchCheckPct;
  const foundation = pct === null || pct < 80 ? 8 : pct < 90 ? 4 : 2;
  if (!input.hasSong) {
    return {
      blocks: [block("warmup", 4), block("foundation", Math.max(foundation, input.minutes - 5)), block("checkin", 1)],
      note: "",
    };
  }
  const runthrough = input.canRunThrough ? 4 : 0;
  const song = Math.max(5, input.minutes - 4 - foundation - 1 - runthrough - 1);
  const blocks = [block("warmup", 4), block("foundation", foundation), block("rest", 1), block("song", song)];
  if (runthrough > 0) blocks.push(block("runthrough", runthrough));
  blocks.push(block("checkin", 1));
  return { blocks, note: "" };
}
