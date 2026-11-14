/**
 * What the practice canvas draws for one repetition. All times are seconds on
 * the audio clock; note and curve times are measured from the start of the
 * part they belong to.
 */
export type RepView = {
  startAt: number;
  endAt: number;
  /** When the model plays, or null when there is nothing to listen to first. */
  listenAt: number | null;
  /** When the learner sings, or null for a listen-only repetition. */
  singAt: number | null;
  notes: { id: number; t: number; d: number; midi: number; text?: string }[];
  /** The original singer's pitch, drawn while listening. */
  curve?: { t: number; midi: number }[];
};
