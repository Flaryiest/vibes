import { stemUrl } from "../song/package";
import { createStretch, type StretchNode } from "./stretch";

/** A stretch of the song that is playing or scheduled. Times are on the audio clock unless marked as song time. */
export type Playback = { startCtxTime: number; endCtxTime: number; fromS: number; toS: number; rate: number };

export type PlayOptions = {
  /** Section of the song, in song seconds. */
  fromS: number;
  toS: number;
  /** When to start, on the audio clock. Schedule at least `Transport.LEAD_S` ahead. */
  at: number;
  /** 1 is full speed. The stretcher sounds best from 0.75 up. */
  rate?: number;
  /** Key change applied to both tracks. */
  semitones?: number;
  /** 0 to 1. */
  backingGain?: number;
  /** 0 silences the original vocal. */
  vocalGain?: number;
};

/** Plays a song's instrumental and original vocal together, at any key and tempo. */
export class Transport {
  /** The stretcher needs this much notice to start exactly on time. */
  static readonly LEAD_S = 0.25;

  private readonly ctx: AudioContext;
  private readonly tracks: { node: StretchNode; gain: GainNode }[];
  private current: Playback | null = null;
  readonly durationS: number;

  private constructor(ctx: AudioContext, tracks: { node: StretchNode; gain: GainNode }[], durationS: number) {
    this.ctx = ctx;
    this.tracks = tracks;
    this.durationS = durationS;
  }

  static async load(ctx: AudioContext, songId: string): Promise<Transport> {
    const decode = async (stem: "instrumental" | "vocals") => {
      const response = await fetch(stemUrl(songId, stem));
      if (!response.ok) throw new Error(`This song package is damaged: ${stem}.flac is missing.`);
      return ctx.decodeAudioData(await response.arrayBuffer());
    };
    const buffers = await Promise.all([decode("instrumental"), decode("vocals")]);
    const tracks = await Promise.all(
      buffers.map(async (buffer) => {
        const node = await createStretch(ctx, buffer);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        node.connect(gain).connect(ctx.destination);
        return { node, gain };
      }),
    );
    return new Transport(ctx, tracks, buffers[0].duration);
  }

  play(options: PlayOptions): Playback {
    const { fromS, toS, at, rate = 1, semitones = 0, backingGain = 0.5, vocalGain = 0 } = options;
    const endCtxTime = at + (toS - fromS) / rate;
    const levels = [backingGain, vocalGain];
    this.tracks.forEach(({ node, gain }, i) => {
      gain.gain.setValueAtTime(levels[i], Math.max(this.ctx.currentTime, at - 0.02));
      // Both tracks get the identical schedule, which keeps them aligned sample for sample.
      node.schedule({ output: at, active: true, input: fromS, rate, semitones });
      node.schedule({ output: endCtxTime, active: false });
    });
    this.current = { startCtxTime: at, endCtxTime, fromS, toS, rate };
    return this.current;
  }

  /** Where in the song the playback is at a moment on the audio clock, or null when nothing is playing then. */
  songTimeAt(ctxTime: number): number | null {
    const playing = this.current;
    if (!playing || ctxTime < playing.startCtxTime || ctxTime > playing.endCtxTime) return null;
    return playing.fromS + (ctxTime - playing.startCtxTime) * playing.rate;
  }

  stop(): void {
    const now = this.ctx.currentTime;
    for (const { node, gain } of this.tracks) {
      gain.gain.cancelScheduledValues(0);
      gain.gain.setValueAtTime(0, now);
      node.schedule({ output: now, active: false });
    }
    this.current = null;
  }

  dispose(): void {
    this.stop();
    for (const { node, gain } of this.tracks) {
      node.disconnect();
      gain.disconnect();
    }
  }
}
