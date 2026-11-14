declare module "signalsmith-stretch" {
  /** Resolves to an AudioNode with extra methods; see `StretchNode` in `stretch.ts`. */
  export default function SignalsmithStretch(ctx: BaseAudioContext, options?: AudioWorkletNodeOptions): Promise<AudioNode>;
}
