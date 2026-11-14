import type { AudioEngine } from "../audio/engine";
import type { Band } from "../pitch/bandMpm";
import { trackPitch } from "../pitch/track";
import { playGuide } from "../playback/guide";
import { isSuccess, scoreResponse, type NoteResult } from "../scoring/notes";
import type { Exercise } from "./exercises";

/** When each part of a repetition happens, in seconds on the audio clock. */
export type Repetition = { exercise: Exercise; listenAt: number; singAt: number; endAt: number };

export type RepetitionResult = {
  repetition: Repetition;
  notes: NoteResult[];
  offsetS: number;
  success: boolean | null;
};

const START_DELAY_S = 0.25;
/** Silence between the guide and the response, so the guide has died away before the microphone is scored. */
const GAP_S = 0.5;
const TAIL_S = 0.35;
const PRE_ROLL_S = 0.35;
/** A learner following a visual cue may start late; this much is forgiven. */
const MAX_SHIFT_S = 0.3;

/** Listen first, then sing the same thing back, with nothing playing during the response. */
export function scheduleRepetition(now: number, exercise: Exercise): Repetition {
  const listenAt = now + START_DELAY_S;
  const singAt = listenAt + exercise.lengthS + GAP_S;
  return { exercise, listenAt, singAt, endAt: singAt + exercise.lengthS + TAIL_S };
}

const until = (ctx: AudioContext, time: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, time - ctx.currentTime) * 1000));

/** Plays the guide, records the response and scores it. */
export async function runRepetition(
  engine: AudioEngine,
  exercise: Exercise,
  options: { band: Band; rmsMin?: number; onScheduled?: (repetition: Repetition) => void },
): Promise<RepetitionResult> {
  const ctx = engine.ctx;
  const repetition = scheduleRepetition(ctx.currentTime, exercise);
  playGuide(ctx, exercise.notes, repetition.listenAt);
  options.onScheduled?.(repetition);

  await until(ctx, repetition.singAt - PRE_ROLL_S);
  const capture = engine.beginCapture();
  await until(ctx, repetition.endAt);
  const { pcm, sampleRate, startFrame } = capture.end();

  // Put the targets on the recording's own time axis.
  const recordingStart = startFrame / sampleRate;
  const track = trackPitch(pcm, sampleRate, options.band, { rmsMin: options.rmsMin });
  const targets = exercise.notes.map((note) => ({ ...note, t: note.t + repetition.singAt - recordingStart }));
  const { offsetS, notes } = scoreResponse(track, targets, MAX_SHIFT_S);
  return { repetition, notes, offsetS, success: isSuccess(notes) };
}
