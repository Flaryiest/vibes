import { hzToMidi } from "../dsp/music";
import { median } from "../dsp/stats";
import type { F0Track } from "../pitch/track";
import type { RangeProfile } from "./exercises";

const voicedMidi = (track: F0Track): number[] =>
  Array.from(track.hz)
    .filter((hz) => hz > 0)
    .map(hzToMidi);

/** The typical pitch of a spoken clip as a MIDI number, or null when under half a second was voiced. */
export function speakingPitch(track: F0Track): number | null {
  const midi = voicedMidi(track);
  return midi.length * track.hopS < 0.5 ? null : median(midi);
}

/** The lowest pitch held for `holdS` seconds in total, so a brief dip or crack is ignored. */
export function lowestHeld(track: F0Track, holdS = 0.25): number | null {
  const midi = voicedMidi(track).sort((a, b) => a - b);
  const frames = Math.ceil(holdS / track.hopS);
  return midi.length < frames ? null : midi[frames - 1];
}

/** The highest pitch held for `holdS` seconds in total. */
export function highestHeld(track: F0Track, holdS = 0.25): number | null {
  const midi = voicedMidi(track).sort((a, b) => a - b);
  const frames = Math.ceil(holdS / track.hopS);
  return midi.length < frames ? null : midi[midi.length - frames];
}

export type ProfileResult = { ok: true; profile: RangeProfile } | { ok: false; reason: string };

/** Turns the three measurements into a profile. No voice-type label: at 18 the voice is still settling. */
export function buildProfile(speaking: number, low: number, high: number): ProfileResult {
  const comfortLow = Math.round(low);
  const comfortHigh = Math.round(high);
  if (comfortHigh - comfortLow < 5) {
    return {
      ok: false,
      reason: "That range is under five semitones. Try the slides again, going a little lower and a little higher.",
    };
  }
  const speakingMidi = Math.min(comfortHigh, Math.max(comfortLow, Math.round(speaking)));
  return { ok: true, profile: { speakingMidi, comfortLow, comfortHigh } };
}
