import { createBandMpm, type Band, type Estimate } from "./bandMpm";
import { LiveSmoother, type PitchFrame } from "./smoother";

export type AnalyzerConfig = {
  sampleRate: number;
  windowSize: number;
  band: Band;
  clarityMin: number;
  rmsMin: number;
};

/** Keeps the most recent window of audio and produces one pitch frame per chunk. */
export class LiveAnalyzer {
  private readonly config: AnalyzerConfig;
  private readonly window: Float32Array;
  private readonly detect: (input: Float32Array) => Estimate;
  private readonly smoother = new LiveSmoother();
  private filled = 0;
  private rmsMin: number;

  constructor(config: AnalyzerConfig) {
    this.config = config;
    this.window = new Float32Array(config.windowSize);
    this.detect = createBandMpm(config.windowSize, config.sampleRate, config.band);
    this.rmsMin = config.rmsMin;
  }

  setRmsMin(value: number): void {
    this.rmsMin = value;
  }

  /** `frame0` is the audio-clock frame number of the chunk's first sample. */
  push(samples: Float32Array, frame0: number): PitchFrame | null {
    const size = this.config.windowSize;
    const n = samples.length;
    if (n >= size) {
      this.window.set(samples.subarray(n - size));
    } else {
      this.window.copyWithin(0, n);
      this.window.set(samples, size - n);
    }
    this.filled = Math.min(size, this.filled + n);
    if (this.filled < size) return null;

    let sum = 0;
    for (let i = 0; i < n; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / n);

    const estimate = this.detect(this.window);
    const voiced = estimate.hz !== null && estimate.clarity >= this.config.clarityMin && rms >= this.rmsMin;
    const t = (frame0 + n - size / 2) / this.config.sampleRate;
    return this.smoother.push({ t, hz: voiced ? estimate.hz : null, clarity: estimate.clarity, rms });
  }
}
