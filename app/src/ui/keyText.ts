import { midiToName } from "../dsp/music";
import type { KeyChoice, KeySetting } from "../song/key";

/** Says in words how a song is fitted: "An octave below the original, track up 3 semitones". */
export function describeKey(key: KeySetting): string {
  const where = key.octaveDrop === 1 ? "An octave below the original" : "At the original pitch";
  const size = Math.abs(key.trackShift);
  if (size === 0) return `${where}, track unchanged`;
  return `${where}, track ${key.trackShift > 0 ? "up" : "down"} ${size} ${size === 1 ? "semitone" : "semitones"}`;
}

export function describeFit(choice: KeyChoice): string {
  return `You sing ${midiToName(choice.lowMidi)} to ${midiToName(choice.highMidi)}, ${Math.round(choice.inComfortPct)}% of it inside your comfortable range`;
}
