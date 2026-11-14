import type { AudioEngine } from "../audio/engine";
import type { Route } from "../audio/latency";
import { hzToMidi } from "../dsp/music";
import type { Band } from "../pitch/bandMpm";
import { trackPitch } from "../pitch/track";
import { playGuide } from "../playback/guide";
import { Transport } from "../playback/transport";
import { scoreResponse, type NoteResult, type TargetNote } from "../scoring/notes";
import { targetMidi, type KeySetting } from "../song/key";
import type { Phrase } from "../song/phrases";
import type { F0 } from "../song/types";
import { STEPS, isCleanRep, type Step } from "./phraseLadder";
import type { RepView } from "./repView";

/** Backing heard before the phrase starts, so the entry can be felt. */
const LEAD_IN_S = 1.5;
const TAIL_S = 0.4;
/** Silence between the model and the response. */
const GAP_S = 0.3;
const PRE_ROLL_S = 0.3;

export type PhraseRepOptions = {
  engine: AudioEngine;
  transport: Transport;
  phrase: Phrase;
  step: Step;
  key: KeySetting;
  backingGain: number;
  route: Route;
  /** Round-trip delay to allow for when the learner sings along with the backing, seconds. */
  latencyS: number;
  /** How far early or late the singing may be before it counts against the notes, seconds. */
  slackS: number;
  band: Band;
  rmsMin: number;
  f0: F0;
  onScheduled: (view: RepView) => void;
};

export type PhraseRepResult = { notes: NoteResult[]; clean: boolean | null };

const until = (ctx: AudioContext, time: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, time - ctx.currentTime) * 1000));

/**
 * One repetition of a phrase at a given step of the ladder: the model (the
 * original, or the guide voice over the backing), then the learner's response.
 * On speakers nothing plays during the response, so the microphone hears only
 * the learner; on headphones the backing continues underneath.
 */
export async function runPhraseRep(options: PhraseRepOptions): Promise<PhraseRepResult> {
  const { engine, transport, phrase, step, key, route } = options;
  const ctx = engine.ctx;
  const info = STEPS[step];
  const rate = info.rate;
  const fromS = Math.max(0, phrase.t0 - LEAD_IN_S);
  const toS = Math.min(transport.durationS, phrase.t1 + TAIL_S);
  const length = (toS - fromS) / rate;
  const start = ctx.currentTime + Transport.LEAD_S + 0.05;

  const hasCall = info.call !== "none";
  const listenAt = hasCall ? start : null;
  const singAt = info.respond ? (hasCall ? start + length + GAP_S : start) : null;
  const endAt = (singAt ?? start) + length;

  const notes = phrase.notes.map((note) => ({
    id: note.id,
    t: (note.t - fromS) / rate,
    d: note.d / rate,
    midi: targetMidi(note.midi, key),
    text: note.text === "~" ? "" : note.text,
  }));
  const section = { fromS, toS, rate, semitones: key.trackShift };

  let curve: RepView["curve"];
  if (info.call === "original") {
    // The original singer's line, moved into the octave the learner will sing in.
    curve = [];
    const first = Math.ceil(fromS / options.f0.hopS);
    const last = Math.min(options.f0.hz.length - 1, Math.floor(toS / options.f0.hopS));
    for (let i = first; i <= last; i++) {
      if (options.f0.hz[i] <= 0) continue;
      curve.push({ t: (i * options.f0.hopS - fromS) / rate, midi: targetMidi(hzToMidi(options.f0.hz[i]), key) });
    }
    transport.play({ ...section, at: start, backingGain: options.backingGain, vocalGain: 0.9 });
  } else if (info.call === "guide") {
    transport.play({ ...section, at: start, backingGain: options.backingGain });
    playGuide(ctx, notes, start);
  }
  // During the response the backing plays only on headphones, or when the response is spoken and not scored.
  if (singAt !== null && (route === "headphones" || !info.scored)) {
    transport.play({ ...section, at: singAt, backingGain: options.backingGain });
  }
  options.onScheduled({ startAt: start, endAt, listenAt, singAt, notes, curve });

  if (singAt === null || !info.scored) {
    await until(ctx, endAt);
    return { notes: [], clean: null };
  }

  await until(ctx, singAt - PRE_ROLL_S);
  const capture = engine.beginCapture();
  await until(ctx, endAt + 0.15);
  const { pcm, sampleRate, startFrame } = capture.end();
  const recordingStart = startFrame / sampleRate;
  const track = trackPitch(pcm, sampleRate, options.band, { rmsMin: options.rmsMin });

  // Only notes sung at pitch are scored. With backing in the ears the learner is late by the round trip.
  const delay = route === "headphones" ? options.latencyS : 0;
  const scored = phrase.notes.filter((note) => note.kind === "normal");
  const targets: TargetNote[] = scored.map((note) => ({
    id: note.id,
    t: singAt - recordingStart + (note.t - fromS) / rate + delay,
    d: note.d / rate,
    midi: targetMidi(note.midi, key),
  }));
  const result = scoreResponse(track, targets, options.slackS);
  return {
    notes: result.notes,
    clean: isCleanRep(
      result.notes,
      targets.map((target) => target.d),
    ),
  };
}
