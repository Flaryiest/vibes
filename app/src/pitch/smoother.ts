import { hzToMidi, midiToHz } from "../dsp/music";
import { median } from "../dsp/stats";

/** One pitch estimate. `t` is seconds on the audio clock at the window center. */
export type PitchFrame = { t: number; hz: number | null; clarity: number; rms: number };

/**
 * Median-of-N smoothing with an octave guard. A jump of 1100-1300 cents that
 * lasts less than `octaveHoldS` is treated as a detector error and replaced by
 * the previous pitch; one that lasts longer is accepted as real.
 */
export class LiveSmoother {
  private recent: number[] = [];
  private lastVoicedT = -Infinity;
  private jumpStartT: number | null = null;
  private readonly medianSize: number;
  private readonly octaveHoldS: number;
  private readonly resetGapS: number;

  constructor(medianSize = 5, octaveHoldS = 0.06, resetGapS = 0.15) {
    this.medianSize = medianSize;
    this.octaveHoldS = octaveHoldS;
    this.resetGapS = resetGapS;
  }

  reset(): void {
    this.recent = [];
    this.jumpStartT = null;
  }

  push(frame: PitchFrame): PitchFrame {
    if (frame.hz === null) return frame;
    if (frame.t - this.lastVoicedT > this.resetGapS) this.reset();
    this.lastVoicedT = frame.t;

    const midi = hzToMidi(frame.hz);
    if (this.recent.length > 0) {
      const reference = median(this.recent);
      const jumpCents = Math.abs(midi - reference) * 100;
      if (jumpCents >= 1100 && jumpCents <= 1300) {
        if (this.jumpStartT === null) this.jumpStartT = frame.t;
        if (frame.t - this.jumpStartT < this.octaveHoldS) return { ...frame, hz: midiToHz(reference) };
        this.recent = [];
      }
    }
    this.jumpStartT = null;

    this.recent.push(midi);
    if (this.recent.length > this.medianSize) this.recent.shift();
    return { ...frame, hz: midiToHz(median(this.recent)) };
  }
}
