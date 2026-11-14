import { TAKE_TARGETS, type TakeMetrics } from "../scoring/take";

/** One measure of a take in words, with the target it is held against. */
export type TakeFact = { name: string; value: string; target: string };

const cents = (value: number): string => {
  const size = Math.round(Math.abs(value));
  return `${size} ${size === 1 ? "cent" : "cents"}`;
};

const orUnmeasured = (value: number | null, say: (value: number) => string): string =>
  value === null ? "Not measured" : say(value);

/** A whole percent. Anything short of 100 is never shown as 100. */
const percent = (value: number): string => `${Math.min(Math.round(value), value < 100 ? 99 : 100)}%`;

/** The share of notes in tune, for a take that may not have been scored. */
export const takePercent = (pctInTune: number | null): string =>
  pctInTune === null ? "Not scored" : percent(pctInTune);

/** When a take was made, e.g. "14 Nov, 09:41". */
export const takeDate = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Every measure of a take except the share in tune and the average error, which are shown large. */
export function takeFacts(metrics: TakeMetrics): TakeFact[] {
  const target = TAKE_TARGETS;
  return [
    {
      name: "Flat or sharp overall",
      value: orUnmeasured(metrics.biasCents, (bias) =>
        Math.round(bias) === 0 ? "Neither" : `${cents(bias)} ${bias < 0 ? "flat" : "sharp"}`,
      ),
      target: `Within ${target.biasCents} cents`,
    },
    {
      name: "Jumps between notes",
      value: orUnmeasured(metrics.intervalErrorCents, (error) => `${cents(error)} off`),
      target: `${target.intervalErrorCents} cents or less`,
    },
    {
      name: "Long notes, steadiness",
      value: orUnmeasured(metrics.steadinessCents, (spread) => `${cents(spread)} of waver`),
      target: `${target.steadinessCents} cents or less`,
    },
    {
      name: "Long notes, endings",
      value: orUnmeasured(metrics.endDriftCents, (drift) =>
        Math.round(drift) === 0 ? "Held" : `${drift < 0 ? "Sag" : "Rise"} of ${cents(drift)}`,
      ),
      target: `Sag of ${target.endSagCents} cents or less`,
    },
    {
      name: "Entries on time",
      value: orUnmeasured(metrics.onTimePct, percent),
      target: `${target.onTimePct}% or more`,
    },
    { name: "Notes heard", value: `${metrics.scoredNotes} of ${metrics.totalNotes}`, target: "" },
  ];
}
