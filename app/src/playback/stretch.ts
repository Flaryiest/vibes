import SignalsmithStretch from "signalsmith-stretch";

/** The key-and-tempo node: plays loaded audio at any speed and pitch shift, on a schedule. */
export type StretchNode = AudioNode & {
  addBuffers(channels: Float32Array[]): Promise<number>;
  /** `output` is a time on the audio clock; `input` is a position in the loaded audio, in seconds. */
  schedule(change: { output?: number; active?: boolean; input?: number; rate?: number; semitones?: number }): void;
  latency(): number;
};

/** Creates a stretch node holding `buffer`, always as two channels. */
export async function createStretch(ctx: BaseAudioContext, buffer: AudioBuffer): Promise<StretchNode> {
  const node = (await SignalsmithStretch(ctx)) as StretchNode;
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  await node.addBuffers([left, right]);
  return node;
}
