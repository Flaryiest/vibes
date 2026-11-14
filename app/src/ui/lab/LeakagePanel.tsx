import { useState } from "react";
import type { AudioEngine } from "../../audio/engine";
import { noiseGate, voicedPct } from "../../lab/measure";
import type { PitchFrame } from "../../pitch/smoother";
import { Panel } from "./Panel";
import { buttonClass, noteClass, quietButtonClass } from "./styles";

const SECONDS = 20;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function LeakagePanel({ engine }: { engine: AudioEngine }) {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [volume, setVolume] = useState(0.5);
  const [gate, setGate] = useState<number | null>(null);
  const [leak, setLeak] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function measureRoom() {
    setBusy(true);
    engine.setRmsGate(0);
    const levels: number[] = [];
    const unsubscribe = engine.onFrame((frame) => levels.push(frame.rms));
    await wait(3000);
    unsubscribe();
    const value = noiseGate(levels);
    engine.setRmsGate(value);
    setGate(value);
    setBusy(false);
  }

  async function load(file: File) {
    setBuffer(await engine.ctx.decodeAudioData(await file.arrayBuffer()));
  }

  async function play(measure: boolean) {
    if (!buffer) return;
    setBusy(true);
    const source = engine.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = engine.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(engine.ctx.destination);
    const frames: PitchFrame[] = [];
    const unsubscribe = measure ? engine.onFrame((frame) => frames.push(frame)) : () => {};
    // Start partway in, past any quiet introduction.
    source.start(0, Math.min(30, buffer.duration / 2), SECONDS);
    await wait(SECONDS * 1000 + 300);
    unsubscribe();
    gain.disconnect();
    if (measure) setLeak(voicedPct(frames));
    setBusy(false);
  }

  return (
    <Panel title="Room and speakers">
      <p className={noteClass}>
        First measure the room so quiet background sound is ignored. Then play a song with nobody singing to see how
        much of it the microphone mistakes for a voice.
      </p>
      <div className="flex flex-wrap items-center gap-5">
        <button onClick={measureRoom} disabled={busy} className={buttonClass}>
          Measure room noise
        </button>
        <span className="text-sm text-mist tabular-nums">
          {gate === null
            ? "Takes 3 seconds. Stay quiet."
            : `Ignoring sound below −${Math.abs(Math.round(20 * Math.log10(gate)))} dB`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
        <input
          type="file"
          accept="audio/*"
          aria-label="Song file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void load(file);
          }}
          className="text-mist file:mr-4 file:rounded-md file:border file:border-solid file:border-rule file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-chalk"
        />
        <label className="flex items-center gap-3 text-mist">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="accent-chalk"
          />
          <span className="w-8 tabular-nums text-chalk">{Math.round(volume * 100)}</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <button onClick={() => play(true)} disabled={!buffer || busy} className={buttonClass}>
          Play {SECONDS} seconds and measure
        </button>
        <button onClick={() => play(false)} disabled={!buffer || busy} className={quietButtonClass}>
          Just play {SECONDS} seconds
        </button>
      </div>

      {leak !== null && (
        <p className="text-sm tabular-nums">
          <span className={leak >= 5 ? "text-signal" : ""}>{leak.toFixed(1)}% of the time</span>{" "}
          <span className="text-mist">the song alone read as a voice. The target is under 5%.</span>
        </p>
      )}
    </Panel>
  );
}
