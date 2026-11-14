import type { AnalyzerConfig } from "../pitch/liveAnalyzer";
import type { LiveWorkerMessage } from "../pitch/live.worker";
import type { PitchFrame } from "../pitch/smoother";
import captureUrl from "./capture.worklet.ts?worker&url";
import {
  BUILT_IN_MIC,
  classifyOutput,
  defaultOutputLabel,
  micConstraints,
  pickMic,
  processingWarnings,
  type OutputKind,
} from "./devices";

export type EngineInfo = {
  sampleRate: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  micLabel: string;
  micIsBuiltIn: boolean;
  outputLabel: string;
  outputKind: OutputKind;
  applied: MediaTrackSettings;
  warnings: string[];
};

/** `startFrame` is the audio-clock frame number of `pcm[0]`. */
export type Capture = { pcm: Float32Array<ArrayBuffer>; sampleRate: number; startFrame: number };

type Chunk = { samples: Float32Array<ArrayBuffer>; frame0: number };

/** One audio context, one pinned microphone, one stream of pitch frames. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private worker: Worker | null = null;
  private track: MediaStreamTrack | null = null;
  private current: EngineInfo | null = null;
  private capture: { chunks: Float32Array[]; startFrame: number } | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private readonly frameListeners = new Set<(frame: PitchFrame) => void>();
  private readonly deviceListeners = new Set<(info: EngineInfo) => void>();
  private readonly micPattern: RegExp;

  constructor(options: { micPattern?: RegExp } = {}) {
    this.micPattern = options.micPattern ?? BUILT_IN_MIC;
  }

  get ctx(): AudioContext {
    if (!this.context) throw new Error("The audio engine has not been started.");
    return this.context;
  }

  get info(): EngineInfo {
    if (!this.current) throw new Error("The audio engine has not been started.");
    return this.current;
  }

  /** Must be called from a click. Call it before any audio plays. */
  async start(): Promise<EngineInfo> {
    // A throwaway request to obtain permission. macOS may route it to the
    // AirPods microphone, so it is stopped at once and never used.
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((track) => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mic = pickMic(devices, this.micPattern);
    if (!mic) {
      const seen = devices.filter((d) => d.kind === "audioinput").map((d) => d.label);
      throw new Error(`Built-in microphone not found. Inputs seen: ${seen.join(", ") || "none"}.`);
    }
    const stream = await navigator.mediaDevices.getUserMedia(micConstraints(mic.deviceId));
    this.track = stream.getAudioTracks()[0];

    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.context = ctx;
    await ctx.audioWorklet.addModule(captureUrl);
    const node = new AudioWorkletNode(ctx, "capture", { numberOfInputs: 1, numberOfOutputs: 1 });
    // Routed through a silent gain so the browser keeps processing the node.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(node).connect(silent).connect(ctx.destination);

    const worker = new Worker(new URL("../pitch/live.worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    const config: AnalyzerConfig = {
      sampleRate: ctx.sampleRate,
      windowSize: 2048,
      band: { minHz: 55, maxHz: 700 },
      clarityMin: 0.5,
      rmsMin: 0,
    };
    this.send({ type: "config", config });
    worker.onmessage = (event: MessageEvent<PitchFrame>) => {
      for (const listener of this.frameListeners) listener(event.data);
    };
    node.port.onmessage = (event: MessageEvent<Chunk>) => {
      const { samples, frame0 } = event.data;
      if (this.capture) {
        if (this.capture.chunks.length === 0) this.capture.startFrame = frame0;
        this.capture.chunks.push(samples.slice());
      }
      this.send({ type: "chunk", samples, frame0 }, [samples.buffer]);
    };

    navigator.mediaDevices.addEventListener("devicechange", this.handleDeviceChange);
    await ctx.resume();
    this.current = await this.readInfo();
    return this.current;
  }

  onFrame(listener: (frame: PitchFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  onDeviceChange(listener: (info: EngineInfo) => void): () => void {
    this.deviceListeners.add(listener);
    return () => {
      this.deviceListeners.delete(listener);
    };
  }

  /** Frames quieter than `rmsMin` are reported as unvoiced. */
  setRmsGate(rmsMin: number): void {
    this.send({ type: "gate", rmsMin });
  }

  /** Starts keeping microphone audio. Call `end()` to get it back. */
  beginCapture(): { end: () => Capture } {
    const capture = { chunks: [] as Float32Array[], startFrame: 0 };
    this.capture = capture;
    return {
      end: () => {
        if (this.capture === capture) this.capture = null;
        const total = capture.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const pcm = new Float32Array(total);
        let offset = 0;
        for (const chunk of capture.chunks) {
          pcm.set(chunk, offset);
          offset += chunk.length;
        }
        return { pcm, sampleRate: this.ctx.sampleRate, startFrame: capture.startFrame };
      },
    };
  }

  private send(message: LiveWorkerMessage, transfer: Transferable[] = []): void {
    this.worker?.postMessage(message, transfer);
  }

  // Chrome fires several events for one physical change, so wait for them to settle.
  private handleDeviceChange = (): void => {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(async () => {
      this.current = await this.readInfo();
      for (const listener of this.deviceListeners) listener(this.current);
    }, 500);
  };

  private async readInfo(): Promise<EngineInfo> {
    const ctx = this.ctx;
    const track = this.track!;
    const outputLabel = defaultOutputLabel(await navigator.mediaDevices.enumerateDevices());
    const applied = track.getSettings();
    const micIsBuiltIn = track.readyState === "live" && this.micPattern.test(track.label);
    const warnings = processingWarnings(applied);
    if (!micIsBuiltIn) warnings.push("The live microphone is not the built-in one. Scoring must be blocked.");
    return {
      sampleRate: ctx.sampleRate,
      baseLatencyMs: ctx.baseLatency * 1000,
      outputLatencyMs: ctx.outputLatency * 1000,
      micLabel: track.label,
      micIsBuiltIn,
      outputLabel,
      outputKind: classifyOutput(outputLabel),
      applied,
      warnings,
    };
  }
}
