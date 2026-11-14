import type { AudioEngine } from "../audio/engine";
import type { Route } from "../audio/latency";
import type { Band } from "../pitch/bandMpm";
import { trackPitchInSlices } from "../pitch/track";
import { Transport } from "../playback/transport";
import { scoreResponse, type NoteResult, type TargetNote } from "../scoring/notes";
import { summarizeTake, type TakeMetrics } from "../scoring/take";
import { targetMidi, type KeySetting } from "../song/key";
import type { Note } from "../song/types";
import type { RepView } from "./repView";

/** Backing heard before the first note, to find the key and the beat. */
const LEAD_IN_S = 3;
const TAIL_S = 1;

export type TakeOptions = {
  engine: AudioEngine;
  transport: Transport;
  /** Every note of the song. All are shown; those of kind "normal" are scored. */
  notes: Note[];
  /** The learner's key for this song, and how loud the backing plays. */
  settings: KeySetting & { backingGain: number };
  route: Route;
  /** Round-trip delay to allow for when singing along on headphones, seconds. */
  latencyS: number;
  /** How far early or late the singing as a whole may be before it counts against the notes, seconds. */
  slackS: number;
  band: Band;
  rmsMin: number;
  /** Stops the take early: playback ends and nothing is scored. */
  signal?: AbortSignal;
  onScheduled: (view: RepView) => void;
  /** Called when the song has ended and scoring begins. */
  onRecorded?: () => void;
};

export type TakeResult = {
  /** One result for each note of kind "normal". Empty when the take was not scored. */
  notes: NoteResult[];
  /** With nothing but the note count when the take was not scored. */
  metrics: TakeMetrics;
  /** Everything the microphone heard, at `sampleRate`. */
  pcm: Float32Array;
  sampleRate: number;
  /** True when the take was stopped before it finished. */
  aborted: boolean;
  /**
   * False when there are no scores: the take was stopped, or it was sung over
   * speakers, where the backing track reaches the microphone and would be
   * judged along with the voice.
   */
  scored: boolean;
};

/** Resolves when the audio clock reaches `time`, or at once when `signal` aborts. */
function until(ctx: AudioContext, time: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    // Timers and the audio clock drift apart over minutes, so look again when the timer fires.
    const check = () => {
      const left = time - ctx.currentTime;
      if (left <= 0) finish();
      else timer = setTimeout(check, left * 1000);
    };
    if (signal?.aborted) return resolve();
    signal?.addEventListener("abort", finish);
    check();
  });
}

/**
 * One run-through: the whole song over its backing track in the learner's key,
 * recorded from start to finish and then scored note by note. Nothing is
 * scored on speakers, because the microphone hears the backing track too.
 */
export async function runTake(options: TakeOptions): Promise<TakeResult> {
  const { engine, transport, notes, settings, route, signal } = options;
  const ctx = engine.ctx;
  const fromS = Math.max(0, notes[0].t - LEAD_IN_S);
  const toS = Math.min(transport.durationS, Math.max(...notes.map((note) => note.t + note.d)) + TAIL_S);
  const sung = notes.filter((note) => note.kind === "normal");
  const unscored = (pcm: Float32Array, sampleRate: number, aborted: boolean): TakeResult => ({
    notes: [],
    metrics: summarizeTake([], sung),
    pcm,
    sampleRate,
    aborted,
    scored: false,
  });
  if (signal?.aborted) return unscored(new Float32Array(0), ctx.sampleRate, true);

  // Recording starts a moment before the track does and runs to the end.
  const capture = engine.beginCapture();
  const start = ctx.currentTime + Transport.LEAD_S + 0.05;
  const endAt = start + (toS - fromS);
  transport.play({ fromS, toS, at: start, semitones: settings.trackShift, backingGain: settings.backingGain, vocalGain: 0 });
  options.onScheduled({
    startAt: start,
    endAt,
    listenAt: null,
    singAt: start,
    notes: notes.map((note) => ({
      id: note.id,
      t: note.t - fromS,
      d: note.d,
      midi: targetMidi(note.midi, settings),
      text: note.text === "~" ? "" : note.text,
    })),
  });

  await until(ctx, endAt + 0.15, signal);
  const { pcm, sampleRate, startFrame } = capture.end();
  if (signal?.aborted) {
    transport.stop();
    return unscored(pcm, sampleRate, true);
  }
  options.onRecorded?.();
  if (route !== "headphones") return unscored(pcm, sampleRate, false);

  const track = await trackPitchInSlices(pcm, sampleRate, options.band, { rmsMin: options.rmsMin, signal });
  if (!track) return unscored(pcm, sampleRate, true);

  // With backing in the ears the learner is late by the round trip.
  const recordingStart = startFrame / sampleRate;
  const targets: TargetNote[] = sung.map((note) => ({
    id: note.id,
    t: start - recordingStart + (note.t - fromS) + options.latencyS,
    d: note.d,
    midi: targetMidi(note.midi, settings),
  }));
  const result = scoreResponse(track, targets, options.slackS);
  return {
    notes: result.notes,
    metrics: summarizeTake(result.notes, targets),
    pcm,
    sampleRate,
    aborted: false,
    scored: true,
  };
}
