import { midiToHz } from "../dsp/music";

export type GuideNote = { t: number; d: number; midi: number };

const ATTACK_S = 0.02;
const RELEASE_S = 0.06;

/**
 * Resonances of an open "ah". Brighter than "oo", so the lowest notes still
 * carry on laptop speakers, which reproduce little below about 150 Hz.
 */
const FORMANTS = [
  { hz: 700, q: 5, gain: 1 },
  { hz: 1150, q: 7, gain: 0.5 },
  { hz: 2500, q: 9, gain: 0.2 },
];

export function envelope(start: number, d: number): { attackEnd: number; releaseStart: number; end: number } {
  return { attackEnd: start + ATTACK_S, releaseStart: start + d - RELEASE_S, end: start + d };
}

/**
 * Sings `notes` in a plain voice-like tone, always at the written pitch, so the
 * model is in the learner's own octave. Note times are relative to `startAt`,
 * which is a time on the audio clock.
 */
export function playGuide(
  ctx: AudioContext,
  notes: GuideNote[],
  startAt: number,
  volume = 0.9,
): { endTime: number; stop: () => void } {
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  const oscillators: OscillatorNode[] = [];
  let endTime = startAt;

  for (const note of notes) {
    const start = startAt + note.t;
    const { attackEnd, releaseStart, end } = envelope(start, note.d);
    const oscillator = ctx.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = midiToHz(note.midi);
    const shape = ctx.createGain();
    shape.gain.setValueAtTime(0, start);
    shape.gain.linearRampToValueAtTime(1, attackEnd);
    shape.gain.setValueAtTime(1, releaseStart);
    shape.gain.linearRampToValueAtTime(0, end);
    for (const formant of FORMANTS) {
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = formant.hz;
      filter.Q.value = formant.q;
      const level = ctx.createGain();
      level.gain.value = formant.gain;
      oscillator.connect(filter).connect(level).connect(shape);
    }
    shape.connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
    oscillators.push(oscillator);
    endTime = Math.max(endTime, end);
  }

  const release = () => master.disconnect();
  const timer = setTimeout(release, Math.max(0, endTime - ctx.currentTime + 0.2) * 1000);
  return {
    endTime,
    stop: () => {
      clearTimeout(timer);
      for (const oscillator of oscillators) {
        try {
          oscillator.stop();
        } catch {
          // Already stopped.
        }
      }
      release();
    },
  };
}
