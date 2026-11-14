import { Chunker } from "./chunker";

// Globals of the AudioWorklet scope, which the DOM typings do not include.
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

/** Posts microphone audio to the main thread in 512-frame chunks stamped with the clock frame. */
class CaptureProcessor extends AudioWorkletProcessor {
  private readonly chunker = new Chunker(512, (samples, frame0) => {
    this.port.postMessage({ samples, frame0 }, [samples.buffer]);
  });

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (channel) this.chunker.push(channel, currentFrame);
    return true;
  }
}

registerProcessor("capture", CaptureProcessor);
