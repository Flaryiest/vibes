const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export const centsBetween = (hz: number, refHz: number): number => 1200 * Math.log2(hz / refHz);

export function midiToName(midi: number): string {
  const m = Math.round(midi);
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

export function describePitch(hz: number): { name: string; cents: number } {
  const midi = hzToMidi(hz);
  const nearest = Math.round(midi);
  // "+ 0" turns a negative zero into zero.
  return { name: midiToName(nearest), cents: Math.round((midi - nearest) * 100) + 0 };
}
